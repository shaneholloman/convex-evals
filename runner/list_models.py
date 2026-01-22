#!/usr/bin/env python3
"""
Output model names as JSON for use in CI workflows.
This keeps runner/models/__init__.py as the single source of truth.
"""
import json
import argparse
from runner.models import ALL_MODELS, ModelProvider


def get_models_by_provider(provider: ModelProvider | None = None) -> list[str]:
    if provider is None:
        return [model.name for model in ALL_MODELS]
    return [model.name for model in ALL_MODELS if model.provider == provider]


def main():
    parser = argparse.ArgumentParser(description="List available models as JSON")
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai", "together", "google", "xai", "all"],
        default="all",
        help="Filter by provider (default: all)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv"],
        default="json",
        help="Output format (default: json)",
    )
    args = parser.parse_args()

    provider = None if args.provider == "all" else ModelProvider(args.provider)
    models = get_models_by_provider(provider)

    if args.format == "json":
        print(json.dumps(models))
    else:
        print(",".join(models))


if __name__ == "__main__":
    main()
