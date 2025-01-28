import os
import sys
import subprocess
from runner.models.anthropic_codegen import AnthropicModel
import glob

def input_continue(message="Press enter to continue..."):
    input(message)

def open_in_cursor(filepath):
    subprocess.run(["cursor", filepath], check=False)
    input_continue(f"Opened {filepath} in Cursor. Press enter when done editing...")

def get_example_tasks():
    tasks = []
    for task_file in glob.glob("evals/**/TASK.txt", recursive=True):
        with open(task_file, "r") as f:
            tasks.append(f.read().strip())
    return tasks

def generate_task_description(one_line_desc, example_tasks):
    model = AnthropicModel("claude-3-5-sonnet-latest")
    prompt = f"""Given this one line description of a task:
{one_line_desc}

Please generate a detailed TASK.txt file describing what needs to be implemented. The task should be clear and specific about what Convex backend files and functions need to be created.

Here are some example TASK.txt files for reference:

{chr(10).join(f'Example {i+1}:{chr(10)}{task}{chr(10)}' for i, task in enumerate(example_tasks[-10:]))}

Generate a similar style TASK.txt for the given one-line description."""

    response = model.client.chat.completions.create(
        model="claude-3-5-sonnet-latest",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000,
    )
    return response.choices[0].message.content.strip()

def main():
    # Step 1: Get category and name
    if len(sys.argv) != 3:
        print("Usage: python create_eval.py <category> <name>")
        sys.exit(1)

    category = sys.argv[1]
    name = sys.argv[2]

    print(f"\nStep 1: Creating eval directory for category '{category}' and name '{name}'")

    evals_dir = "evals"
    categories = os.listdir(evals_dir)

    category_by_name = {category.split("-")[1]: category for category in categories}
    next_category_number = max(int(category.split("-")[0]) for category in categories) + 1

    if category not in category_by_name:
        print(f"Creating new category {category}")
        category_dir = os.path.join(evals_dir, f"{next_category_number:03d}-{category}")
        os.makedirs(category_dir)
    else:
        category_dir = os.path.join(evals_dir, category_by_name[category])

    existing = [int(existing_name.split("-")[0]) for existing_name in os.listdir(category_dir)]
    next_id = max(existing) + 1 if existing else 0

    assert "-" not in name
    testdir_name = f"{next_id:03d}-{name}"
    testdir = os.path.join(category_dir, testdir_name)
    os.makedirs(testdir)

    # Step 2: Get one-line task description
    print("\nStep 2: Enter a one-line description of the task")
    one_line_desc = input("Description: ")

    # Step 3: Generate TASK.txt
    print("\nStep 3: Generating TASK.txt")
    example_tasks = get_example_tasks()
    task_description = generate_task_description(one_line_desc, example_tasks)

    task_file = os.path.join(testdir, "TASK.txt")
    with open(task_file, "w") as f:
        f.write(task_description)

    # Step 4: Edit TASK.txt
    print("\nStep 4: Opening TASK.txt for editing")
    open_in_cursor(task_file)

    # Step 5: Create answer directory and package.json
    print("\nStep 5: Creating answer directory and package.json")
    answer_dir = os.path.join(testdir, "answer")
    os.makedirs(answer_dir)

    package_json = """{
  "name": "convexbot",
  "version": "1.0.0",
  "dependencies": {
    "convex": "^1.17.4"
  }
}""".strip()

    with open(os.path.join(answer_dir, "package.json"), "w") as f:
        f.write(package_json)

    # Run bun install and codegen
    subprocess.run(["bun", "install"], cwd=answer_dir, check=True)
    subprocess.run(["bunx", "convex", "codegen"], cwd=answer_dir, check=True)

    # Step 6: Generate answer files
    print("\nStep 6: Generating answer files")
    convex_dir = os.path.join(answer_dir, "convex")
    os.makedirs(convex_dir)

    model = AnthropicModel("claude-3-5-sonnet-latest")
    with open(task_file, "r") as f:
        task_content = f.read()

    generated_files = model.generate(task_content)
    for path, content in generated_files.items():
        full_path = os.path.join(answer_dir, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w") as f:
            f.write(content)

    # Step 7: Edit index.ts
    print("\nStep 7: Opening index.ts for editing")
    open_in_cursor(os.path.join(convex_dir, "index.ts"))

    # Step 8: Generate and edit grader.test.ts
    print("\nStep 8: Generating grader.test.ts")
    grader_ts = """
import { expect, test } from "vitest";
import { adminClient, client, compareSchema, compareFunctionSpec } from "../../../grader";
import { anyApi } from "convex/server"

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
})

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
})
"""

    grader_file = os.path.join(testdir, "grader.test.ts")
    with open(grader_file, "w") as f:
        f.write(grader_ts)

    print("\nOpening grader.test.ts for editing")
    open_in_cursor(grader_file)

    # Step 9: Run tests
    print("\nStep 9: Running tests")
    test_filter = f"{category}/{testdir_name}"
    env = os.environ.copy()
    env["TEST_FILTER"] = test_filter
    env["OUTPUT_TEMPDIR"] = "/tmp/convex-codegen-evals"

    subprocess.run(
        ["pdm", "run", "braintrust", "eval", "runner/eval_convex_coding.py"],
        env=env,
        check=False
    )

    # Step 10: Create and edit GAPS.txt
    print("\nStep 10: Creating GAPS.txt")
    gaps_file = os.path.join(testdir, "GAPS.txt")
    with open(gaps_file, "w") as f:
        f.write(f"{category}, {name}:\n")

    open_in_cursor(gaps_file)

    # Step 11: Git commit
    print("\nStep 11: Committing to git")
    subprocess.run(["git", "add", testdir], check=True)
    subprocess.run(["git", "commit", "-m", f"eval: {category} {name}"], check=True)

    print("\nDone! New eval created at:", testdir)

if __name__ == "__main__":
    main()
