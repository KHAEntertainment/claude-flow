#!/usr/bin/env python3
"""
Test Runner for Tool Gating MCP

This script provides a convenient way to run the new capability-focused test suite.
It can run all tests or specific test categories.

Usage:
    python tests/run_tests.py                    # Run all tests
    python tests/run_tests.py --category flows   # Run system flow tests only
    python tests/run_tests.py --verbose          # Run with verbose output
    python tests/run_tests.py --fast             # Skip slow performance tests
"""

import argparse
import subprocess
import sys
from pathlib import Path


def run_pytest(test_files=None, extra_args=None):
    """Run pytest with specified files and arguments"""
    
    cmd = ["python", "-m", "pytest"]
    
    if test_files:
        cmd.extend(test_files)
    else:
        cmd.append("tests/")
    
    if extra_args:
        cmd.extend(extra_args)
    
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=False)
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Run Tool Gating MCP tests")
    
    parser.add_argument(
        "--category", 
        choices=["flows", "resources", "errors", "contracts", "integration"],
        help="Run tests for specific capability category"
    )
    
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Run tests with verbose output"
    )
    
    parser.add_argument(
        "--fast",
        action="store_true", 
        help="Skip slow performance tests"
    )
    
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Run tests with coverage reporting"
    )
    
    args = parser.parse_args()
    
    # Determine which test files to run
    test_files = []
    if args.category:
        category_map = {
            "flows": "test_system_flows.py",
            "resources": "test_resource_management.py", 
            "errors": "test_error_handling.py",
            "contracts": "test_api_contracts.py",
            "integration": "test_cross_server_integration.py"
        }
        test_files = [f"tests/{category_map[args.category]}"]
    
    # Build pytest arguments
    pytest_args = []
    
    if args.verbose:
        pytest_args.append("-v")
    
    if args.fast:
        pytest_args.extend(["-m", "not slow"])
    
    if args.coverage:
        pytest_args.extend([
            "--cov=tool_gating_mcp",
            "--cov-report=html",
            "--cov-report=term-missing"
        ])
    
    # Add useful default options
    pytest_args.extend([
        "--tb=short",  # Shorter traceback format
        "--strict-markers",  # Strict marker checking
        "-ra"  # Show summary for all outcomes except passed
    ])
    
    # Run the tests
    exit_code = run_pytest(test_files, pytest_args)
    
    if exit_code == 0:
        print("\n✅ All tests passed!")
    else:
        print(f"\n❌ Tests failed with exit code {exit_code}")
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()