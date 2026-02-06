import { describe, it, expect, beforeEach, afterEach, jest, spyOn } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import {
  sanitizeOutput,
  appendLog,
  appendLogBlock,
  logCmdResults,
  logInfo,
  logVitestResults,
  runCommandStep,
} from "../logging.js";

describe("sanitizeOutput", () => {
  it("strips CSI escape sequences", () => {
    expect(sanitizeOutput("\x1B[31mred text\x1B[0m")).toBe("red text");
  });

  it("strips OSC sequences terminated with BEL", () => {
    expect(sanitizeOutput("\x1B]0;title\x07content")).toBe("content");
  });

  it("strips OSC 8 hyperlinks", () => {
    expect(sanitizeOutput("\x1B]8;;https://example.com\x1B\\click here")).toBe(
      "click here",
    );
  });

  it("strips 7-bit C1 escape codes", () => {
    expect(sanitizeOutput("\x1BDsome text")).toBe("some text");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeOutput("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(sanitizeOutput("")).toBe("");
  });

  it("strips multiple different escape types", () => {
    const input = "\x1B[1mbold\x1B[0m \x1B]0;title\x07 \x1B[34mblue\x1B[0m";
    const result = sanitizeOutput(input);
    expect(result).toBe("bold  blue");
  });
});

describe("appendLog", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logging-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes text with trailing newline", () => {
    const logPath = join(tempDir, "test.log");
    appendLog(logPath, "hello");
    expect(readFileSync(logPath, "utf-8")).toBe("hello\n");
  });

  it("does not double-newline if text already ends with newline", () => {
    const logPath = join(tempDir, "test.log");
    appendLog(logPath, "hello\n");
    expect(readFileSync(logPath, "utf-8")).toBe("hello\n");
  });

  it("appends multiple lines", () => {
    const logPath = join(tempDir, "test.log");
    appendLog(logPath, "line1");
    appendLog(logPath, "line2");
    expect(readFileSync(logPath, "utf-8")).toBe("line1\nline2\n");
  });

  it("sanitizes ANSI codes before writing", () => {
    const logPath = join(tempDir, "test.log");
    appendLog(logPath, "\x1B[31mred\x1B[0m");
    expect(readFileSync(logPath, "utf-8")).toBe("red\n");
  });

  it("silently handles write errors (e.g. invalid path)", () => {
    // Should not throw
    appendLog("/nonexistent/dir/file.log", "test");
  });
});

describe("appendLogBlock", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logging-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes each line with prefix", () => {
    const logPath = join(tempDir, "test.log");
    appendLogBlock(logPath, "step", "line1\nline2\nline3");
    const content = readFileSync(logPath, "utf-8");
    expect(content).toBe("[step] line1\n[step] line2\n[step] line3\n");
  });

  it("does nothing for null content", () => {
    const logPath = join(tempDir, "test.log");
    appendLogBlock(logPath, "step", null);
    expect(existsSync(logPath)).toBe(false);
  });
});

describe("logCmdResults", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logging-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("logs command name and stdout", () => {
    const logPath = join(tempDir, "test.log");
    logCmdResults(logPath, [{ cmd: "echo hello", stdout: "hello" }], "out");
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[cmd] echo hello");
    expect(content).toContain("[out] hello");
  });

  it("supports cmdPrefix", () => {
    const logPath = join(tempDir, "test.log");
    logCmdResults(
      logPath,
      [{ cmd: "install", stdout: "ok" }],
      "npm",
      "bun ",
    );
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[cmd] bun install");
  });
});

describe("logInfo", () => {
  beforeEach(() => {
    spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("always logs messages", () => {
    logInfo("test message");
    expect(console.log).toHaveBeenCalledWith("test message");
  });
});

describe("logVitestResults", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logging-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("logs vitest command and output", () => {
    const logPath = join(tempDir, "test.log");
    logVitestResults(logPath, "vitest run test.ts", "PASS test.ts\n2 tests");
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[cmd] vitest run test.ts");
    expect(content).toContain("[vitest] PASS test.ts");
    expect(content).toContain("[vitest] 2 tests");
  });
});

describe("runCommandStep", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "logging-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true and logs on success", async () => {
    const logPath = join(tempDir, "test.log");
    const result = await runCommandStep(
      logPath,
      async () => [{ cmd: "test", stdout: "ok" }],
      "test",
      "test step",
    );
    expect(result).toBe(true);
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[cmd] test");
  });

  it("returns false and logs error on exception", async () => {
    const logPath = join(tempDir, "test.log");
    const result = await runCommandStep(
      logPath,
      async () => {
        throw new Error("boom");
      },
      "test",
      "test step",
    );
    expect(result).toBe(false);
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[error] test step: Error: boom");
  });
});
