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
from typescript import setup_js, lint_js
import argparse
import concurrent.futures

def generate_test(input_dir: str, output_root: str, client: Anthropic):
    output_dir = os.path.join(output_root, input_dir)
    os.makedirs(output_dir, exist_ok=True)    
    generate(input_dir, output_dir, client)    

if __name__ == "__main__":
    load_dotenv()

    parser = argparse.ArgumentParser(description='Run tests with specified input and output directories')    
    parser.add_argument('--force', '-f', action='store_true', help='Overwrite output directory if it exists')
    parser.add_argument("--evals-dir", help="Evals directory", default="evals")
    parser.add_argument("--output-dir", help="Output directory", default="output")
    parser.add_argument('--test-filter', '-k', help='Filter tests by regexp')
    parser.add_argument('--skip-generation', '-g', action='store_true', help='Skip generation')
    parser.add_argument('--skip-evaluation', '-e', action='store_true', help='Skip evaluation')
    parser.add_argument('--concurrency', '-c', help='Concurrency', default=4)
    
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key is None:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    client = Anthropic(api_key=api_key)

    do_generation = not args.skip_generation
    do_evaluation = not args.skip_evaluation
    evals_dir = args.evals_dir
    output_dir = args.output_dir
    concurrency = int(args.concurrency)

    test_filter = re.compile(args.test_filter) if args.test_filter else None
    tests = [
        (category, test)        
        for category in os.listdir(evals_dir)
        if os.path.isdir(os.path.join(evals_dir, category))
        for test in os.listdir(os.path.join(evals_dir, category))
        if os.path.isdir(os.path.join(evals_dir, category, test))
        if test_filter is None or test_filter.match(test)
    ]  
    tests.sort()

    if do_generation:
        if args.force and os.path.exists(output_dir):
            shutil.rmtree(output_dir)                
        os.makedirs(output_dir, exist_ok=False)                

        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {}
            for category, test in tests:
                test_dir = os.path.join(evals_dir, category, test)
                future = executor.submit(generate_test, test_dir, output_dir, client)
                futures[future] = (category, test_dir)            
            any_failed = False
            for future in concurrent.futures.as_completed(futures):
                test_dir = futures[future]
                try:
                    future.result()
                except Exception as e:
                    print(f"Error generating {test_dir}: {e}")
                    any_failed = True

            if any_failed:
                raise Exception("Generation failed.")            

    if do_evaluation:
        any_failed = False
        for (category, test) in tests:
            print(f"Evaluating {category}/{test}...")
            test_output_dir = os.path.join(output_dir, 'evals', category, test)
            try:            
                setup_js(test_output_dir)    
                lint_js(test_output_dir)
                deploy(test_output_dir)
                print(f"Evaluation of {category}/{test} succeeded")
            except Exception as e:
                print(f"Error evaluating {category}/{test}: {e}")
                any_failed = True
                
        if any_failed:
            raise Exception("Evaluation failed.")

    