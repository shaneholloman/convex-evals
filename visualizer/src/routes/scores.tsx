import { createFileRoute, Link } from "@tanstack/react-router";
import { getConvexRuns } from "../lib/data";
import { getScoreIcon, getScoreStatus } from "../lib/types";
import type { ConvexRun } from "../lib/types";

export const Route = createFileRoute("/scores")({
  loader: () => getConvexRuns({ data: { includeAll: true } }),
  component: ScoresPage,
});

function ScoresPage() {
  const runs = Route.useLoaderData();

  // Sort by creation time descending (newest first)
  const sortedRuns = [...runs].sort((a, b) => b._creationTime - a._creationTime);

  // Get all unique categories across all runs
  const allCategories = new Set<string>();
  for (const run of runs) {
    for (const cat of Object.keys(run.scores)) {
      allCategories.add(cat);
    }
  }
  const categories = Array.from(allCategories).sort();

  // Get unique models
  const models = Array.from(new Set(runs.map((r) => r.model))).sort();

  return (
    <div className="flex h-screen">
      <ScoresSidebar runs={sortedRuns} models={models} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8">
            <div className="flex items-center gap-4 mb-2">
              <Link to="/" className="text-slate-400 hover:text-white">
                ← Local Results
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              📊 Convex Eval Scores Database
            </h1>
            <p className="text-slate-400">
              Individual evaluation runs from CI stored in Convex
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="stat-card">
              <div className="stat-number">{runs.length}</div>
              <div className="stat-label">Total Runs</div>
            </div>
            <div className="stat-card overall-score">
              <div className="stat-number">
                {runs.length > 0
                  ? (
                      (runs.reduce((sum, r) => sum + r.totalScore, 0) /
                        runs.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </div>
              <div className="stat-label">Average Score</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{models.length}</div>
              <div className="stat-label">Models</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">📋 All Runs</div>
            <div className="card-content overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Model</th>
                    <th>Experiment</th>
                    <th>Total Score</th>
                    {categories.map((cat) => (
                      <th key={cat} className="text-center whitespace-nowrap">
                        {formatCategoryName(cat)}
                      </th>
                    ))}
                    <th>Run ID</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRuns.map((run) => (
                    <RunRow key={run._id} run={run} categories={categories} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RunRow({
  run,
  categories,
}: {
  run: ConvexRun;
  categories: string[];
}) {
  const percentage = (run.totalScore * 100).toFixed(1);
  const statusIcon = getScoreIcon(run.totalScore);
  const date = new Date(run._creationTime).toLocaleString();
  const experimentLabel = run.experiment || "default";

  return (
    <tr>
      <td className="text-slate-400 text-sm whitespace-nowrap">{date}</td>
      <td>
        <div className="flex items-center gap-2">
          <span>{statusIcon}</span>
          <strong className="text-white">{run.model}</strong>
        </div>
      </td>
      <td>
        <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">
          {experimentLabel}
        </span>
      </td>
      <td>
        <div className="score-bar-container w-24">
          <div className="score-bar" style={{ width: `${percentage}%` }} />
          <span className="score-text text-xs">{percentage}%</span>
        </div>
      </td>
      {categories.map((cat) => {
        const catScore = run.scores?.[cat];
        if (catScore === undefined) {
          return (
            <td key={cat} className="text-center text-slate-600">
              —
            </td>
          );
        }
        const pct = (catScore * 100).toFixed(0);
        const status = getScoreStatus(catScore);
        const colorClass =
          status === "excellent"
            ? "text-green-400"
            : status === "good"
              ? "text-yellow-400"
              : status === "fair"
                ? "text-orange-400"
                : "text-red-400";

        return (
          <td key={cat} className="text-center">
            <span className={`font-mono text-sm ${colorClass}`}>{pct}%</span>
          </td>
        );
      })}
      <td>
        <code className="text-xs text-slate-500">
          {run.runId ? run.runId.slice(0, 8) : "—"}
        </code>
      </td>
    </tr>
  );
}

function ScoresSidebar({
  runs,
  models,
}: {
  runs: ConvexRun[];
  models: string[];
}) {
  // Count runs per model
  const modelCounts = new Map<string, number>();
  for (const run of runs) {
    modelCounts.set(run.model, (modelCounts.get(run.model) || 0) + 1);
  }

  return (
    <aside className="w-72 bg-slate-800/50 border-r border-slate-700 overflow-auto">
      <div className="p-4 border-b border-slate-700">
        <h2 className="font-semibold text-white">Navigation</h2>
      </div>
      <nav className="p-2">
        <Link
          to="/"
          className="sidebar-item block mb-1 text-slate-400 hover:text-white"
        >
          📁 Local Results
        </Link>
        <Link to="/scores" className="sidebar-item block mb-1 active">
          📊 Database Scores
        </Link>
      </nav>
      <div className="p-4 border-t border-slate-700">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Models ({models.length})
        </h3>
        <div className="space-y-1">
          {models.map((model) => {
            const count = modelCounts.get(model) || 0;
            return (
              <div
                key={model}
                className="flex items-center justify-between text-sm px-2 py-1"
              >
                <span className="text-slate-300 truncate">{model}</span>
                <span className="text-xs text-slate-500">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function formatCategoryName(category: string): string {
  // Convert "000-fundamentals" to "Fundamentals"
  return category
    .replace(/^\d+-/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
