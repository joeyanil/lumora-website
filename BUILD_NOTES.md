# Lumora — Build Notes

> **Security:** this build went through a full hardening pass — strict CSP with zero
> `unsafe-inline`, security headers for every major host, a hardened contact form, and
> more. See `SECURITY.md` for the full writeup before you deploy.

## What this is
A complete, production-quality static build of the Lumora website: 15 pages, shared design
system, and vanilla JS interactions — no framework, no build step. Open `index.html` directly
or serve the folder with any static host.

Pages: Home, About, Research, Products, Projects (grid + filter), 6 project detail pages
(Lumi K2, Eval Harness, Trace Log, Yugen Runtime, Aegis Sentinel, Tutor Trace), Contact,
Privacy, Terms, 404. Plus `sitemap.xml` and `robots.txt`.

## Why static instead of Next.js + Supabase + GitHub API
The architecture doc specifies Next.js, a Supabase-backed CMS for research/projects, a live
GitHub API integration, and Vercel deployment. This build environment has no outbound network
access and no Vercel/Supabase/GitHub connectors available, so none of that stack could actually
be provisioned or deployed from here. Rather than produce configuration files for services that
can't be stood up, this build focuses on shipping something real and immediately usable: every
page, every piece of copy, every interaction from the spec — built as static HTML/CSS/JS so it
works the moment you open it, with clear seams for wiring in a backend later (see below).

## Where the seams are
- **Projects/research data** is hand-authored directly in each HTML page (`projects.html`,
  `research.html`, and the six `/projects/*.html` detail pages) rather than fetched from a
  database or the GitHub API. Descriptions, languages, statuses, and "updated X ago" dates are
  realistic placeholders. To go live: stand up the Supabase `research_areas` / `projects` tables
  from the architecture doc, add a GitHub Actions sync job, and replace these static blocks with
  server-rendered data in a Next.js migration — the HTML structure and class names already match
  that data model 1:1, so it's a data-source swap, not a redesign.
- **Contact form** (`contact.html`) does full client-side validation and a honeypot field, then
  opens the visitor's email client via `mailto:` pre-filled to dev.lumora@gmail.com (see the
  comment in `assets/js/main.js`). There's no server to store submissions. To go live: replace
  the `setTimeout` block in `contactForm()` with a real POST to a Server Action / API route; the
  form fields, names, and validation already match what that endpoint would expect.
- **Analytics**: none wired up (no Vercel project exists here). Add `@vercel/analytics` (or any
  equivalent) once the site is actually deployed on Vercel.

## Design system
All tokens, fonts, and motion live in `assets/css/style.css`, sourced from the approved reference
build. Do not introduce new colors — everything (chips, buttons, cards, forms) is built from the
same `--night / --amber / --paper` palette.

## Content decisions carried over from the brief
- **Lumi K2** is a school management product — first member of the **Lumi** product family
  (naming convention: `Lumi` + suffix).
- Four research areas, honestly labelled: **Autonomous AI** (planned), **AI Systems** (active),
  **Education AI** (active, anchored by Lumi K2), **Cybersecurity AI** (planned).
- Newsletter signup was replaced with a **"Start a conversation" contact CTA band**, since there's
  no mailing list infrastructure yet.
- No admin dashboard was built (none was requested for this phase).
- Footer only lists **email + location** — no social links, since no real social accounts were
  confirmed. Add them when they exist.

## QA performed in this environment
- All 15 pages load with HTTP 200, zero JS console errors, zero failed asset requests.
- Full link/anchor crawl: 0 broken internal links, 0 missing anchor targets.
- No duplicate `id` attributes; no `<img>` missing `alt`.
- Zero horizontal overflow at 375 / 820 / 1440px widths, on every page.
- Nav breakpoint (burger vs. full menu) verified to switch correctly at 860px.
- Mobile menu open/close, scroll-reveals, animated stat counters, UTC clock, hero motes canvas,
  ticker marquee, Lumi typing demo, contact form validation + honeypot, and the projects filter
  (including deep-linking from Research via `#category` anchors) were all exercised with a
  headless browser and behave as expected.
- Fonts are loaded from Google Fonts at runtime — they didn't load in this offline sandbox, but
  will load normally for real visitors with internet access.
