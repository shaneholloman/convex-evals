+ See package.json to work out how to run the models
+ Model definitions are stored in /runner/models/__init__.py
+ Models run periodically via github actions
+ When adding a new moodel, please run it at least once against one or two evals too make sure it works
+ This project uses bun extensively, including for its package manager and running tests and scripts
+ You should look at the package.json for the scripts you can use
+ You should `bun run typecheck` regularly to ensure that any changes have not broken the types
+ Run `bun run test` to run all test suites (runner unit tests + evalScores backend tests). Do this after making changes to the runner or evalScores backend.

## Convex Deployments

The evalScores backend has two Convex deployments:

+ **Production**: `https://fabulous-panther-525.convex.cloud` — used by CI/GitHub Actions. The GitHub secret `CONVEX_EVAL_URL` must point to this URL.
+ **Development**: `https://brazen-pelican-414.convex.cloud` — used for local development (`bun run dev` in evalScores/).

The runner communicates with the Convex backend via `ConvexClient` using the public mutations/queries in `evalScores/convex/admin.ts`. Authentication is done via a bearer token passed as an argument to each function (validated against the `authTokens` table). The GitHub secret `CONVEX_AUTH_TOKEN` holds this token for CI.

When deploying changes to the evalScores backend, use `npx convex deploy` from the `evalScores/` directory (handled automatically by the release workflow). Do NOT deploy local dev changes to production accidentally.

## Deployment & Migration Workflow

When making schema or data changes to the Convex backend that require migrations:

1. **Never deploy directly to production** from your local dev environment.
2. **Commit and push to `main`** to trigger the `release.yml` workflow, which auto-deploys the Convex backend to production.
3. **Monitor the deploy** via: `gh run list --workflow=release.yml --limit=1 --watch`
4. **After the deploy completes**, run any pending migrations via the CLI:
   ```bash
   cd evalScores && npx convex run migrations:runAll --prod
   ```
5. **Monitor migration progress**:
   ```bash
   npx convex run --component migrations lib:getStatus --watch --prod
   ```
6. **If the migration enables further schema tightening** (e.g. making optional fields required, removing deprecated tables), make those changes in a **second commit** and push again to deploy the tightened schema.

The general pattern is: deploy code first (with loose/compatible schema), run data migrations, then deploy tightened schema.

## Run Analysis Reports

The `reports/` directory contains post-run analysis reports organised by provider and model:

```
reports/{provider}/{model}/{run-id-prefix}_{date}.md
```

For example: `reports/anthropic/claude-opus-4-6/jn72t14a_2026-02-06.md`

Each report contains:
+ Per-failure classification (model fault, overly strict testing, ambiguous task, known gap)
+ Cross-cutting patterns across failures
+ Actions taken (lint config changes, grader fixes, task updates)
+ Net impact assessment

When investigating a model's performance or deciding whether to adjust eval requirements, check the reports directory for prior analyses of the same model or similar failure patterns.