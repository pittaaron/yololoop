# yololoop.com

Minimal static landing page for Cloudflare Pages.

## Deploy

Create a Cloudflare Pages project with:

- Build command: none
- Output directory: `site`

Or deploy directly with Wrangler:

```bash
npx wrangler pages deploy site --project-name yololoop
```

Then attach `yololoop.com` and `www.yololoop.com` in the Cloudflare Pages custom domains UI.

## Hosted Updates CTA

The page links to `mailto:launch@yololoop.com`. Before posting publicly, configure Cloudflare Email Routing for `launch@yololoop.com` or replace that link with your newsletter provider.
