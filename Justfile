default:
    @just --list

# Format Python code with Black
format-python:
    pdm run black . 