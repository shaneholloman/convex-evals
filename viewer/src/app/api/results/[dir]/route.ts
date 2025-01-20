import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { dir: string } },
) {
  try {
    const workspaceRoot = process.cwd();
    const resultsPath = path.join(
      workspaceRoot,
      "..",
      params.dir,
      "results.json",
    );

    const fileContents = await fs.readFile(resultsPath, "utf-8");
    const results = JSON.parse(fileContents);

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load test results" },
      { status: 500 },
    );
  }
}
