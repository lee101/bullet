# CI Setup Instructions

This branch contains the configuration for setting up GitHub Actions CI with Codex Infinity Sentinel.

## Required Steps

### 1. Add the CI workflow file

Create `.github/workflows/ci.yml` with the following content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: [self-hosted, codex-infinity]

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Run tests
        run: bun run test

      - name: Report CI status to Sentinel
        if: always()
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.CODEX_INFINITY_API_KEY }}" \
            -d '{
              "ci_sentinel_id": "${{ secrets.CI_SENTINEL_ID }}",
              "status": "${{ job.status }}",
              "commit_sha": "${{ github.sha }}",
              "branch": "${{ github.ref_name }}",
              "run_id": "${{ github.run_id }}",
              "run_url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }' \
            "https://codexinfinity.com/api/ci-sentinels/dde3c836-5489-43f5-99b3-571e45ae1c72/events"
```

### 2. Configure Repository Secrets

Add the following secrets in Settings > Secrets and variables > Actions:

- `CI_SENTINEL_ID`: `dde3c836-5489-43f5-99b3-571e45ae1c72`
- `CODEX_INFINITY_API_KEY`: Your Codex Infinity API key

### 3. Self-Hosted Runner

Ensure a self-hosted runner with the label `codex-infinity` is registered for this repository.
