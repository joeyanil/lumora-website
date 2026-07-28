# Lumora — Security Hardening

This site went through a full security pass before deployment. This document explains
what was changed, why, what's automatic vs. what needs one manual step from you at
deploy time, and what's explicitly out of scope (and why).

Read this alongside `BUILD_NOTES.md`, which covers the general architecture.

---

## 1. Threat model — what kind of site this is

This is a **static site with no server-side code, no database, and no authentication**.
That already eliminates entire vulnerability classes by construction:

- No SQL/NoSQL injection — there's no database.
- No server-side command/template injection — there's no server executing code per request.
- No session/auth vulnerabilities (fixation, broken access control, IDOR) — there's no login.
- No SSRF — nothing on this site makes outbound server-side requests.
- No open redirects — there are no redirect endpoints or query-driven navigation.
- No SSRF/CSRF on the contact form — it doesn't POST anywhere; see §4.

What's actually left to defend is the **browser-side attack surface**: XSS, clickjacking,
MIME-sniffing, malicious third-party framing, mail-header injection through the contact
form, and information leakage (referrers, permissive browser features). Everything below
is scoped to that.

---

## 2. What was hardened in the code

### Content-Security-Policy (CSP) — the main defense against injection
Every page now ships a strict CSP with **no `unsafe-inline` anywhere, for scripts or
styles**:

```
default-src 'self';
script-src 'self' 'sha256-<hash of the one JSON-LD block>';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';        (header only — see §3)
frame-src 'none';
worker-src 'none';
manifest-src 'self';
media-src 'none';
upgrade-insecure-requests;
require-trusted-types-for 'script';
```

To get to zero `unsafe-inline`, two refactors happened first:
- **Every inline `style="..."` attribute** (65 of them, across all pages) was replaced
  with a real utility CSS class in `assets/css/style.css` (`.u-muted`, `.d06`, `.lang-py`,
  etc.). This is what lets `style-src` drop `unsafe-inline` entirely.
- The two places in `assets/js/main.js` that set `element.style.display` directly were
  rewritten to use `classList.toggle('is-hidden', …)` instead — direct `.style` mutation
  from JS is governed by the same CSP directive as inline `style=""` attributes.
