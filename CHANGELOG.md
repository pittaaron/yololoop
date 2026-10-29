# Changelog

## Unreleased

- Fixed `loop` with per-item branches re-running earlier items and skipping later ones when `origin/main` exists. New item branches now start from the commit the backlog was read from, except on `main`.
- A run whose item is already checked off on its branch is recorded as `skipped` instead of re-running the route.
- Backlog items are checked off by title, so lines added or removed above an item no longer check off the wrong line.
- Live runs refuse to start without gates; pass `--allow-no-gates` to run unverified work anyway. `plan` reports the same block.
- `run --commit` and `loop --commit` refuse to start on a dirty working tree, so unrelated changes no longer land in an item's commit.
- Routes and gates run in their own process group. Timeouts, leftover background processes and interrupting yololoop now stop every process a route started, not just the first one, and an interrupted run is recorded as failed.
- Added `examples/harness2-route`, a route that runs each backlog item through Harness² to improve the agent's harness as the loop runs.

## 0.0.3 - 2026-06-18

- Prepared the package for npm distribution.
- Updated the README install path for the public npm package.

## 0.0.2 - 2026-06-18

- Removed account-specific model IDs from the generated starter config.
- Tightened public issue, PR, security, and release guidance.
- Kept site assets outside the OSS package boundary.

## 0.0.1 - 2026-06-18

- Initial local-first OSS core.
- Added `init`, `doctor`, `plan`, `run --once`, `loop`, `pr`, and `status` commands.
- Added command routes, model routes, gates, branch-backed commits, run artifacts, and block-level execution history.
