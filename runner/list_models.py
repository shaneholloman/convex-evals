#!/usr/bin/env python3
"""
Output model names as JSON for use in CI workflows.
This keeps runner/models/__init__.py as the single source of truth.
"""
import json
import argparse
from runner.models import ALL_MODELS, ModelProvider, CIRunFrequency


def get_models(
    provider: ModelProvider | None = None,
    frequency: CIRunFrequency | None = None,
) -> list[str]:
    models = ALL_MODELS

    if provider is not None:
        models = [m for m in models if m.provider == provider]

    if frequency is not None:
        models = [m for m in models if m.ci_run_frequency == frequency]

    return [m.name for m in models]


def main():
    parser = argparse.ArgumentParser(description="List available models as JSON")
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai", "together", "google", "xai", "all"],
        default="all",
        help="Filter by provider (default: all)",
    )
    parser.add_argument(
        "--frequency",
        choices=["daily", "weekly", "monthly", "never", "all"],
        default="all",
        help="Filter by CI run frequency (default: all)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    provider = None if args.provider == "all" else ModelProvider(args.provider)
    frequency = None if args.frequency == "all" else args.frequency
    models = get_models(provider, frequency)

    if args.format == "json":
        print(json.dumps(models))
    else:
        print(",".join(models))


if __name__ == "__main__":
    main()
