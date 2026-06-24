#!/usr/bin/env python3
"""Generate a CLA signature file for the CSA Security Controls Catalog.

Run from a clone of your fork of the CLA-Ledger repository:

    python3 sign.py <your-github-login>

It resolves your numeric GitHub account ID, reads the current frozen CLA text,
and writes ``security-controls-catalog/signatures/<id>.md`` containing that exact
text followed by a correctly filled-in signature block. Review it, commit it, and
open a pull request to ``CloudSecurityAlliance/CLA-Ledger`` from the same GitHub
account.

The file is built from the *same* canonical ``versions/CLA-<ver>.md`` text the CLA
check validates against, so a generated signature passes the check by
construction. No third-party service and no dependencies beyond the Python
standard library.

  python3 sign.py octocat                 # resolve id via the GitHub API
  python3 sign.py octocat --id 583231      # skip the API lookup
  python3 sign.py octocat --version v1.0   # pin a specific CLA version
  python3 sign.py octocat --force          # overwrite an existing file (re-signing)
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

PROJECT_DIR = "security-controls-catalog"
PROJECT_NAME = "Security Controls Catalog"
PROJECT_REPO = "https://github.com/CloudSecurityAlliance/SecurityControlsCatalog"
LEDGER_BLOB = "https://github.com/CloudSecurityAlliance/CLA-Ledger/blob/main"


def fail(msg):
    sys.exit("error: " + msg)


def resolve_id(login):
    """Look up a GitHub login's permanent numeric account id via the public API."""
    req = urllib.request.Request(
        f"https://api.github.com/users/{login}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "csa-cla-sign"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return str(json.load(r)["id"])
    except urllib.error.HTTPError as e:
        if e.code == 404:
            fail(f'GitHub login "{login}" not found.')
        fail(f"GitHub API error ({e.code}). Pass --id <numeric-id> to skip the lookup.")
    except Exception as e:  # network down, rate limit, etc. — offer the offline path
        fail(f"could not reach the GitHub API ({e}). Pass --id <numeric-id> to skip the lookup.")


def pick_version(requested):
    """Choose the CLA version to sign.

    Priority: an explicit --version; else the version named in versions/CURRENT
    (the project's current required version); else the highest published
    CLA-vX.Y.md as a fallback. CURRENT exists so the helper signs the version the
    project actually *requires* rather than merely the newest one frozen — keep it
    in sync with each project's REQUIRED_CLA_VERSION when freezing a new version.
    """
    d = os.path.join(PROJECT_DIR, "versions")
    if not os.path.isdir(d):
        fail(f"run this from the root of a CLA-Ledger clone (can't find {d}/).")
    avail = {}
    for fn in os.listdir(d):
        m = re.fullmatch(r"CLA-(v(\d+)\.(\d+))\.md", fn)
        if m:
            avail[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    if not avail:
        fail(f"no CLA-vX.Y.md files found in {d}/.")
    if requested:
        if requested not in avail:
            fail(f'version {requested} not found; available: {", ".join(sorted(avail))}.')
        return requested
    cur = os.path.join(d, "CURRENT")
    if os.path.isfile(cur):
        with open(cur, encoding="utf-8") as fh:
            marked = fh.read().strip()
        if marked not in avail:
            fail(f'versions/CURRENT names "{marked}", but {d}/CLA-{marked}.md does not exist.')
        return marked
    return max(avail, key=avail.get)


def build(login, gid, ver):
    """Return (file_contents, date) — full CLA text plus the filled signature block."""
    with open(os.path.join(PROJECT_DIR, "versions", f"CLA-{ver}.md"), encoding="utf-8") as fh:
        cla = fh.read().rstrip()
    vnum = ver.lstrip("v")  # "1.0" for the human-readable "version 1.0"
    today = datetime.now(timezone.utc).date().isoformat()
    vlink = f"{LEDGER_BLOB}/{PROJECT_DIR}/versions/CLA-{ver}.md"
    block = (
        "---\n\n"
        "## Signature\n\n"
        f"I, @{login} (GitHub account ID: {gid}), agree to and sign the\n"
        f"[Cloud Security Alliance Contributor License Agreement, version {vnum}]({vlink})\n"
        "— reproduced in full above — with respect to the\n"
        f"[{PROJECT_NAME}]({PROJECT_REPO}) project.\n\n"
        f"- GitHub login: {login}\n"
        f"- GitHub account ID: {gid}\n"
        f"- CLA version: {ver}\n"
        f"- Project: {PROJECT_NAME}\n"
        f"- Date: {today}\n"
    )
    return cla + "\n\n" + block, today


def main():
    ap = argparse.ArgumentParser(
        description="Generate a CSA Security Controls Catalog CLA signature file.")
    ap.add_argument("login", help="your GitHub login (username)")
    ap.add_argument("--id", help="your numeric GitHub account id (skips the API lookup)")
    ap.add_argument("--version", help="CLA version to sign, e.g. v1.0 (default: latest published)")
    ap.add_argument("--force", action="store_true",
                    help="overwrite an existing signature file (re-signing replaces in place)")
    args = ap.parse_args()

    login = args.login.lstrip("@")
    ver = pick_version(args.version)
    gid = args.id or resolve_id(login)
    if not gid.isdigit():
        fail("numeric account id must be digits.")

    out = os.path.join(PROJECT_DIR, "signatures", f"{gid}.md")
    if os.path.exists(out) and not args.force:
        fail(f"{out} already exists. Re-signing replaces it in place — re-run with --force.")

    content, today = build(login, gid, ver)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(content)

    print(f"Wrote {out}")
    print(f"  login:   {login}")
    print(f"  id:      {gid}")
    print(f"  version: {ver}")
    print(f"  date:    {today}")
    print()
    print("Next:")
    print(f"  1. Review {out} — it is the full CLA text followed by your signature block.")
    print( "  2. Commit and push it to your fork of CloudSecurityAlliance/CLA-Ledger.")
    print(f"  3. Open a pull request from the GitHub account @{login} (numeric id {gid}).")
    print( "  4. The CLA check validates it; a maintainer reviews and merges to accept.")


if __name__ == "__main__":
    main()
