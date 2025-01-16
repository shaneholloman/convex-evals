import os
import re
import json
import sys
import time
import requests
from anthropic import Anthropic
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import subprocess
from convex_backend import deploy
from generate import generate
from typescript import setup_js, lint_js, typecheck_js
import argparse
import concurrent.futures
from errors import error_status
from models.anthropic_codegen import AnthropicModel
from models.openai_codegen import OpenAIModel
from models import ConvexCodegenModel

def generate_test(input_dir: str, output_root: str, model: ConvexCodegenModel):
    output_dir = os.path.join(output_root, input_dir)
    os.makedirs(output_dir, exist_ok=True)    
    generate(input_dir, output_dir, model)    

if __name__ == "__main__":
    load_dotenv()

    parser = argparse.ArgumentParser(description='Run tests with specified input and output directories')    
    parser.add_argument('--force', '-f', action='store_true', help='Overwrite output directory if it exists')
    parser.add_argument("--evals-dir", help="Evals directory", default="evals")
    parser.add_argument("--output-dir", help="Output directory")
    parser.add_argument('--test-filter', '-k', help='Filter tests by regexp')
    parser.add_argument('--skip-generation', '-g', action='store_true', help='Skip generation')
    parser.add_argument('--skip-evaluation', '-e', action='store_true', help='Skip evaluation')
    parser.add_argument('--concurrency', '-c', help='Concurrency', default=4)     
    parser.add_argument('--model', help="Model to use for generation", default="claude-3-5-sonnet-latest")

    args = parser.parse_args()    

    do_generation = not args.skip_generation
    do_evaluation = not args.skip_evaluation

    model = None
    if do_generation:
        if args.model.startswith("claude-3-5-sonnet"):
            model = AnthropicModel(args.model)
        elif args.model.startswith("gpt") or args.model.startswith("o1"):
            model = OpenAIModel(args.model)
        else:
            raise ValueError(f"Unknown model: {args.model}")

    evals_dir = args.evals_dir
    output_dir = args.output_dir
    if not output_dir:
        git_rev = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode("utf-8").strip()
        output_dir = f"output-{args.model}-{git_rev}"

    concurrency = int(args.concurrency)
    report_path = os.path.join(output_dir, "report.json")

    test_filter = re.compile(args.test_filter) if args.test_filter else None
    tests = [
        (category, test)        
        for category in os.listdir(evals_dir)
        if os.path.isdir(os.path.join(evals_dir, category))
        for test in os.listdir(os.path.join(evals_dir, category))
        if os.path.isdir(os.path.join(evals_dir, category, test))
        if test_filter is None or test_filter.match(f"{category}/{test}")
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
                future = executor.submit(generate_test, test_dir, output_dir, model)
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
        report = []
        for (category, test) in tests:
            print(f"Evaluating {category}/{test}...")
            test_output_dir = os.path.join(output_dir, 'evals', category, test)            
            report_entry = {
                "category": category,
                "test": test,
            }            
            all_ok = True
            try:
                setup_js(test_output_dir)    
                report_entry["setup"] = { "status": "ok" }                
            except Exception as e:                
                report_entry["setup"] = { "status": "failed", "error": str(e) }
                all_ok = False

            if report_entry["setup"]["status"] == "ok":
                try:
                    typecheck_js(test_output_dir)
                    report_entry["typecheck"] = { "status": "ok" }
                except Exception as e:
                    report_entry["typecheck"] = error_status(e)
                    all_ok = False

                try:
                    lint_js(test_output_dir)
                    report_entry["lint"] = { "status": "ok" }
                except Exception as e:
                    report_entry["lint"] = error_status(e)
                    all_ok = False

                try:
                    deploy(test_output_dir)
                    report_entry["deploy"] = { "status": "ok" }
                except Exception as e:
                    report_entry["deploy"] = error_status(e)
                    all_ok = False

            report.append(report_entry)
            if not all_ok:
                any_failed = True

        with open(report_path, "w") as f:
            json.dump(report, f)

        if any_failed:
            raise Exception("Evaluation failed.")

    