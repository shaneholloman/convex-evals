import os
import sys
import time
import requests
from anthropic import Anthropic
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import subprocess
from convex_backend import deploy
from generate import generate
from typescript import setup_js

def run_test(input_dir: str, output_root: str, client: Anthropic):
    output_dir = os.path.join(output_root, input_dir)
    os.makedirs(output_dir, exist_ok=True)    
    generate(input_dir, output_dir, client)
    setup_js(output_dir)    
    deploy(output_dir)

if __name__ == "__main__":
    load_dotenv()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key is None:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    client = Anthropic(api_key=api_key)

    test_dir = sys.argv[1]
    out_dir = sys.argv[2]

    os.makedirs(out_dir, exist_ok=False)

    print(f"Running {test_dir} -> {out_dir}")
    run_test(test_dir, out_dir, client)
