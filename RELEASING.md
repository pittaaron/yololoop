# Releasing

This project is currently distributed from GitHub. npm publishing is intentionally deferred until the package surface has had a little more public feedback.

## Release Checklist

1. Confirm the worktree is clean.
2. Update `package.json`, `package-lock.json`, and `CHANGELOG.md`.
3. Run:

   ```bash
   npm run check
   npm audit
   npm pack --dry-run
   gitleaks git --log-opts='--all' --redact -v --no-banner
   ```

4. Commit with an anonymous/public-safe email address.
5. Push through a pull request unless using an owner emergency bypass.
6. Wait for CI to pass on `main`.
7. Create the GitHub release:

   ```bash
   gh release create vX.Y.Z \
     --repo pittaaron/yololoop \
     --target main \
     --title "vX.Y.Z - <summary>" \
     --notes-file /path/to/release-notes.md
   ```

8. Smoke-test the public install:

   ```bash
   npm_config_prefix=/tmp/yololoop-install-smoke \
     npm install -g github:pittaaron/yololoop
   /tmp/yololoop-install-smoke/bin/yololoop --help
   ```

## npm Publish Later

Before the first npm publish:

- Confirm the `yololoop` package name is still available.
- Decide whether GitHub releases stay the source of truth or npm becomes primary.
- Add npm provenance/trusted publishing.
- Update the README install command.
