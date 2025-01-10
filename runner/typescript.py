import subprocess
import os

def setup_js(output_dir: str):
    project_dir = os.path.abspath(os.path.join(output_dir, 'project'))
    subprocess.run(
        ['bun', 'install'],
        cwd=project_dir,
        check=True,
    )
    print("Install OK!")
    subprocess.run(
        ['bunx', 'convex', 'codegen'],
        cwd=project_dir,
        check=True,
    )
    print("Codegen OK!")
    tsconfig = open('tsconfig.json').read()
    with open(os.path.join(project_dir, 'convex', 'tsconfig.json'), 'w') as f:
        f.write(tsconfig)


def lint_js(output_dir: str):
    convex_dir = os.path.abspath(os.path.join(output_dir, 'project', 'convex'))
    subprocess.run(
        ['bunx', 'tsc', '-noEmit', '-p', convex_dir],
        check=True,
    )
    print("Typecheck OK!")
    subprocess.run(
        ['bunx', 'eslint', '-c', 'eslint.config.mjs', convex_dir],
        check=True,
    )
    print("ESLint OK!")
