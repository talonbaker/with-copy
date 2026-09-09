# Setting up GitHub Pages for withcopy.app

For the product owner. These steps need repository admin and Cloudflare
access, which agents don't have. No GitHub Actions are involved (D43):
GitHub's built-in Pages publisher serves the `main` branch directly.

## 1. Pages settings in the repository

1. GitHub → the `with-copy` repo → Settings → Pages.
2. Under "Build and deployment": Source **Deploy from a branch**, Branch
   **main**, Folder **/ (root)**. Save.
3. Under "Custom domain", enter `withcopy.app` and save. GitHub adds a
   DNS check; it passes once step 2 below has propagated.
4. Tick "Enforce HTTPS" once the DNS check has passed and the certificate
   shows as issued.

The repository root contains `CNAME` (the custom domain) and `.nojekyll`
(publish files untouched). Both must stay.

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

Set every record to **DNS only** (grey cloud). GitHub issues the TLS
certificate itself and needs to see the records directly. If you later turn
the Cloudflare proxy on, set SSL/TLS mode to **Full (strict)** first or the
site will loop redirects.

## 3. Verify

- Settings → Pages shows "Your site is live at https://withcopy.app".
- `https://withcopy.app/` forwards to `https://withcopy.app/app/`.
- `https://withcopy.app/probe.html` loads. Run it on your iPhone and on
  desktop Chrome, tap every button, "Copy results", and paste into chat.
- Install the PWA on the iPhone (Share → Add to Home Screen) and run the
  probe again from the installed app.

## 4. Releasing

Every push to `main` publishes within about a minute. Before pushing, bump
`VERSION` in `sw.js` so installed clients fetch the new files.

## 5. Optional, recommended

Account Settings → Pages → "Verified domains" lets you verify `withcopy.app`
with a TXT record so no other GitHub user can claim it if this Pages site
is ever removed.
