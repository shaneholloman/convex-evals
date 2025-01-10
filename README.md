- LLM architecture: prompt -> (public API + schema + background arch?) -> TS

# TS evaluations

- valid syntax
- typechecks
- deploys fine



- Pitfalls
  - Old function syntax
  - Directly calling convex functions    
  - eslint stuff
    - dangling promises
    - unused imports/variables/etc.
  - custom eslint stuff: https://github.com/get-convex/convex/pull/30229
    - non "use node" files aren't allowed to import from "use node" files
  - https://www.notion.so/convex-dev/Convex-strict-mode-best-practices-15bb57ff32ab80d7b59ed7cfbd817084
    - Using filter
    - One index is a prefix of another
    - authentication set up if needed
    - authorization on all public functions if needed  
    - runAction only used for calling v8 to node (or for running stuff in parallel)
    - no sequential ctx.runMutation or ctx.runQuery
    - don't use ctx.runMutation and ctx.runQuery for subtransactions


- Succinctness vs. "large scale"    
  - public functions should have argument + return validators
  - only use internal functions for `ctx.run*` and `ctx.scheduler`  