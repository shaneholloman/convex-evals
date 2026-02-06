+ See package.json to work out how to run the models
+ Model definitions are stored in /runner/models/__init__.py
+ Models run periodically via github actions
+ When adding a new moodel, please run it at least once against one or two evals too make sure it works
+ This project uses bun extensively, including for its package manager and running tests and scripts
+ You should look at the package.json for the scripts you can use
+ You should `bun run typecheck` regularly to ensure that any changes have not broken the types
+ Run `bun run test` to run all test suites (runner unit tests + evalScores backend tests). Do this after making changes to the runner or evalScores backend.