- The one remaining inline `<script>` (the homepage's JSON-LD structured-data block) is
  allow-listed by an exact SHA-256 hash rather than a blanket `unsafe-inline`. **If you
  ever edit that JSON-LD block, recompute the hash** or it'll silently stop being
  recognised (the page still works — search engines will just ignore the block, and
  nothing else breaks):
  ```
  awk '/<script type="application\/ld\+json">/{flag=1;next}/<\/script>/{flag=0}flag' index.html \
    | openssl dgst -sha256 -binary | openssl base64 -A
  ```
  Paste the result into `sha256-...` in every config file listed in §3, and into the
  `<meta http-equiv="Content-Security-Policy">` tag in every HTML page's `<head>`.
- `require-trusted-types-for 'script'` is added as extra, modern DOM-XSS protection
  (Chrome/Edge only — other browsers ignore it harmlessly). It costs nothing here because
  the codebase never uses `innerHTML`, `document.write`, `eval`, or `new Function()` —
  confirmed by an explicit grep across every `.html`/`.js` file before shipping.

CSP is delivered two ways, deliberately redundant:
1. A `<meta http-equiv="Content-Security-Policy">` tag in every page (works everywhere,
   including if you drag-and-drop these files onto any static host with zero config).
2. A real `Content-Security-Policy` HTTP header via the hosting configs in §3 — **this is
   the one that actually matters**, because `frame-ancestors` (clickjacking protection)
   is only honored by browsers when set as an HTTP header — the CSP spec explicitly says
   `<meta>`-delivered CSP ignores `frame-ancestors`, `report-uri`/`report-to`, and
   `sandbox`. The meta tag is a floor, not the real ceiling.

### Clickjacking — three independent layers
1. `X-Frame-Options: DENY` (header, §3) — understood by every browser, including very old ones.
2. `Content-Security-Policy: frame-ancestors 'none'` (header, §3) — the modern replacement,
   more flexible if you ever need to allow a specific origin later.
3. A small JS frame-buster in `main.js` (`if (window.top !== window.self) window.top.location = …`)
   as a last-resort fallback in case a host or proxy strips both headers.

### Contact form — hardened, with an honest caveat
The form has no server behind it yet (see `BUILD_NOTES.md`) — it opens the visitor's own
email client via `mailto:`. That actually makes it very low-risk today: there's no server
accepting untrusted input, so there's nothing to inject into, flood, or overflow. Even so:
- **Mail-header injection defense-in-depth**: all field values are stripped of ASCII
  control characters (`\x00`–`\x1F`, `\x7F`) before being placed into the `mailto:` URI,
  on top of `encodeURIComponent()` (which already neutralises this, but "the value can
  never contain a raw newline" is a stronger guarantee than "it happens to get encoded").
- **Honeypot field** (`company`) — invisible to real visitors, catches simple bots.
- **Timing check** — a submission faster than ~2.5 seconds after page load is treated as
  automated and silently dropped.
- **Resubmit cooldown** — 10 seconds between sends, so a stuck key or script can't fire
  repeated `mailto:` navigations at the visitor.
- **Length caps** enforced in JS (not just HTML `maxlength`, which is trivially bypassed
  from devtools) — name 120 chars, email 254 (RFC 5321 limit), message 5000.
- **`maxlength` also set at the HTML level** on every field, as the first line of defense.

> **When you add a real backend** (per the Next.js/Supabase path in `BUILD_NOTES.md`),
> none of the client-side checks above are a substitute for server-side validation,
> output encoding, and rate limiting. Client-side checks stop casual abuse and improve
> UX; they do not stop a motivated attacker who can just POST directly to your endpoint.
> Validate and sanitise again on the server. Add real rate limiting there (e.g. per-IP
> and per-email-address) and consider a CAPTCHA (hCaptcha or Cloudflare Turnstile) if
> spam becomes a problem once real submissions are possible.

### Other headers (see §3 for where they're set)
- `X-Content-Type-Options: nosniff` — stops the browser from guessing content-types and
  executing e.g. an uploaded image as script.
- `Referrer-Policy: strict-origin-when-cross-origin` — full URL sent same-origin, only
  the origin sent cross-origin (no leaking page paths/query strings to third parties).
- `Permissions-Policy` — explicitly disables camera, microphone, geolocation, payment,
  USB, and other powerful APIs this site never uses, **and opts out of FLoC/Topics**
  (`interest-cohort=()`) so browsers don't include this site in ad-interest tracking.
- `Strict-Transport-Security` — forces HTTPS for a very long time once a browser has
  visited once. Shipped **without `preload`** — see the checklist in §5 for why that's a
  deliberate, later, manual step.
- `Cross-Origin-Opener-Policy: same-origin` — isolates this site's browsing context so a
  window it opens (or that opens it) can't reach in via `window.opener`.
- `Cross-Origin-Resource-Policy: same-origin` — stops other sites from `<script src>`- or
  `<img>`-embedding this site's own resources cross-origin.
- `X-XSS-Protection: 0` — explicitly disables the legacy browser XSS auditor. This looks
  backwards but is current OWASP/Mozilla guidance: that old feature is deprecated,
  removed from modern browsers anyway, and has itself been used as an XSS vector in the
  past. CSP is the real protection now.

### Third-party dependency: Google Fonts (the one thing this site loads externally)
- Moved from a CSS `@import` to explicit `<link rel="preconnect">` + `<link rel="stylesheet">`
  tags in every page's `<head>`. Same trust boundary, faster (one fewer round trip), and
  it makes the CSP's `style-src`/`font-src` allowances map to something visible in the HTML
  rather than hidden inside a CSS file.
- **No Subresource Integrity (SRI) on the Google Fonts CSS** — this is a known, accepted
  limitation, not an oversight: Google Fonts serves different CSS per User-Agent (different
  font formats for different browsers), so there's no single fixed file to hash. This is
  well-documented and is why Google's own docs don't offer SRI hashes for it either.
- **Privacy note**: loading fonts from Google's CDN sends visitor IP addresses to Google
  on every page load. A German court (LG München, 2022) found this can require consent
  under GDPR. If this site serves EU visitors and you want to remove that dependency
  entirely, self-host the three font families instead (download once from Google Fonts or
  use `google-webfonts-helper`, drop the `.woff2` files in `assets/fonts/`, add `@font-face`
  rules in `style.css`, delete the `<link>` tags). That also lets you tighten
  `style-src`/`font-src` down to `'self'` only and safely enable
  `Cross-Origin-Embedder-Policy: require-corp` for full cross-origin isolation (not
  enabled currently — see §6).
- Nothing else on this site is loaded from a third party. No analytics, no ad scripts, no
  CDN-hosted JS libraries, **zero npm/build dependencies** — so there's no JavaScript
  supply-chain surface at all beyond this one font stylesheet.

### Information hygiene
- No inline event handlers (`onclick=`, etc.) anywhere — everything is wired up via
  `addEventListener` in `main.js`.
- No `target="_blank"` links anywhere currently (checked). If you add any external link
  that opens in a new tab later, always pair it with `rel="noopener noreferrer"` to
  prevent reverse-tabnabbing.
- No secrets, API keys, or credentials anywhere in the codebase (there's nothing to leak —
  confirmed by grep before shipping).
- Every image has a real or empty (`alt=""`, for decorative images) `alt` attribute — an
  accessibility requirement, and incidentally means nothing relies on browser guessing.
- Regexes used in form validation were checked for catastrophic backtracking (ReDoS) —
  all use simple, non-nested, non-ambiguous quantifiers.

---

## 3. Hosting configs — pick the one that matches your platform

The `<meta>` CSP tag works everywhere with zero setup, but **`X-Frame-Options`,
`Permissions-Policy`, `Strict-Transport-Security`, `frame-ancestors`, COOP, and CORP can
only be delivered as real HTTP headers** — browsers ignore them in a `<meta>` tag. Use
whichever of these matches where you deploy; delete the rest.

| File | Platform |
|---|---|
| `_headers` | Netlify **and** Cloudflare Pages (same file format) |
| `vercel.json` | Vercel |
| `.htaccess` | Apache — shared hosting, cPanel, etc. |
| `nginx.conf.example` | Nginx — self-managed VPS/server (paste into your `server {}` block) |

All four carry the identical header set, so security posture doesn't change based on
where you deploy. If you deploy somewhere not listed here (Firebase Hosting, AWS
Amplify/CloudFront, GitHub Pages behind Cloudflare, etc.), use whichever file's syntax is
closest as a reference — the header names and values are portable even if the config
syntax isn't.

**GitHub Pages specifically cannot set custom headers at all.** If you need these headers
and want to stay on GitHub Pages, put Cloudflare (free tier is fine) in front of it and
use Cloudflare's own header rules (same values as `_headers`, entered as a Transform Rule
or Page Rule).

After deploying, verify the real headers are live with:
- https://securityheaders.com
- https://observatory.mozilla.org

Both should come back clean given the config above. Fix whatever they flag before
considering the deploy final.

---

## 4. Files added in this pass

```
_headers                    Netlify / Cloudflare Pages headers
vercel.json                  Vercel headers
.htaccess                    Apache headers + HTTPS redirect + hardening
nginx.conf.example           Nginx headers + hardening (reference snippet)
.well-known/security.txt     RFC 9116 — how a researcher reports a vulnerability
security-policy.html         Human-readable disclosure policy, linked from security.txt
SECURITY.md                  This file
```

Plus the in-place edits described in §2 across every existing `.html`, `style.css`, and
`main.js` file.

---

## 5. Deployment checklist (things only you can do, with a real domain in hand)

- [ ] Deploy, then confirm all pages load and the browser padlock shows a valid cert.
- [ ] Run https://securityheaders.com and https://observatory.mozilla.org against the live
      URL — confirm an A/A+ grade.
- [ ] Once you're confident HTTPS is solid and permanent, add `preload` to the
      `Strict-Transport-Security` header and submit the domain at
      https://hstspreload.org. This is a one-way door (very slow to undo), which is why
      it isn't in the default config.
- [ ] Add a **CAA DNS record** restricting which Certificate Authorities may issue
      certificates for your domain (defense against certificate mis-issuance).
- [ ] Enable **DNSSEC** if your registrar/DNS provider supports it.
- [ ] If you move off Gmail onto a custom domain for email, set up **SPF, DKIM, and
      DMARC** records so nobody can spoof mail as `@yourdomain`.
- [ ] Turn on your host's built-in bot/DDoS protection (Cloudflare, Netlify, and Vercel
      all have a baseline tier of this on by default — just confirm it's active).
- [ ] Watch for any dangling DNS records (old CNAMEs pointing at a deprovisioned service)
      before and after any hosting migration — this is the #1 cause of subdomain takeover.
- [ ] If/when a real backend is added (see `BUILD_NOTES.md`), re-read §2's contact-form
      note: add server-side validation, rate limiting, and re-run this whole checklist
      against the new endpoint.

---

## 6. Explicit trade-offs (things deliberately *not* done, and why)

- **`Cross-Origin-Embedder-Policy` (COEP) is not set.** Enabling `require-corp` would give
  full cross-origin isolation (needed for things like `SharedArrayBuffer`, which this site
  doesn't use), but it can silently break cross-origin resources that don't send their own
  CORP/CORS headers — and Google Fonts' guarantees here aren't solid enough to rely on
  blind. If you self-host fonts (§2), COEP becomes safe to enable with zero downside.
- **HSTS `preload` is not set by default** — see the checklist in §5. It's a one-way
  commitment and should be added deliberately once HTTPS is confirmed stable, not shipped
  blind in a template.
- **No CAPTCHA on the contact form.** Not needed yet: the form doesn't submit to a server
  at all right now (see §2), so there's nothing to spam. Add one only once a real backend
  exists and abuse is actually observed.
- **No `report-uri`/`report-to` on the CSP.** That requires a server endpoint to receive
  the reports, which this static build doesn't have. Worth adding once a backend exists —
  it turns CSP from a silent blocker into an early-warning system.

---

## 7. How this was verified

Every change in this pass was tested headlessly (Playwright + Chromium) before shipping:
- All 16 pages load with HTTP 200 and zero console errors.
- Zero CSP violations on any page, including the JSON-LD hash match on the homepage.
- Zero broken internal links or anchors, zero duplicate `id` attributes, zero images
  missing `alt`, across every page.
- Zero horizontal overflow at 375/820/1440px on every page.
- Contact form: empty-submit validation, invalid-email validation, honeypot drop, timing-
  based bot drop, and a full valid submission were all exercised and behave as designed.
- The projects filter, mobile menu, scroll reveals, stat counters, and the homepage/products
  Lumi demo were all re-verified after the refactor to confirm nothing broke.
