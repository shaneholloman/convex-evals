#!/usr/bin/env bun
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

function runCommand(
  cmd: string[],
  cwd: string,
  options?: { allowFailure?: boolean },
): void {
  const display = cmd.join(" ");
  console.log(`\n> ${display}`);

  const result = Bun.spawnSync({
    cmd,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0 && !options?.allowFailure) {
    throw new Error(`Command failed (${result.exitCode}): ${display}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const evalScoresDir = join(repoRoot, "evalScores");
  const zipName = `prod-export-${Date.now()}.zip`;
  const zipPath = join(evalScoresDir, zipName);

  console.log("Syncing evalScores dev deployment from production snapshot.");
  console.log(`Working directory: ${evalScoresDir}`);

  try {
    // Best-effort wipe first. If this fails due to schema drift, import
    // with --replace-all still replaces all deployment data.
    runCommand(
      ["npx", "convex", "run", "--component", "migrations", "lib:clearAll", "{}"],
      evalScoresDir,
      { allowFailure: true },
    );

    runCommand(
      ["npx", "convex", "export", "--prod", "--path", zipName],
      evalScoresDir,
    );

    runCommand(
      ["npx", "convex", "import", "--replace-all", "-y", zipName],
      evalScoresDir,
    );

    runCommand(
      ["npx", "convex", "run", "runs:listExperiments", "{}"],
      evalScoresDir,
    );

    console.log("\nSync complete.");
  } finally {
    if (existsSync(zipPath)) {
      unlinkSync(zipPath);
      console.log(`Removed snapshot file: ${zipName}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
