/**
 * Convex coding guidelines and best practices.
 * These are included in prompts to help AI models generate correct Convex code.
 *
 * The canonical source of truth is guidelines.md in this directory.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDELINES_PATH = resolve(__dirname, "guidelines.md");

let _cached: string | null = null;

export function getGuidelines(): string {
  if (_cached === null) {
    _cached = readFileSync(GUIDELINES_PATH, "utf-8");
  }
  return _cached;
}
