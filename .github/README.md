# GitHub Configuration

This directory contains repository automation and policy configuration.

## Key files

- `dependabot.yml`: Scheduled dependency update configuration.
- `labeler.yml`: Label rules used by the `Labeler` workflow.

## Workflows

- `workflows/dependency-review.yml`: Checks dependency risk on pull requests targeting `main`.
- `workflows/deps-maintenance.yml`: Scheduled dependency maintenance (`npm update`, `npm audit fix`) and rolling PR updates.
- `workflows/label.yml`: Applies labels to pull requests using `.github/labeler.yml`.
