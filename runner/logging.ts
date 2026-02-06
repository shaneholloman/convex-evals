/**
 * Logging utilities for evaluation runs.
 */
import { appendFileSync } from "fs";

/** Remove ANSI escape codes from text. */
export function sanitizeOutput(text: string): string {
  try {
    return text
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "") // CSI sequences
      .replace(/\x1B\][^\x07]*\x07/g, "") // OSC sequences (BEL)
      .replace(/\x1B\]8;;.*?\x1B\\/g, "") // OSC 8 hyperlinks
      .replace(/\x1B[@-Z\\-_]/g, ""); // 7-bit C1
  } catch {
    return text;
  }
}

/** Append a line to a log file. */
export function appendLog(logPath: string, text: string): void {
  try {
    const sanitized = sanitizeOutput(text);
    appendFileSync(logPath, sanitized.endsWith("\n") ? sanitized : sanitized + "\n", "utf-8");
  } catch {
    // Best-effort logging
  }
}

/** Append a block of content to a log file with a prefix on each line. */
export function appendLogBlock(logPath: string, prefix: string, content: string | null): void {
  if (!content) return;
  for (const line of sanitizeOutput(content).split("\n")) {
    appendLog(logPath, `[${prefix}] ${line}`);
  }
}

/** Log command results to a file. */
export function logCmdResults(
  logPath: string,
  results: Array<{ cmd: string; stdout: string }>,
  prefix: string,
  cmdPrefix = "",
): void {
  for (const { cmd, stdout } of results) {
    appendLog(logPath, `[cmd] ${cmdPrefix}${cmd}`);
    appendLogBlock(logPath, prefix, stdout);
  }
}

/** Print an info message (only when VERBOSE_INFO_LOGS is set). */
export function logInfo(message: string): void {
  const verbose = ["1", "true", "yes"].includes(
    (process.env.VERBOSE_INFO_LOGS ?? "").toLowerCase(),
  );
  if (!verbose) return;
  try {
    console.log(message);
  } catch {
    // Windows console may not support Unicode
    console.log(message.replace(/✅/g, "[PASS]").replace(/❌/g, "[FAIL]"));
  }
}

/** Log vitest results to a file. */
export function logVitestResults(
  logPath: string,
  cmd: string,
  stdout: string,
): void {
  appendLog(logPath, `[cmd] ${cmd}`);
  appendLogBlock(logPath, "vitest", stdout);
}

/**
 * Execute a handler that returns command results; log results or error.
 * Returns true on success, false on exception.
 */
export async function runCommandStep(
  logPath: string,
  handler: () => Promise<Array<{ cmd: string; stdout: string }>>,
  prefix: string,
  errorLabel: string,
  cmdPrefix = "",
): Promise<boolean> {
  try {
    const results = await handler();
    logCmdResults(logPath, results, prefix, cmdPrefix);
    return true;
  } catch (e) {
    appendLog(logPath, `[error] ${errorLabel}: ${String(e)}`);
    return false;
  }
}
