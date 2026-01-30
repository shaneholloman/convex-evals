import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../convex/api";
import type { Id } from "../convex/types";
import {
  getScoreStatus,
  getRunStatusIcon,
  getEvalStatusIcon,
  type Run,
  type Eval,
} from "./types";
import { formatCategoryName } from "./evalComponents";

type SidebarLevel = "home" | "experiment" | "run" | "category" | "eval";

function parsePath(pathname: string): {
  level: SidebarLevel;
  experimentId?: string;
  runId?: string;
  category?: string;
  evalId?: string;
} {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0)
    return { level: "home" };
  if (segments[0] !== "experiment" || !segments[1])
    return { level: "home" };

  const experimentId = segments[1];
  if (segments[2] !== "run" || !segments[3])
    return { level: "experiment", experimentId };

  const runId = segments[3];
  if (!segments[4])
    return { level: "run", experimentId, runId };

  const category = segments[4];
  if (!segments[5])
    return { level: "category", experimentId, runId, category };

  return {
    level: "eval",
    experimentId,
    runId,
    category,
    evalId: segments[5],
  };
}

function experimentDisplayName(id: string): string {
  return id === "default" ? "with_guidelines" : id;
}

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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { level, experimentId, runId, category, evalId } = parsePath(pathname);

  const asideClass =
    "w-72 bg-slate-800/50 border-r border-slate-700 overflow-auto flex flex-col shrink-0 sidebar-panel";

  if (level === "home") {
    return (
      <aside key={pathname} className={asideClass}>
        <SidebarHome />
      </aside>
    );
  }

  if (level === "experiment" && experimentId) {
    return (
      <aside key={pathname} className={asideClass}>
        <SidebarExperiment experimentId={experimentId} />
      </aside>
    );
  }

  if (level === "run" && experimentId && runId) {
    return (
      <aside key={pathname} className={asideClass}>
        <SidebarRun experimentId={experimentId} runId={runId} />
      </aside>
    );
  }

  if (level === "category" && experimentId && runId && category) {
    return (
      <aside key={pathname} className={asideClass}>
        <SidebarCategory
          experimentId={experimentId}
          runId={runId}
          category={category}
        />
      </aside>
    );
  }

  if (level === "eval" && experimentId && runId && category && evalId) {
    return (
      <aside key={pathname} className={asideClass}>
        <SidebarEvalDetail
          experimentId={experimentId}
          runId={runId}
          category={category}
          evalId={evalId}
        />
      </aside>
    );
  }

  return (
    <aside key={pathname} className={asideClass}>
      <SidebarHome />
    </aside>
  );
}

