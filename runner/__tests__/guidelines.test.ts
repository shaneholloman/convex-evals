import { describe, it, expect } from "bun:test";
import {
  CONVEX_GUIDELINES,
  renderGuidelines,
  type Guideline,
  type GuidelineSection,
} from "../models/guidelines.js";

describe("CONVEX_GUIDELINES structure", () => {
  it("is a section node", () => {
    expect(CONVEX_GUIDELINES.kind).toBe("section");
  });

  it("has the name 'convex_guidelines'", () => {
    expect(CONVEX_GUIDELINES.name).toBe("convex_guidelines");
  });

  it("has children", () => {
    expect(CONVEX_GUIDELINES.children.length).toBeGreaterThan(0);
  });

  it("contains known top-level sections", () => {
    const topLevelNames = CONVEX_GUIDELINES.children
      .filter((c): c is GuidelineSection => c.kind === "section")
      .map((c) => c.name);
    expect(topLevelNames).toContain("function_guidelines");
    expect(topLevelNames).toContain("schema_guidelines");
    expect(topLevelNames).toContain("query_guidelines");
    expect(topLevelNames).toContain("mutation_guidelines");
    expect(topLevelNames).toContain("action_guidelines");
  });

  function countGuidelines(node: Guideline | GuidelineSection): number {
    if (node.kind === "guideline") return 1;
    return node.children.reduce(
      (sum, child) => sum + countGuidelines(child),
      0,
    );
  }

  it("contains a meaningful number of guidelines", () => {
    const count = countGuidelines(CONVEX_GUIDELINES);
    expect(count).toBeGreaterThan(20);
  });
});

describe("renderGuidelines", () => {
  it("renders a guideline node as a bullet point", () => {
    const node: Guideline = { kind: "guideline", content: "Do X" };
    expect(renderGuidelines(node)).toBe("- Do X\n");
  });

  it("renders a section node with heading", () => {
    const node: GuidelineSection = {
      kind: "section",
      name: "my_section",
      children: [],
    };
    const result = renderGuidelines(node);
    expect(result).toContain("# My section");
  });

  it("capitalizes first word in section name", () => {
    const node: GuidelineSection = {
      kind: "section",
      name: "function_guidelines",
      children: [],
    };
    const result = renderGuidelines(node);
    expect(result).toContain("# Function guidelines");
  });

  it("uses increasing header depth for nested sections", () => {
    const node: GuidelineSection = {
      kind: "section",
      name: "outer",
      children: [
        {
          kind: "section",
          name: "inner",
          children: [{ kind: "guideline", content: "Deep rule" }],
        },
      ],
    };
    const result = renderGuidelines(node);
    expect(result).toContain("# Outer");
    expect(result).toContain("## Inner");
    expect(result).toContain("- Deep rule");
  });

  it("renders the full guidelines without error", () => {
    const result = renderGuidelines(CONVEX_GUIDELINES);
    expect(result.length).toBeGreaterThan(500);
    expect(result).toContain("Function guidelines");
    expect(result).toContain("Schema guidelines");
  });

  it("accepts a custom starting header level", () => {
    const node: GuidelineSection = {
      kind: "section",
      name: "test",
      children: [{ kind: "guideline", content: "rule" }],
    };
    const result = renderGuidelines(node, "###");
    expect(result).toContain("### Test");
  });
});
