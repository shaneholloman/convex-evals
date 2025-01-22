import sys
import os
from convex_backend import convex_backend, deploy
import subprocess

output_dir = sys.argv[1]
category = sys.argv[2]
test = sys.argv[3]


evals_dir = "evals"
test_dir = os.path.join(evals_dir, category, test)

test_output_dir = os.path.join(output_dir, "evals", category, test)
backend_dir = os.path.join(test_output_dir, "backend")
project_dir = os.path.join(test_output_dir, "project")

answer_backend_dir = os.path.join(test_dir, "backend")
answer_dir = os.path.join(test_dir, "answer")

subprocess.check_call(
    ["bunx", "tsc", "-noEmit", "-p", os.path.join(test_output_dir, "project", "convex")],
)
subprocess.check_call(
    [
        "bunx",
        "eslint",
        "-c",
        "eslint.config.mjs",
        os.path.join(test_output_dir, "project", "convex"),
    ],
)

with convex_backend(backend_dir) as backend:
    deploy(backend, project_dir)

    with convex_backend(answer_backend_dir) as answer_backend:
        deploy(answer_backend, answer_dir)

        test_file = os.path.abspath(os.path.join(test_dir, "grader.test.ts"))
        env = dict(
            os.environ,
            CONVEX_PORT=str(backend["port"]),
            CONVEX_ANSWER_PORT=str(answer_backend["port"]),
        )
        subprocess.check_call(
            ["bunx", "vitest", "run", test_file],
            env=env,
        )
