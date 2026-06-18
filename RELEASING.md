# Releasing

This project is distributed through npm and GitHub releases.

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

8. Publish to npm:

   ```bash
   npm publish --access public
   ```

9. Smoke-test the public install:

   ```bash
   npm_config_prefix=/tmp/yololoop-install-smoke \
     npm install -g yololoop
   /tmp/yololoop-install-smoke/bin/yololoop --help
   ```

## npm Hardening Later

After the first npm publish:

- Add npm provenance/trusted publishing.
- Decide whether releases should be cut manually or through GitHub Actions.
