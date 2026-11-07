# astro-ph Coffee Page

A daily arXiv astro-ph paper browser hosted on GitHub Pages.

## Features

- Daily arXiv astro-ph listings (all subcategories: GA, CO, EP, HE, IM, SR)
- Sequential arXiv listing numbers [1]…[N] matching `arxiv.org/list/astro-ph/new`, with cross-listings labelled and numbered continuously
- Three independent sorting axes, freely combinable:
  - **Sort**: ↑ ascending / ↓ descending arXiv ID (persisted)
  - **Local first**: None / Strong / Strong+Weak — prioritises CIERA author papers (persisted)
  - **Listing**: Today / -1 / -2 / -3 / -4 / -5 — switches between the latest six arXiv listings
- **Search** — always-visible title + author search across the retained listing history
- Filter by sub-category (GA, CO, EP, HE, IM, SR)
- Section dividers in the paper list reflect the active grouping (local-strong / local-weak / other, or new submissions / cross-listings)
- **Discussed papers (disabled)** — set `DISCUSSED_ENABLED` in `app.js` to re-enable the per-paper GitHub issue flow and discussed page. The data, issue templates, and sync workflow remain in place; controls, badges, and navigation are hidden while disabled.
- Highlight CIERA authors (strong: bold purple; weak: italic teal)
- Long-term archive storage — purged `today-5.json` listings are saved into yearly SQLite files under `data/archive/`
- Author match strength (`local_match`, `local_authors`) precomputed during scraping — no client-side name matching
- **Font size control** — S / M / L in the filter row; persisted across sessions
- **Abstract expand mode** — Off / Local / All button group; persisted across sessions
- **Author truncation** — papers with 10 or more authors show the first 5 followed by `, ... (incl. local authors)`; both strong and weak matches remain visible, with an expand toggle for the full list

## Setup

### 1. Create a GitHub repository and push this code

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/coffee-page.git
git push -u origin main
```

### 2. Enable GitHub Pages

In your repository → **Settings → Pages**:
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`

### 3. Enable the GitHub Action

The workflow in `.github/workflows/daily-scrape.yml` runs on the following schedule,
timed around arXiv's ~8 PM ET daily announcement. Times are New York local time:

| Runs | NY time | Days |
|------|---------|------|
| Evening | 9:17 PM | Sun–Thu |
| Catch-up | 1:17 AM, 5:17 AM, 9:17 AM | Mon–Fri |

To run it manually: **Actions → Daily arXiv scrape → Run workflow** (no inputs required).

The Action pushes data commits directly to the protected `main` branch using an SSH deploy key. Set it up once:

1. Generate a key pair (no passphrase): `ssh-keygen -t ed25519 -C "astro-coffee-scraper" -f deploy_key -N ""`
2. Add `deploy_key.pub` as a deploy key with **write access** — repo **Settings → Deploy keys → Add deploy key**
3. Add the private key `deploy_key` as a repository secret named `SCRAPER_DEPLOY_KEY` — repo **Settings → Secrets → Actions → New repository secret**
4. Delete both local key files
5. Add **Deploy keys** as a bypass actor in your branch ruleset — repo **Settings → Rules → (ruleset) → Bypass list**

### 4. Populate the author list

There are two author list files:

| File | Purpose |
|------|---------|
| `config/authors.json` | Auto-populated by scraping the department people page. **Do not edit by hand** — it is overwritten monthly by the GitHub Action. |
| `config/authors_manual.json` | Hand-curated additions (collaborators, alumni, etc.). Never overwritten automatically. |

Both files are merged by the scraper when annotating papers (manual entries take precedence). The manual list starts empty for CIERA.

**Automatic updates** — the workflow in `.github/workflows/monthly-authors.yml` re-scrapes
the Northwestern CIERA directory on the 1st of every month and commits the result to
`config/authors.json`. It can also be triggered manually via **Actions → Monthly author
list update → Run workflow**. The workflow retries the complete scrape up to three times
when a transient network failure prevents a complete directory fetch;
incomplete results are never committed.

