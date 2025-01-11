import sys
import json
from typing import List, Dict

report_path = sys.argv[1]
report = json.load(open(report_path))

def get_status_symbol(status: str) -> str:
    return "✓" if status == "ok" else "✗"

# Calculate summary statistics
total_tests = len(report)
passed_tests = sum(
    all(step["status"] == "ok" for step in test.values() if isinstance(step, dict))
    for test in report
)
pass_percentage = (passed_tests / total_tests) * 100

# Print summary
print(f"\nTest Summary: {passed_tests}/{total_tests} tests passed ({pass_percentage:.1f}%)\n")

# Print table header
print("Category".ljust(20) + "| Test".ljust(30) + "  | Setup | Type  | Lint  | Deploy")
print("-" * 85)

# Print each test result
for test in report:
    test_name = test["test"]
    category = test.get("category", "").ljust(20)  # Get category, default to empty string if not present
    setup_status = get_status_symbol(test["setup"]["status"])
    type_status = get_status_symbol(test["typecheck"]["status"])
    lint_status = get_status_symbol(test["lint"]["status"])
    deploy_status = get_status_symbol(test["deploy"]["status"])
    
    print(f"{category.ljust(20)}| {test_name[:30].ljust(30)}|   {setup_status}   |   {type_status}   |   {lint_status}   |   {deploy_status}")
print()