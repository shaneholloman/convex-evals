# 022-unbounded_query_no_collect

This eval is intentionally testing the model's default behavior for list-style Convex queries.

The task asks for `listAuditLogs`, but it does **not** explicitly ask for all audit logs. The grading philosophy is that an agent should not default to `.collect()` for a plain listing query like this. Instead, it should prefer a bounded read such as `.take(n)` or pagination.

## What this eval is trying to measure

We want to know whether the model has a safe default when the user asks for a list but does not explicitly say:

- return every row
- export all data
- fetch the complete set

In that situation, the safer default for an AI agent is:

- use `.take(n)` for a bounded preview or list
- or use pagination if the list should continue

Using `.collect()` by default is treated as a mistake in this eval.

## Why `.collect()` is considered wrong here

For a human, there are valid cases where `.collect()` is correct. But for agentic code generation, `.collect()` is often an unsafe default because:

- the task may describe a table that grows over time
- the user may only want a normal UI list, not a full export
- `.collect()` can silently create future performance problems

So this eval is intentionally biased toward agent safety. If the prompt does not explicitly require the full set, the model should avoid `.collect()`.

## What would make `.collect()` acceptable

If the task explicitly said something like:

- return all audit logs
- export every audit log for the workspace
- fetch the complete history

then `.collect()` would be a reasonable choice.

That is not what this task says.

## Grading rule

Behavior tests still verify that the query works for the requested workspace.

But the main signal is the AST check:

- if the generated `convex/index.ts` uses `.collect()`, the eval fails
- if it uses a bounded read pattern instead, it can pass

This is deliberate. The eval is testing the model's default heuristic, not just whether the returned array has the right contents.
