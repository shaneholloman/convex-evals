#!/usr/bin/env bun
/**
 * Generate ablation markdown files for guideline section analysis.
 *
 * Produces:
 *   ablation/full.md                        — full rendered guidelines
 *   ablation/without_<section>.md (x10)     — one per top-level section removed
 *
 * Each file is the rendered markdown that CUSTOM_GUIDELINES_PATH would point to.
 */
import { mkdirSync, writeFileSync } from "fs";
import { encode } from "gpt-tokenizer/encoding/cl100k_base";
import {
  CONVEX_GUIDELINES,
  renderGuidelines,
  type GuidelineSection,
} from "../runner/models/guidelines.js";

const ABLATION_DIR = "ablation";

function countTokens(text: string): number {
  return encode(text).length;
}

function main(): void {
  mkdirSync(ABLATION_DIR, { recursive: true });

  // Full guidelines
  const fullMd = renderGuidelines(CONVEX_GUIDELINES);
  writeFileSync(`${ABLATION_DIR}/full.md`, fullMd);

  const topLevelSections = CONVEX_GUIDELINES.children.filter(
    (c): c is GuidelineSection => c.kind === "section",
  );

  interface VariantInfo {
    name: string;
    file: string;
    chars: number;
    tokens: number;
  }

  const variants: VariantInfo[] = [
    {
      name: "full",
      file: `${ABLATION_DIR}/full.md`,
      chars: fullMd.length,
      tokens: countTokens(fullMd),
    },
  ];

  for (const sectionToRemove of topLevelSections) {
    // Build a new tree with this section filtered out
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

  // Print summary table
  console.log("\nAblation variants generated:\n");
  console.log(
    `${"Variant".padEnd(45)} | ${"Chars".padStart(7)} | ${"Tokens".padStart(7)} | File`,
  );
  console.log("-".repeat(90));

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
      `${v.name.padEnd(45)} | ${String(v.chars).padStart(7)}${charDiff.padEnd(10)} | ${String(v.tokens).padStart(7)}${tokenDiff.padEnd(10)} | ${v.file}`,
    );
  }

  console.log(
    `\nGenerated ${variants.length} files (1 baseline + ${variants.length - 1} ablations)`,
  );
}

main();
