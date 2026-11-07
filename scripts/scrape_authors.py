#!/usr/bin/env python3
"""
Scrape the Northwestern CIERA directory and update config/authors.json.

Usage:
    python scripts/scrape_authors.py [--dry-run]

Requirements:
    pip install requests beautifulsoup4

Scrapes current research groups from the CIERA directory.
"""

import argparse
import json
import time
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    raise SystemExit(
        "Missing dependencies. Install with:\n  pip install requests beautifulsoup4"
    )

# Reuse connections while fetching the public directory.
_scraper = requests.Session()

BASE_URL = "https://ciera.northwestern.edu"
PAGES = [("CIERA directory", f"{BASE_URL}/directory/")]

# Current research groups; exclude administrative staff and postdoctoral alumni.
GROUPS = (
    "core-faculty", "associate-faculty", "affiliate-faculty", "visiting-scholars",
    "postdocs", "research-staff", "graduate-students", "nu-skai-personnel",
)

# Retry transient HTTP and network failures with a growing delay.
MAX_RETRIES = 4
RETRY_BACKOFF_SECONDS = 5

def scrape_page(label, url):
    """Return list of names from a single people page, retrying transient failures."""
    print(f"  Fetching {label} ...", end=" ", flush=True)
    r = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = _scraper.get(url, timeout=30)
            r.raise_for_status()
            break
        except Exception as e:
            if attempt == MAX_RETRIES:
                print(f"FAILED after {attempt} attempts ({e})")
                return []
            delay = RETRY_BACKOFF_SECONDS * attempt
            print(f"attempt {attempt} failed ({e}); retrying in {delay}s ...",
                  end=" ", flush=True)
            time.sleep(delay)

    soup = BeautifulSoup(r.text, "html.parser")
    names = []
    for group in GROUPS:
        heading = next((h for h in soup.select("h3.nu-gm-directory-group-title")
                        if h.get_text(" ", strip=True).lower().replace(" ", "-") == group), None)
        section = heading.find_next("div", class_="nu-gm-directory-group-content") if heading else None
        if section is None:
            print(f"FAILED: missing directory group {group}")
            return []
        members = section.select(".people-content h4 a")
        if not members:
            print(f"FAILED: empty directory group {group}")
            return []
        for member in members:
            name = member.get_text(" ", strip=True)
            if name:
                names.append(name)

    print(f"{len(names)} people found")
    return names


def main():
    """Parse arguments, scrape all configured pages, and write config/authors.json."""
    parser = argparse.ArgumentParser(description="Scrape Northwestern CIERA people list")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print names without writing to config/authors.json"
    )
    args = parser.parse_args()

    all_names = []
    for label, url in PAGES:
        names = scrape_page(label, url)
        if not names:
            raise SystemExit(f"Refusing to overwrite author list: no names from {label}")
        all_names.extend(names)

    # Deduplicate while preserving order
    seen = set()
    unique_names = []
    for name in all_names:
        if name not in seen:
            seen.add(name)
            unique_names.append(name)

    print(f"\nTotal: {len(unique_names)} unique names")

    if args.dry_run:
        print("\nDry run — names that would be written:")
        for name in unique_names:
            print(f"  {name}")
        return

    config_path = Path(__file__).parent.parent / "config" / "authors.json"
    config_path.parent.mkdir(exist_ok=True)

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump({"authors": unique_names}, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Written to {config_path}")


if __name__ == "__main__":
    main()
