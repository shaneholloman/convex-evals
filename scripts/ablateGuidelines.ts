#!/usr/bin/env bun
/**
 * Generate ablation markdown files for guideline section analysis.
 *
 * Parses the guidelines markdown by headings and generates variants
 * with individual sections removed.
 *
 * Top-level ablation (default):
 *   ablation/full.md                        - full guidelines
 *   ablation/without_<section>.md (xN)      - one per top-level section removed
 *
 * Subsection ablation (--section <name>):
 *   ablation/full.md                        - full guidelines
 *   ablation/without_<parent>/<subsection>.md - one per child of the named section
 *
 * Each file is the rendered markdown that CUSTOM_GUIDELINES_PATH would point to.
 */
import { mkdirSync, writeFileSync } from "fs";
import { encode } from "gpt-tokenizer/encoding/cl100k_base";
import { getGuidelines } from "../runner/models/guidelines.js";

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

interface Section {
  heading: string;
  slug: string;
  level: number;
  startLine: number;
  endLine: number;
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Parse the guidelines markdown into sections based on headings.
 * Each section spans from its heading line to just before the next
 * heading of the same or higher level (or end of file).
 */
function parseSections(md: string, targetLevel: number): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1].length === targetLevel) {
      sections.push({
        heading: match[2],
        slug: slugify(match[2]),
        level: targetLevel,
        startLine: i,
        endLine: lines.length,
      });
    }
  }

  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].endLine = sections[i + 1].startLine;
  }

  return sections;
}

function removeSectionFromMarkdown(
  md: string,
  section: Section,
): string {
  const lines = md.split("\n");
  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine);
  return [...before, ...after].join("\n");
}

function generateTopLevelAblation(): VariantInfo[] {
  const fullMd = getGuidelines();
  writeFileSync(`${ABLATION_DIR}/full.md`, fullMd);

  const variants: VariantInfo[] = [
    {
      name: "full",
      file: `${ABLATION_DIR}/full.md`,
      chars: fullMd.length,
      tokens: countTokens(fullMd),
    },
  ];

  const sections = parseSections(fullMd, 2);

  for (const section of sections) {
    const md = removeSectionFromMarkdown(fullMd, section);
    const filename = `${ABLATION_DIR}/without_${section.slug}.md`;
    writeFileSync(filename, md);

    variants.push({
      name: `without_${section.slug}`,
      file: filename,
      chars: md.length,
      tokens: countTokens(md),
    });
  }

  return variants;
}

function generateSubsectionAblation(parentSlug: string): VariantInfo[] {
  const fullMd = getGuidelines();
  const topLevel = parseSections(fullMd, 2);
  const parent = topLevel.find((s) => s.slug === parentSlug);

  if (!parent) {
    console.error(
      `Section "${parentSlug}" not found. Available top-level sections:`,
    );
    console.error(topLevel.map((s) => s.slug).join(", "));
    process.exit(1);
  }

  const subDir = `${ABLATION_DIR}/without_${parentSlug}`;
  mkdirSync(subDir, { recursive: true });

  writeFileSync(`${ABLATION_DIR}/full.md`, fullMd);

  const variants: VariantInfo[] = [
    {
      name: "full",
      file: `${ABLATION_DIR}/full.md`,
      chars: fullMd.length,
      tokens: countTokens(fullMd),
    },
  ];

  const parentContent = fullMd
    .split("\n")
    .slice(parent.startLine, parent.endLine)
    .join("\n");
  const subsections = parseSections(parentContent, 3);

  if (subsections.length === 0) {
    console.error(
      `Section "${parentSlug}" has no subsections to ablate (only individual guidelines).`,
    );
    process.exit(1);
  }

  for (const sub of subsections) {
    const absoluteSub: Section = {
      ...sub,
      startLine: sub.startLine + parent.startLine,
      endLine: sub.endLine + parent.startLine,
    };
    const md = removeSectionFromMarkdown(fullMd, absoluteSub);
    const filename = `${subDir}/${sub.slug}.md`;
    writeFileSync(filename, md);

    variants.push({
      name: `without_${parentSlug}/${sub.slug}`,
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
