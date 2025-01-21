class Guideline:
    def __init__(self, content: str):
        self.content = content.strip()


class GuidelineSection:
    def __init__(self, name: str, children: list):
        self.name = name
        self.children = children


CONVEX_GUIDELINES = GuidelineSection(
    "convex_guidelines",
    [
        GuidelineSection(
            "function_guidelines",
            [
                GuidelineSection(
                    "new_function_syntax",
                    [
                        Guideline(
                            """
      ALWAYS use the new function syntax for Convex functions. For example:
      ```typescript
      import { query } from "./_generated/server";
      import { v } from "convex/values";
      export const f = query({
          args: {},
          returns: v.null(),
          handler: async (ctx, args) => {
          // Function body
          },
      });
      ```
      """
                        ),
                    ],
                ),
                GuidelineSection(
                    "http_endpoint_syntax",
                    [
                        Guideline(
                            """
      HTTP endpoints are defined in `convex/http.ts` and require an `httpAction` decorator. For example:
      ```typescript
      import { httpRouter } from "convex/server";
      import { httpAction } from "./_generated/server";
      const http = httpRouter();
      http.route({
          path: "/echo",
          method: "POST",
          handler: httpAction(async (ctx, req) => {
          const body = await req.bytes();
          return new Response(body, { status: 200 });
          }),
      });
      ```
      """
                        ),
                    ],
                ),
                GuidelineSection(
                    "function_registration",
                    [
                        Guideline(
                            "Use `internalQuery`, `internalMutation`, and `internalAction` to register internal functions."
                        ),
                        Guideline(
                            "Use `query`, `mutation`, and `action` to register public functions."
                        ),
                        Guideline(
                            "You CANNOT register a function through the `api` or `internal` objects."
                        ),
                        Guideline(
                            "ALWAYS include argument and return validators for all registered functions."
                        ),
                        Guideline(
                            "If the JavaScript implementation of a Convex function doesn't have a return value, it implicitly returns `null`."
                        ),
                    ],
                ),
                GuidelineSection(
                    "function_calling",
                    [
                        Guideline(
                            "Use `ctx.runQuery` to call a query from a query, mutation, or action."
                        ),
                        Guideline(
                            "Use `ctx.runMutation` to call a mutation from a mutation or action."
                        ),
                        Guideline("Use `ctx.runAction` to call an action from an action."),
                        Guideline(
                            "ONLY call an action from another action if you need to cross runtimes (e.g. from V8 to Node). Otherwise, pull out the shared code into a helper async function and call that directly instead."
                        ),
                        Guideline(
                            "Try to use as few calls from actions to queries and mutations as possible. Queries and mutations are transactions, so splitting logic up into multiple calls introduces the risk of race conditions."
                        ),
                        Guideline(
                            "All of these calls take in a `FunctionReference`. Do NOT try to pass the callee function directly into one of these calls."
                        ),
                    ],
                ),
                GuidelineSection(
                    "function_references",
                    [
                        Guideline(
                            "Function references are pointers to registered Convex functions."
                        ),
                        Guideline(
                            "Use the `api` object defined by the framework in `convex/_generated/api.ts` to call public functions registered with `query`, `mutation`, or `action`."
                        ),
                        Guideline(
                            "Use the `internal` object defined by the framework in `convex/_generated/api.ts` to call internal (or private) functions registered with `internalQuery`, `internalMutation`, or `internalAction`."
                        ),
                        Guideline(
                            "Convex uses file-based routing, so a public function defined in `convex/example.ts` named `f` has a function reference of `api.example.f`."
                        ),
                        Guideline(
                            "A private function defined in `convex/example.ts` named `g` has a function reference of `internal.example.g`."
                        ),
                        Guideline(
                            "Functions can also registered within directories nested within the `convex/` folder. For example, a public function `h` defined in `convex/messages/access.ts` has a function reference of `api.messages.access.h`."
                        ),
                    ],
                ),
                GuidelineSection(
                    "api_design",
                    [
                        Guideline(
                            "Convex uses file-based routing, so thoughtfully organize files with public query, mutation, or action functions within the `convex/` directory."
                        ),
                        Guideline(
                            "Use `query`, `mutation`, and `action` to define public functions."
                        ),
                        Guideline(
                            "Use `internalQuery`, `internalMutation`, and `internalAction` to define private, internal functions."
                        ),
                    ],
                ),
            ],
        ),
        GuidelineSection(
            "validator_guidelines",
            [
                Guideline(
                    "`v.bigint()` is deprecated for representing signed 64-bit integers. Use `v.int64()` instead."
                ),
                Guideline(
                    "Use `v.record()` for defining a record type. `v.map()` and `v.set()` are not supported."
                ),
            ],
        ),
        GuidelineSection(
            "schema_guidelines",
            [
                Guideline("Always define your schema in `convex/schema.ts`."),
                Guideline("Always import the schema definition functions from `convex/server`:"),
            ],
        ),
        GuidelineSection(
            "query_guidelines",
            [
                Guideline(
                    "Do NOT use `filter` in queries. Instead, define an index in the schema and use `withIndex` instead."
                ),
                Guideline(
                    "Convex queries do NOT support `.delete()`. Instead, `.collect()` the results, iterate over them, and call `ctx.db.delete(row._id)` on each result."
                ),
            ],
        ),
        GuidelineSection(
            "mutation_guidelines",
            [
                Guideline(
                    "Use `ctx.db.replace` to fully replace an existing document. This method will throw an error if the document does not exist."
                ),
                Guideline(
                    "Use `ctx.db.patch` to shallow merge updates into an existing document. This method will throw an error if the document does not exist."
                ),
            ],
        ),
        GuidelineSection(
            "scheduling_guidelines",
            [
                GuidelineSection(
                    "cron_guidelines",
                    [
                        Guideline(
                            "Only use the `crons.interval` or `crons.cron` methods to schedule cron jobs. Do NOT use the `crons.hourly`, `crons.daily`, or `crons.weekly` helpers."
                        ),
                        Guideline(
                            "The `crons.interval` method schedules a function to run periodically, starting when the cron job is first deployed to Convex."
                        ),
                        Guideline(
                            "The `crons.cron` method schedules a function to run at a specific time in UTC."
                        ),
                    ],
                ),
            ],
        ),
    ],
)
