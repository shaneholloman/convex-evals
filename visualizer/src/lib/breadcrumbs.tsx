import { Link } from "@tanstack/react-router";
import { formatCategoryName } from "./evalComponents";

export type BreadcrumbCurrent = "experiment" | "run" | "category" | "eval";

function experimentDisplayName(experimentId: string): string {
  return experimentId === "default" ? "with_guidelines" : experimentId;
}

export function Breadcrumbs({
  experimentId,
  runId,
  runModel,
  category,
  evalName,
  current,
}: {
  experimentId?: string;
  runId?: string;
  runModel?: string;
  category?: string;
  evalName?: string;
  current: BreadcrumbCurrent;
}) {
  if (!experimentId) {
    return (
      <div className="breadcrumb">
        <span className="breadcrumb-current">Experiments</span>
      </div>
    );
  }

  const expName = experimentDisplayName(experimentId);

  return (
    <div className="breadcrumb">
      <Link to="/" className="breadcrumb-btn">
        Experiments
      </Link>
      <span className="breadcrumb-separator">→</span>
      {current === "experiment" ? (
        <span className="breadcrumb-current">{expName}</span>
      ) : (
        <>
          <Link
            to="/experiment/$experimentId"
            params={{ experimentId }}
            className="breadcrumb-btn"
          >
            {expName}
          </Link>
          <span className="breadcrumb-separator">→</span>
          {!runId || !runModel ? null : current === "run" ? (
            <span className="breadcrumb-current">{runModel}</span>
          ) : (
            <>
              <Link
                to="/experiment/$experimentId/run/$runId"
                params={{ experimentId, runId }}
                className="breadcrumb-btn"
              >
                {runModel}
              </Link>
              <span className="breadcrumb-separator">→</span>
              {!category ? null : current === "category" ? (
                <span className="breadcrumb-current">
                  {formatCategoryName(category)}
                </span>
              ) : (
                <>
                  <Link
                    to="/experiment/$experimentId/run/$runId/$category"
                    params={{ experimentId, runId, category }}
                    className="breadcrumb-btn"
                  >
                    {formatCategoryName(category)}
                  </Link>
                  <span className="breadcrumb-separator">→</span>
                  {evalName != null ? (
                    <span className="breadcrumb-current">{evalName}</span>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
