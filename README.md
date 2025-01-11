# Convex Coding Evals

LLMs don't have *perfect* knowledge of Convex, so they require some prompting
to help them along. This repo contains a set of prompts for coding a Convex
backend, a set of human-curated solutions, and a script for evaluating the
LLM's output.

## Running the evaluations
```
pip install pdm
pdm install

npm install -g bun
bun install

cat "ANTHROPIC_API_KEY=<your ANTHROPIC_API_KEY>" > .env

pdm run python runner/main.py 
```

If you'd like to grade the evaluations again without regenerating them, run:
```
pdm run python runner/main.py --skip-generation
```

You can also write out a JSON report for pretty printing:
```
pdm run python runner/main.py --report=/tmp/report.json
pdm run python print_report.py /tmp/report.json
```

## Creating a new evaluation
```
pdm run python create_eval.py <name> <category>
```
For example, adding a new fundmentals eval for using HTTP actions and storage would be:
```
pdm run python create_eval.py http_actions_file_storage 000-fundamentals
```
Note that test or category names cannot contain dashes.
