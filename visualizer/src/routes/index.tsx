import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/api";
import { useState } from "react";
import {
  getRunStatusIcon,
  type Run,
} from "../lib/types";
import { formatRunLabel } from "../lib/breadcrumbs";

interface Experiment {
  name: string;
  runCount: number;
  modelCount: number;
  models: string[];
  latestRun: number;
  totalEvals: number;
  passedEvals: number;
  passRate: number;
  completedRuns: number;
}

interface Model {
  name: string;
  runCount: number;
  experimentCount: number;
  passRate: number;
  totalEvals: number;
  passedEvals: number;
}

type Tab = "experiments" | "models" | "runs";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("runs");

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "runs", label: "Recent Runs", icon: "🏃" },
    { id: "experiments", label: "Experiments", icon: "🧪" },
    { id: "models", label: "Models", icon: "🤖" },
  ];

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">
            Convex Evaluation Results
          </h1>
          <p className="text-slate-400">
            Browse experiments, models, and recent runs
          </p>
        </header>

        <div className="mt-6">
          <div className="tab-nav mb-0 rounded-t-xl bg-slate-800/50 border border-b-0 border-slate-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="card rounded-t-none border-t-0">
            <div className="card-content">
              {activeTab === "experiments" && <ExperimentsTab />}
              {activeTab === "models" && <ModelsTab />}
              {activeTab === "runs" && <RecentRunsTab />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------- Experiments Tab ---------- */

function ExperimentsTab() {
  const experiments = useQuery(api.runs.listExperiments, {});
  const navigate = useNavigate();

  if (experiments === undefined) {
    return <div className="text-slate-400 py-4">Loading experiments...</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Experiment</th>
          <th>Runs</th>
          <th>Models</th>
          <th>Evals</th>
          <th>Pass Rate</th>
          <th>Last Run</th>
        </tr>
      </thead>
      <tbody>
        {experiments.map((experiment) => (
          <ExperimentRow
            key={experiment.name}
            experiment={experiment}
            onClick={() =>
              navigate({
                to: "/experiment/$experimentId",
                params: { experimentId: experiment.name },
              })
            }
          />
        ))}
      </tbody>
    </table>
  );
}

function ExperimentRow({
  experiment,
  onClick,
}: {
  experiment: Experiment;
  onClick: () => void;
}) {
  const percentage = (experiment.passRate * 100).toFixed(1);
  const date = formatRelativeTime(experiment.latestRun);

  return (
    <tr className="cursor-pointer hover:bg-slate-800/50" onClick={onClick}>
      <td className="text-white font-medium">
        {experiment.name === "default" ? "with_guidelines" : experiment.name}
      </td>
      <td className="text-slate-300">{experiment.runCount}</td>
      <td className="text-slate-300">{experiment.modelCount}</td>
      <td className="text-slate-300">
        <span className="text-green-400">{experiment.passedEvals}</span>
        {" / "}
        <span>{experiment.totalEvals}</span>
      </td>
      <td>
        <div className="score-bar-container w-24">
          <div className="score-bar" style={{ width: `${percentage}%` }} />
          <span className="score-text">{percentage}%</span>
        </div>
      </td>
      <td className="text-slate-500 text-sm">{date}</td>
    </tr>
  );
}

/* ---------- Models Tab ---------- */

function ModelsTab() {
  const experiments = useQuery(api.runs.listExperiments, {});
  const modelNames = experiments
    ? [...new Set(experiments.flatMap((e) => e.models))]
    : [];
  const models = useQuery(
    api.runs.listModels,
    experiments ? { models: modelNames } : "skip"
  );
  const navigate = useNavigate();

  if (experiments === undefined || models === undefined) {
    return <div className="text-slate-400 py-4">Loading models...</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Runs</th>
          <th>Experiments</th>
          <th>Evals</th>
          <th>Pass Rate</th>
        </tr>
      </thead>
      <tbody>
        {models.map((model) => (
          <ModelRow
            key={model.name}
            model={model}
            onClick={() =>
              navigate({
                to: "/model/$model",
                params: { model: model.name },
              })
            }
          />
        ))}
      </tbody>
    </table>
  );
}

function ModelRow({
  model,
  onClick,
}: {
  model: Model;
  onClick: () => void;
}) {
  const percentage = (model.passRate * 100).toFixed(1);

  return (
    <tr className="cursor-pointer hover:bg-slate-800/50" onClick={onClick}>
      <td className="text-white font-medium">{model.name}</td>
      <td className="text-slate-300">{model.runCount}</td>
      <td className="text-slate-300">{model.experimentCount}</td>
      <td className="text-slate-300">
        <span className="text-green-400">{model.passedEvals}</span>
        {" / "}
        <span>{model.totalEvals}</span>
      </td>
      <td>
        <div className="score-bar-container w-24">
          <div
            className="score-bar"
            style={{ width: `${percentage}%` }}
          />
          <span className="score-text">{percentage}%</span>
        </div>
      </td>
    </tr>
  );
}

/* ---------- Runs Tab ---------- */

function RecentRunsTab() {
  const runs = useQuery(api.runs.listRuns, { limit: 50 });
  const navigate = useNavigate();

  if (runs === undefined) {
    return <div className="text-slate-400 py-4">Loading recent runs...</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Run</th>
          <th>Model</th>
          <th>Experiment</th>
          <th>Evals</th>
          <th>Pass Rate</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <RunRow
            key={run._id}
            run={run}
            onClick={() => {
              const experimentId = run.experiment ?? "default";
              navigate({
                to: "/experiment/$experimentId/run/$runId",
                params: { experimentId, runId: run._id },
              });
            }}
          />
        ))}
      </tbody>
    </table>
  );
}

function RunRow({ run, onClick }: { run: Run; onClick: () => void }) {
  const statusIcon = getRunStatusIcon(run.status);
  const passRate = run.evalCounts
    ? run.evalCounts.total > 0
      ? run.evalCounts.passed / run.evalCounts.total
      : 0
    : 0;
  const percentage = (passRate * 100).toFixed(1);
  const experimentName = run.experiment
    ? run.experiment
    : "with_guidelines";

  return (
    <tr className="cursor-pointer hover:bg-slate-800/50" onClick={onClick}>
      <td className="text-center text-lg">{statusIcon}</td>
      <td className="text-white font-medium font-mono text-sm">
        {formatRunLabel(run._id, run.model)}
      </td>
      <td className="text-slate-300">{run.model}</td>
      <td className="text-slate-300">{experimentName}</td>
      <td className="text-slate-300">
        {run.evalCounts ? (
          <>
            <span className="text-green-400">{run.evalCounts.passed}</span>
            {" / "}
            <span>{run.evalCounts.total}</span>
          </>
        ) : (
          <span className="text-slate-500">-</span>
        )}
      </td>
      <td>
        {run.evalCounts && run.evalCounts.total > 0 ? (
          <div className="score-bar-container w-24">
            <div className="score-bar" style={{ width: `${percentage}%` }} />
            <span className="score-text">{percentage}%</span>
          </div>
        ) : (
          <span className="text-slate-500 text-sm">-</span>
        )}
      </td>
      <td className="text-slate-500 text-sm">
        {formatRelativeTime(run._creationTime)}
      </td>
    </tr>
  );
}

/* ---------- Helpers ---------- */

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diffMs = now - ms;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString();
}
