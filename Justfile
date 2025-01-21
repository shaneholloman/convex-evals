default:
    @just --list

format:
    just format-python
    just format-js

# Format Python code with Black
format-python:
    pdm run black .

format-js:
    bunx prettier --write .