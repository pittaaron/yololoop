# Contributing

Thanks for helping improve yololoop.

## Development

```bash
npm install
npm run check
```

The package has no runtime dependencies. Keep new dependencies rare and justify them in the pull request.

## Pull Requests

- Keep changes focused.
- Add tests for runtime behavior, config parsing, route execution, gates, and state transitions.
- Do not commit `.yololoop/`, provider logs, auth files, `.env` files, or generated scratch repos.
- Use anonymous or public-safe commit email addresses for public contributions.

## Design Direction

yololoop is local-first and file-backed. Routes should call existing tools explicitly rather than hiding provider behavior behind implicit side effects.
