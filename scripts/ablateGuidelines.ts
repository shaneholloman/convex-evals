#!/usr/bin/env bun
/**
 * Generate ablation markdown files for guideline section analysis.
 *
 * Top-level ablation (default):
 *   ablation/full.md                        — full rendered guidelines
 *   ablation/without_<section>.md (x10)     — one per top-level section removed
 *
 * Subsection ablation (--section <name>):
 *   ablation/full.md                        — full rendered guidelines
 *   ablation/without_<parent>/<subsection>.md — one per child of the named section
 *
 * Each file is the rendered markdown that CUSTOM_GUIDELINES_PATH would point to.
 */
import { mkdirSync, writeFileSync } from "fs";
import { encode } from "gpt-tokenizer/encoding/cl100k_base";
import {
  CONVEX_GUIDELINES,
  renderGuidelines,
  type GuidelineSection,
  type Guideline,
} from "../runner/models/guidelines.js";

const ABLATION_DIR = "ablation";

function countTokens(text: string): number {
  return encode(text).length;
}

interface VariantInfo {
  name: string;
  file: string;
  chars: number;
  tokens: number;
}

/** Find a top-level section by name. */
function findSection(name: string): GuidelineSection | null {
  for (const child of CONVEX_GUIDELINES.children) {
    if (child.kind === "section" && child.name === name) {
      return child;
    }
  }
  return null;
}

/**
 * Build a copy of the full guidelines tree with one subsection of a
 * given parent section removed.
 */
function removeSubsection(
  parentName: string,
  subsectionToRemove: GuidelineSection | Guideline,
): GuidelineSection {
  return {
    kind: "section",
    name: CONVEX_GUIDELINES.name,
    children: CONVEX_GUIDELINES.children.map((topLevel) => {
      if (topLevel.kind !== "section" || topLevel.name !== parentName) {
        return topLevel;
      }
      return {
        ...topLevel,
        children: topLevel.children.filter((c) => c !== subsectionToRemove),
      };
    }),
  };
}

function generateTopLevelAblation(): VariantInfo[] {
  const fullMd = renderGuidelines(CONVEX_GUIDELINES);
  writeFileSync(`${ABLATION_DIR}/full.md`, fullMd);

  const variants: VariantInfo[] = [
    {
      name: "full",
      file: `${ABLATION_DIR}/full.md`,
      chars: fullMd.length,
      tokens: countTokens(fullMd),
    },
  ];

  const topLevelSections = CONVEX_GUIDELINES.children.filter(
    (c): c is GuidelineSection => c.kind === "section",
  );

  for (const sectionToRemove of topLevelSections) {
    const filteredChildren = CONVEX_GUIDELINES.children.filter(
      (c) => c !== sectionToRemove,
    );
    const filteredRoot: GuidelineSection = {
      kind: "section",
      name: CONVEX_GUIDELINES.name,
      children: filteredChildren,
    };

    const md = renderGuidelines(filteredRoot);
    const filename = `${ABLATION_DIR}/without_${sectionToRemove.name}.md`;
    writeFileSync(filename, md);

    variants.push({
      name: `without_${sectionToRemove.name}`,
      file: filename,
      chars: md.length,
      tokens: countTokens(md),
    });
  }

  return variants;
}

function generateSubsectionAblation(parentName: string): VariantInfo[] {
  const parent = findSection(parentName);
  if (!parent) {
    console.error(
      `Section "${parentName}" not found. Available top-level sections:`,
    );
    const names = CONVEX_GUIDELINES.children
      .filter((c): c is GuidelineSection => c.kind === "section")
      .map((c) => c.name);
    console.error(names.join(", "));
    process.exit(1);
  }

  const subDir = `${ABLATION_DIR}/without_${parentName}`;
  mkdirSync(subDir, { recursive: true });

  // Full guidelines as baseline
  const fullMd = renderGuidelines(CONVEX_GUIDELINES);
  writeFileSync(`${ABLATION_DIR}/full.md`, fullMd);

  const variants: VariantInfo[] = [
    {
      name: "full",
      file: `${ABLATION_DIR}/full.md`,
      chars: fullMd.length,
      tokens: countTokens(fullMd),
    },
  ];

  const subsections = parent.children.filter(
    (c): c is GuidelineSection => c.kind === "section",
  );

  if (subsections.length === 0) {
    console.error(
      `Section "${parentName}" has no subsections to ablate (only individual guidelines).`,
    );
    process.exit(1);
  }

  for (const sub of subsections) {
    const modified = removeSubsection(parentName, sub);
    const md = renderGuidelines(modified);
    const filename = `${subDir}/${sub.name}.md`;
    writeFileSync(filename, md);

    variants.push({
      name: `without_${parentName}/${sub.name}`,
      file: filename,
      chars: md.length,
      tokens: countTokens(md),
    });
  }

  return variants;
}

function printSummary(variants: VariantInfo[]): void {
  console.log("\nAblation variants generated:\n");
  console.log(
    `${"Variant".padEnd(50)} | ${"Chars".padStart(7)} | ${"Tokens".padStart(7)} | File`,
  );
  console.log("-".repeat(100));

  for (const v of variants) {
    const charDiff =
      v.name === "full"
        ? ""
        : ` (${v.chars - variants[0].chars > 0 ? "+" : ""}${v.chars - variants[0].chars})`;
    const tokenDiff =
      v.name === "full"
        ? ""
        : ` (${v.tokens - variants[0].tokens > 0 ? "+" : ""}${v.tokens - variants[0].tokens})`;

    console.log(
      `${v.name.padEnd(50)} | ${String(v.chars).padStart(7)}${charDiff.padEnd(10)} | ${String(v.tokens).padStart(7)}${tokenDiff.padEnd(10)} | ${v.file}`,
    );
  }

  console.log(
    `\nGenerated ${variants.length} files (1 baseline + ${variants.length - 1} ablations)`,
  );
}

function main(): void {
  mkdirSync(ABLATION_DIR, { recursive: true });

  // Parse --section flag
  const args = process.argv.slice(2);
  let sectionName: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--section" && args[i + 1]) {
      sectionName = args[i + 1];
      i++;
    }
  }

  const variants = sectionName
    ? generateSubsectionAblation(sectionName)
    : generateTopLevelAblation();

  printSummary(variants);
}

main();
