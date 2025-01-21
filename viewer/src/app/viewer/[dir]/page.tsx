import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FileIcon } from "@radix-ui/react-icons";
import { CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface TestStatus {
  status: string;
  error?: string;
}

interface TestReport {
  category: string;
  test: string;
  setup: TestStatus;
  typecheck?: TestStatus;
  lint?: TestStatus;
  deploy?: TestStatus;
  tests?: TestStatus;
}

interface FileEntry {
  name: string;
  path: string;
}

type ReportData = TestReport[];

function CategorySummary({
  category,
  tests,
}: {
  category: string;
  tests: (TestReport & { files: FileEntry[] })[];
}) {
  const totalTests = tests.length;
  const passedTests = tests.filter((test) =>
    Object.values(test)
      .filter((v) => typeof v === "object" && "status" in v)
      .every((v) => v.status === "ok" || v.status === "skipped"),
  ).length;
  const failedTests = totalTests - passedTests;

  return (
    <tr className="group hover:bg-gray-50 transition-colors">
      <td className="py-4 pl-6 pr-3">
        <a
          href={`#category-${category}`}
          className="flex items-center gap-2 text-gray-900 hover:text-gray-600"
        >
          <ChevronDown className="h-4 w-4 text-gray-400" />
          <span className="font-medium">{category}</span>
        </a>
      </td>
      <td className="px-3 py-4 text-center">{totalTests}</td>
      <td className="px-3 py-4">
        <div className="flex items-center justify-center gap-1 text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>{passedTests}</span>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center justify-center gap-1 text-red-600">
          <XCircle className="h-4 w-4" />
          <span>{failedTests}</span>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${
              passedTests === totalTests
                ? "bg-green-500"
                : failedTests === totalTests
                  ? "bg-red-500"
                  : "bg-yellow-500"
            }`}
            style={{ width: `${(passedTests / totalTests) * 100}%` }}
          />
        </div>
      </td>
    </tr>
  );
}

const ignoredFiles = [
  "bun.lockb",
  "_generated",
  "node_modules",
  ".env.local",
  "README.md",
  "tsconfig.json",
];

async function getGeneratedFilesList(
  dirName: string,
  testPath: string,
): Promise<FileEntry[]> {
  const workspaceRoot = process.cwd();
  const testDir = path.join(
    workspaceRoot,
    "..",
    dirName,
    "evals",
    testPath,
    "project",
  );
  const files: FileEntry[] = [];

  async function walkDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (ignoredFiles.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else {
        const relativePath = path.relative(testDir, fullPath);
        files.push({
          name: entry.name,
          path: relativePath,
        });
      }
    }
  }

  try {
    await walkDir(testDir);
    return files;
  } catch (error) {
    console.error("Error reading generated files:", error);
    return [];
  }
}

async function getReportData(dirName: string): Promise<ReportData | null> {
  try {
    const workspaceRoot = process.cwd();
    const reportPath = path.join(workspaceRoot, "..", dirName, "report.json");
    const reportContent = await fs.readFile(reportPath, "utf-8");
    return JSON.parse(reportContent);
  } catch (error) {
    return null;
  }
}

export default async function OutputPage({
  params,
}: {
  params: { dir: string };
}) {
  const report = await getReportData(params.dir);

  if (!report) {
    notFound();
  }

  const testsWithFiles = await Promise.all(
    report.map(async (test) => ({
      ...test,
      files: await getGeneratedFilesList(
        params.dir,
        `${test.category}/${test.test}`,
      ),
    })),
  );

  const categories = testsWithFiles.reduce<{
    [key: string]: (TestReport & { files: FileEntry[] })[];
  }>((acc, entry) => {
    if (!acc[entry.category]) acc[entry.category] = [];
    acc[entry.category].push(entry);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 pb-6 border-b">
        <h1 className="text-3xl font-bold text-gray-900">{params.dir}</h1>
        <p className="mt-2 text-gray-600">Test Results Overview</p>
      </div>

      <div className="mb-12 rounded-xl border shadow-sm overflow-hidden bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th
                scope="col"
                className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-gray-900"
              >
                Category
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-center text-sm font-semibold text-gray-900"
              >
                Total
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-center text-sm font-semibold text-gray-900"
              >
                Passed
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-center text-sm font-semibold text-gray-900"
              >
                Failed
              </th>
              <th
                scope="col"
                className="px-3 py-3 text-left text-sm font-semibold text-gray-900"
              >
                Progress
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(categories).map(([category, tests]) => (
              <CategorySummary
                key={category}
                category={category}
                tests={tests}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-10">
        {Object.entries(categories).map(([category, tests]) => (
          <div
            key={category}
            id={`category-${category}`}
            className="bg-white rounded-xl border shadow-sm overflow-hidden scroll-mt-8"
          >
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-900">
                {category}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {tests.length} tests
                </span>
              </h2>
            </div>

            <div className="divide-y divide-gray-100">
              {tests.map((test) => {
                const isSuccess = Object.values(test)
                  .filter((v) => typeof v === "object" && "status" in v)
                  .every((v) => v.status === "ok");

                return (
                  <div key={test.test} className="px-6 py-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          isSuccess ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <h3 className="font-medium text-lg text-gray-900">
                        {test.test}
                      </h3>
                    </div>

                    <div className="space-y-3 ml-4">
                      {["setup", "typecheck", "lint", "deploy", "tests"].map(
                        (phase) => {
                          const status = test[phase as keyof TestReport] as
                            | TestStatus
                            | undefined;
                          if (!status) return null;

                          return (
                            <div key={phase} className="flex items-start gap-3">
                              <div
                                className={`w-2 h-2 rounded-full mt-1.5 ${
                                  status.status === "ok"
                                    ? "bg-green-400"
                                    : "bg-red-400"
                                }`}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium capitalize text-gray-700">
                                    {phase}
                                  </span>
                                  <span
                                    className={`text-sm ${
                                      status.status === "ok"
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {status.status}
                                  </span>
                                </div>
                                {status.error && (
                                  <pre className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg overflow-auto whitespace-pre-wrap break-words">
                                    {status.error}
                                  </pre>
                                )}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>

                    {test.files.length > 0 && (
                      <div className="mt-6">
                        <details className="group">
                          <summary className="text-sm font-medium text-gray-700 mb-2 cursor-pointer list-none">
                            <div className="flex items-center gap-2">
                              <div className="transition-transform duration-200 group-open:rotate-90">
                                ▶
                              </div>
                              Generated Files ({test.files.length})
                            </div>
                          </summary>
                          <div className="space-y-2 mt-2">
                            {test.files.map((file) => (
                              <Link
                                key={file.path}
                                href={`/viewer/${params.dir}/file/${encodeURIComponent(`${test.category}/${test.test}/project/${file.path}`)}`}
                                className="block p-3 rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <FileIcon className="h-5 w-5 text-gray-400" />
                                  <span className="font-mono text-sm text-gray-700">
                                    {file.path}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
