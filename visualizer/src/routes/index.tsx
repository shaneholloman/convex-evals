import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/api";

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

export const Route = createFileRoute("/")({
  component: ExperimentsListPage,
});

function ExperimentsListPage() {
  const experiments = useQuery(api.runs.listExperiments, {});

  if (experiments === undefined) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Loading experiments...</div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              🚀 Convex Evaluation Results
            </h1>
            <p className="text-slate-400">
              Select an experiment to view its runs
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="stat-card">
              <div className="stat-number">{experiments.length}</div>
              <div className="stat-label">Experiments</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">
                {experiments.reduce((acc, e) => acc + e.runCount, 0)}
              </div>
              <div className="stat-label">Total Runs</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">
                {experiments.reduce((acc, e) => acc + e.totalEvals, 0)}
              </div>
              <div className="stat-label">Total Evals</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">
                {new Set(experiments.flatMap((e) => e.models)).size}
              </div>
              <div className="stat-label">Models</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">🧪 All Experiments</div>
            <div className="card-content">
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
                    <ExperimentRow key={experiment.name} experiment={experiment} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    </main>
  );
}

function ExperimentRow({ experiment }: { experiment: Experiment }) {
  const navigate = useNavigate();
  const percentage = (experiment.passRate * 100).toFixed(1);
  const date = new Date(experiment.latestRun).toLocaleString();

  return (
    <tr
      className="cursor-pointer hover:bg-slate-800/50"
      onClick={() =>
        navigate({
          to: "/experiment/$experimentId",
          params: { experimentId: experiment.name },
        })
      }
    >
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

