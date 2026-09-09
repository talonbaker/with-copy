# Setting up GitHub Pages for withcopy.app

For the product owner. These steps need repository admin and Cloudflare
access, which agents don't have. Nothing deploys until step 1 is done, and
the site is not reachable at the domain until step 2 has propagated.

## 1. Enable Pages in the repository

1. GitHub → the `with-copy` repo → Settings → Pages.
2. Under "Build and deployment", set Source to **GitHub Actions**.
3. Under "Custom domain", enter `withcopy.app` and save. GitHub adds a
   DNS check; it will fail until step 2 is done.
4. Leave "Enforce HTTPS" unticked until GitHub reports the DNS check passed,
   then tick it.

The workflow at `.github/workflows/pages.yml` deploys on every push to
`main` and can also be run by hand from the Actions tab.

## 2. DNS on Cloudflare

In the Cloudflare dashboard for `withcopy.app`, DNS → Records:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only |
| CNAME | `www` | `talonbaker.github.io` | DNS only |

Set every record to **DNS only** (grey cloud) for now. GitHub issues the
TLS certificate itself and needs to see the records directly. If you later
turn the Cloudflare proxy on, set SSL/TLS mode to **Full (strict)** first or
the site will loop redirects.

Remove any existing `A`, `AAAA`, or `CNAME` records on `@` that point
elsewhere (a parked-domain record, for example).

## 3. Verify

- Settings → Pages shows "Your site is live at https://withcopy.app".
- `https://withcopy.app/probe.html` loads. That's the clipboard probe page;
  run it on your iPhone and on desktop Chrome and paste the results into chat.
- Install the PWA on the iPhone (Share → Add to Home Screen) and run the
  probe again from the installed app.

## 4. Optional, recommended

Settings → Pages → "Verified domains" (at the account level, Settings →
Pages) lets you verify `withcopy.app` with a TXT record so no other GitHub
user can claim it if the Pages site is ever removed.