function SidebarHome() {
  const experiments = useQuery(api.runs.listExperiments, {});

  if (experiments === undefined) {
    return (
      <div className="p-4 text-slate-400 text-sm">Loading experiments...</div>
    );
  }

  return (
    <>
      <div className="sidebar-header">
        <h1 className="sidebar-header-title">Experiments</h1>
      </div>
      <nav className="p-2 flex-1 overflow-auto">
        {experiments.map((exp) => {
          const percentage = (exp.passRate * 100).toFixed(1);
          return (
            <Link
              key={exp.name}
              to="/experiment/$experimentId"
              params={{ experimentId: exp.name }}
              className="sidebar-item block mb-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white truncate">
                  {exp.name === "default" ? "with_guidelines" : exp.name}
                </span>
                <span className="text-xs font-bold text-cyan-400">
                  {percentage}%
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {exp.runCount} runs · {exp.modelCount} models
              </div>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function SidebarExperiment({ experimentId }: { experimentId: string }) {
  const runs = useQuery(api.runs.listRuns, {
    experiment: experimentId === "default" ? undefined : (experimentId as "no_guidelines"),
  });

  const filteredRuns =
    runs === undefined
      ? undefined
      : experimentId === "default"
        ? runs.filter((r) => !r.experiment)
        : runs;

  const displayName = experimentDisplayName(experimentId);

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <Link
            to="/"
            className="sidebar-header-back-btn"
            aria-label="Back to experiments"
          >
            <BackIcon />
          </Link>
          <h1 className="sidebar-header-title">{displayName}</h1>
        </div>
      </div>
      <div className="sidebar-list-section">
        <p className="sidebar-list-label">Runs</p>
        <nav className="p-2 flex-1 overflow-auto">
          {filteredRuns === undefined ? (
            <div className="text-slate-400 text-sm px-2">Loading runs...</div>
          ) : (
            filteredRuns.slice(0, 50).map((run) => (
              <RunLinkRow
                key={run._id}
                experimentId={experimentId}
                run={run}
                isActive={false}
              />
            ))
          )}
        </nav>
      </div>
    </>
  );
}

function RunLinkRow({
  experimentId,
  run,
  isActive,
}: {
  experimentId: string;
  run: Run;
  isActive: boolean;
}) {
  const passRate = run.evalCounts
    ? run.evalCounts.total > 0
      ? run.evalCounts.passed / run.evalCounts.total
      : 0
    : 0;
  const percentage = (passRate * 100).toFixed(1);
  const scoreStatus = getScoreStatus(passRate);
  const statusIcon = getRunStatusIcon(run.status);

  return (
    <Link
      to="/experiment/$experimentId/run/$runId"
      params={{ experimentId, runId: run._id }}
      className={`sidebar-item block mb-1 ${isActive ? "active" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white truncate flex items-center gap-1">
          <span>{statusIcon}</span>
          {run.model}
        </span>
        <span
          className={`text-xs font-bold ${
            scoreStatus === "excellent"
              ? "text-green-400"
              : scoreStatus === "good"
                ? "text-yellow-400"
                : scoreStatus === "fair"
                  ? "text-orange-400"
                  : "text-red-400"
          }`}
        >
          {percentage}%
        </span>
      </div>
      <div className="text-xs text-slate-500 mt-1 flex items-center justify-between gap-2">
        <span>
          {run.evalCounts
            ? `${run.evalCounts.passed}/${run.evalCounts.total} passed`
            : "No evals"}
        </span>
        <span className="shrink-0">{formatRelativeTime(run._creationTime)}</span>
      </div>
    </Link>
  );
}

function SidebarRun({
  experimentId,
  runId,
}: {
  experimentId: string;
  runId: string;
}) {
  const run = useQuery(api.runs.getRunDetails, {
    runId: runId as Id<"runs">,
  });

  if (run === undefined) {
    return (
      <div className="p-4 text-slate-400 text-sm">Loading run...</div>
    );
  }

  if (run === null) {
    return (
      <div className="p-4 text-red-400 text-sm">Run not found</div>
    );
  }

  const evals = [...run.evals].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <Link
            to="/experiment/$experimentId"
            params={{ experimentId }}
            className="sidebar-header-back-btn"
            aria-label={`Back to ${experimentDisplayName(experimentId)}`}
          >
            <BackIcon />
          </Link>
          <h1 className="sidebar-header-title">{run.model}</h1>
        </div>
      </div>
      <div className="sidebar-list-section">
        <p className="sidebar-list-label">Evals ({evals.length})</p>
        <nav className="p-2 flex-1 overflow-auto">
          {evals.map((evalItem) => (
            <EvalLinkRow
              key={evalItem._id}
              experimentId={experimentId}
              runId={runId}
              evalItem={evalItem}
              isActive={false}
            />
          ))}
        </nav>
      </div>
    </>
  );
}

function SidebarCategory({
  experimentId,
  runId,
  category,
}: {
  experimentId: string;
  runId: string;
  category: string;
}) {
  const run = useQuery(api.runs.getRunDetails, {
    runId: runId as Id<"runs">,
  });

  if (run === undefined) {
    return (
      <div className="p-4 text-slate-400 text-sm">Loading...</div>
    );
  }

  if (run === null) {
    return (
      <div className="p-4 text-red-400 text-sm">Run not found</div>
    );
  }

  const categoryEvals = run.evals
    .filter((e) => e.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <Link
            to="/experiment/$experimentId/run/$runId"
            params={{ experimentId, runId }}
            className="sidebar-header-back-btn"
            aria-label={`Back to ${run.model}`}
          >
            <BackIcon />
          </Link>
          <h1 className="sidebar-header-title">{formatCategoryName(category)}</h1>
        </div>
      </div>
      <div className="sidebar-list-section">
        <p className="sidebar-list-label">Evals ({categoryEvals.length})</p>
        <nav className="p-2 flex-1 overflow-auto">
          {categoryEvals.map((evalItem) => (
            <EvalLinkRow
              key={evalItem._id}
              experimentId={experimentId}
              runId={runId}
              evalItem={evalItem}
              isActive={false}
            />
          ))}
        </nav>
      </div>
    </>
  );
}

function SidebarEvalDetail({
  experimentId,
  runId,
  evalId,
}: {
  experimentId: string;
  runId: string;
  category: string;
  evalId: string;
}) {
  const run = useQuery(api.runs.getRunDetails, {
    runId: runId as Id<"runs">,
  });

  if (run === undefined) {
    return (
      <div className="p-4 text-slate-400 text-sm">Loading...</div>
    );
  }

  if (run === null) {
    return (
      <div className="p-4 text-red-400 text-sm">Run not found</div>
    );
  }

  const evals = [...run.evals].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <Link
            to="/experiment/$experimentId/run/$runId"
            params={{ experimentId, runId }}
            className="sidebar-header-back-btn"
            aria-label={`Back to ${run.model}`}
          >
            <BackIcon />
          </Link>
          <h1 className="sidebar-header-title">Eval details</h1>
        </div>
      </div>
      <div className="sidebar-list-section">
        <p className="sidebar-list-label">Evals ({evals.length})</p>
        <nav className="p-2 flex-1 overflow-auto">
          {evals.map((evalItem) => (
            <EvalLinkRow
              key={evalItem._id}
              experimentId={experimentId}
              runId={runId}
              evalItem={evalItem}
              isActive={evalItem._id === evalId}
            />
          ))}
        </nav>
      </div>
    </>
  );
}

function EvalLinkRow({
  experimentId,
  runId,
  evalItem,
  isActive,
}: {
  experimentId: string;
  runId: string;
  evalItem: Eval;
  isActive: boolean;
}) {
  const statusIcon = getEvalStatusIcon(evalItem.status);

  return (
    <Link
      to="/experiment/$experimentId/run/$runId/$category/$evalId"
      params={{
        experimentId,
        runId,
        category: evalItem.category,
        evalId: evalItem._id,
      }}
      search={{ tab: "steps" }}
      className={`sidebar-item block mb-1 ${isActive ? "active" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span>{statusIcon}</span>
        <span className="text-sm text-slate-300 truncate flex-1">
          {evalItem.name}
        </span>
      </div>
      {evalItem.status.kind === "failed" && (
        <div className="mt-1 text-xs text-red-400 truncate">
          {evalItem.status.failureReason}
        </div>
      )}
    </Link>
  );
}
