default:
    @just --list

# Format Python code with Black
format-python:
    pdm run black .

format-js:
    bunx prettier --write .