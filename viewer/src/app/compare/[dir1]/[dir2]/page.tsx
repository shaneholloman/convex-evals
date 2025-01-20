"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
} from "lucide-react";

interface TestResult {
  name: string;
  status: "pass" | "fail";
  duration: number;
  error?: string;
}

interface ComparisonResult {
  name: string;
  dir1Result: TestResult | null;
  dir2Result: TestResult | null;
  status: "improved" | "regressed" | "unchanged" | "new" | "removed";
}

export default function ComparisonPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult[]>([]);

  useEffect(() => {
    async function loadResults() {
      try {
        const results1 = await fetch(`/api/results/${params.dir1}`).then((r) =>
          r.json(),
        );
        const results2 = await fetch(`/api/results/${params.dir2}`).then((r) =>
          r.json(),
        );

        if (results1.error || results2.error) {
          throw new Error(results1.error || results2.error);
        }

        // Compare results
        const allTests = new Set([
          ...results1.map((r: TestResult) => r.name),
          ...results2.map((r: TestResult) => r.name),
        ]);

        const comparisonResults = Array.from(allTests).map((testName) => {
          const r1 =
            results1.find((r: TestResult) => r.name === testName) || null;
          const r2 =
            results2.find((r: TestResult) => r.name === testName) || null;

          let status: ComparisonResult["status"];
          if (!r1) status = "new";
          else if (!r2) status = "removed";
          else if (r1.status === "pass" && r2.status === "fail")
            status = "regressed";
          else if (r1.status === "fail" && r2.status === "pass")
            status = "improved";
          else status = "unchanged";

          return {
            name: testName,
            dir1Result: r1,
            dir2Result: r2,
            status,
          };
        });

        setComparison(comparisonResults);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load comparison");
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [params.dir1, params.dir2]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">
            Error Loading Comparison
          </h2>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const stats = comparison.reduce(
    (acc, curr) => {
      acc[curr.status]++;
      return acc;
    },
    { improved: 0, regressed: 0, unchanged: 0, new: 0, removed: 0 },
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="border-b pb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Test Results Comparison
        </h1>
        <p className="mt-2 text-base text-gray-600">
          Comparing {params.dir1} vs {params.dir2}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {Object.entries(stats).map(([status, count]) => (
          <div key={status} className="bg-white rounded-lg border p-4">
            <p className="text-sm text-gray-500 capitalize">{status}</p>
            <p className="text-2xl font-semibold mt-1">{count}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Detailed Results
          </h2>
        </div>

        <div className="divide-y">
          {comparison.map((result) => (
            <div key={result.name} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center gap-4">
                {result.status === "improved" && (
                  <ArrowUpIcon className="h-5 w-5 text-green-500" />
                )}
                {result.status === "regressed" && (
                  <ArrowDownIcon className="h-5 w-5 text-red-500" />
                )}
                {result.status === "unchanged" && (
                  <MinusIcon className="h-5 w-5 text-gray-400" />
                )}

                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{result.name}</h3>
                  <div className="mt-1 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Before:</p>
                      <p
                        className={`font-medium ${
                          result.dir1Result?.status === "pass"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {result.dir1Result?.status || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">After:</p>
                      <p
                        className={`font-medium ${
                          result.dir2Result?.status === "pass"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {result.dir2Result?.status || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
