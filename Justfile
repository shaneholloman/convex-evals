default:
    @just --list

# Format Python code with Black
lint-python:
    pdm run black . 