**Manual additions** — edit `config/authors_manual.json` directly:

```json
{
  "authors": [
    "Vera Rubin",
    "Jan Oort"
  ]
}
```

**Initial setup** — run the scraper locally to seed `config/authors.json` before the
first monthly Action fires:

```bash
pip install -r requirements.txt
python scripts/scrape_authors.py
```

The directory source is https://ciera.northwestern.edu/directory/. Current research groups are included; administrative staff and postdoctoral alumni are excluded. Missing or empty groups abort the update to protect the existing roster.

To adapt for a different institution, edit `PAGES`, `GROUPS`, and CSS selectors in
`scripts/scrape_authors.py`. Use `--dry-run` to preview without writing.

Names are matched by last name (exact) then first name. **Strong** match (bold purple): exact first name, hyphenated initials matching a hyphenated first name (`C.-G.` == `Chang-Goo`), or first + middle initial both match (`M. W.` == `Matthew W.`). **Weak** match (italic teal): first initial only against a non-hyphenated fav name. **No match**: single initial against a hyphenated fav name (`C. Kim` vs `Chang-Goo Kim`), arXiv provides a middle initial the fav lacks (`G. A. Livadiotis` vs `George Livadiotis`), conflicting middle initials (`M. A. Kunz` vs `Matthew W. Kunz`), or conflicting full first names (`Yujie Chen` vs `Yixian Chen`). To get a strong match for someone who publishes under an abbreviated name, add that form to `config/authors_manual.json` (e.g. `"G. Livadiotis"`). Titles (Dr., Sir) and suffixes (Jr., III) are ignored.

## Generated files and version control

Keep `config/authors.json` and `data/` tracked. They are published assets that
GitHub Pages serves directly, and the workflows commit regenerated versions back
to the repository. They are not disposable build files. The archive databases
also retain historical papers that a current arXiv scrape cannot fully recover.

When changing institutions, commit the initial regenerated `config/authors.json`
or manually run **Monthly author list update**. A roster commit triggers
**Re-annotate papers on author list change**, which refreshes the six rolling
listings before Pages redeploys. Changing the scraper alone does not refresh the
published roster or existing paper matches.

Python caches, bytecode, and operating-system temporary files are ignored by
`.gitignore` and should stay untracked.

## Local development

```bash
# Install dependencies for the author scraper
pip install -r requirements.txt

# First-time setup: seed today.json through today-5.json
# Uses arXiv's recent HTML listing for authoritative listing dates
python scripts/scrape.py --bootstrap-history

# Optional: also call the arXiv API to fill missing abstracts after HTML bootstrap
python scripts/scrape.py --bootstrap-history --api-enrich

# Subsequent runs (automated by GitHub Action): fetch latest 200 and update rolling history
# If the arXiv API is throttled or unavailable, the scraper falls back to arXiv's /new HTML listing.
python scripts/scrape.py

# When today-5.json is purged, it is stored in data/archive/YYYY.sqlite
# for future search features.

# Scrape a specific date manually
python scripts/scrape.py 2026-03-06

# Update the author list from the Northwestern CIERA directory
python scripts/scrape_authors.py

# Serve locally
python -m http.server 8000
# Open http://localhost:8000
```

## Acknowledgment

Thank you to arXiv for use of its open access interoperability.

## Browser caching

Both pages load JavaScript and CSS with a fresh query string on every visit, so
Firefox and other browsers do not reuse an older asset URL. JSON fetches use
`cache: "no-cache"` to revalidate cached data with the server. Files loaded within
a page session still use the existing in-memory listing cache.

GitHub Pages controls the HTML response and CDN caching headers. Already-cached
HTML may need one hard refresh after this change deploys; this change cannot
retroactively update a document already held by a browser or an open tab.
