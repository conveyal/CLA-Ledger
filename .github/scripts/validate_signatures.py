#!/usr/bin/env python3
"""Validate CLA signature pull requests for the CSA CLA-Ledger.

Identity comes from the AUTHENTICATED account that opened the PR (login +
numeric id, passed via env from the event payload) — never git commit-author
metadata, never self-asserted text alone. A valid signature file:

  * is named ``<author_id>.md`` (the opener's numeric account id);
  * states that login and id, a CLA version, a date, and an assent statement;
  * begins with the full CLA text verbatim (the signature block follows it),
    matching that project's published ``<project>/versions/CLA-<ver>.md`` (read
    from the checked-out base branch — trusted ``main``, not PR code). The
    project directory is derived from the signature file's own path
    (``<project>/signatures/<id>.md``), so *locating* each project's canonical
    CLA is project-agnostic. The signature-block wording checked below, however,
    is currently specific to the Security Controls Catalog (its project name and
    assent links are hardcoded); supporting a second project means parameterizing
    those — a small change to make when that project is actually added.

PR file content is fetched via the GitHub API at the head SHA; PR code is never
checked out or executed.
"""
import base64
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://api.github.com"
TOKEN = os.environ["GH_TOKEN"]
REPO = os.environ["REPO"]
PR = os.environ["PR"]
AUTHOR = os.environ["AUTHOR"]
AID = os.environ["AUTHOR_ID"]
HEAD_REPO = os.environ["HEAD_REPO"]
HEAD_SHA = os.environ["HEAD_SHA"]


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": "Bearer " + TOKEN,
        "Accept": "application/vnd.github+json",
        "User-Agent": "csa-cla-validate",
    })
    with urllib.request.urlopen(req) as r:
        return json.load(r) if r.length != 0 else None


def changed_signature_files():
    out, page = [], 1
    while True:
        batch = api("GET", f"/repos/{REPO}/pulls/{PR}/files?per_page=100&page={page}")
        if not batch:
            break
        out += [f["filename"] for f in batch]
        page += 1
    # Every changed file under a project's signatures/ directory (except the
    # directory README). Non-conforming paths (nested, wrong extension) are
    # returned too — main() rejects them rather than skipping them, so a PR that
    # changes only such a file fails instead of passing as "nothing to validate".
    return [f for f in out if "/signatures/" in f and not f.endswith("/README.md")]


def head_file(path):
    data = api("GET", f"/repos/{HEAD_REPO}/contents/{path}?ref={HEAD_SHA}")
    return base64.b64decode(data["content"]).decode("utf-8")


def validate(sig, project):
    body = sig.strip()
    m = re.search(r"CLA version:\s*(v\d+\.\d+)", sig)
    ver = m.group(1) if m else None
    if not ver:
        return ['missing a "CLA version: vX.Y" line in the signature block']
    cpath = os.path.join(project, "versions", f"CLA-{ver}.md")
    if not os.path.exists(cpath):
        return [f"no published CLA found for version {ver}"]
    with open(cpath, encoding="utf-8") as fh:
        canon = fh.read().strip()
    # 1) The file must BEGIN with the canonical CLA verbatim (not a loose
    #    substring match — that would accept the CLA buried in arbitrary text).
    if not body.startswith(canon):
        return [f"the file must begin with the full published {ver} CLA text, verbatim, followed by your signature block"]
    # 2) The remainder must be the signature block from the template, with your
    #    login / numeric ID / version / project / date filled in, and nothing
    #    before, between, or after it. The assent line's prose and link *text*
    #    are pinned; only the link URLs are wildcarded (`\([^)]+\)`), so a URL
    #    can change without breaking signatures, while the agreement wording,
    #    version, project, and identity stay enforced. This rejects extra caveats
    #    or conflicting language inserted into or appended after the block.
    #    This pattern mirrors the template in <project>/signatures/README.md —
    #    keep the two in sync if either changes.
    a, i, v = re.escape(AUTHOR), re.escape(AID), re.escape(ver)
    vnum = re.escape(ver.lstrip("v"))   # "1.0" for the human-readable "version 1.0"
    block = re.compile(
        r"\A\s*---\s*"
        r"##\s+Signature\s+"
        r"I,\s+@" + a + r"\s+\(GitHub account ID:\s+" + i + r"\),\s+agree to and sign the\s+"
        r"\[Cloud Security Alliance Contributor License Agreement, version " + vnum + r"\]\([^)]+\)\s*"
        r"—\s*reproduced in full above\s*—\s*with respect to the\s+"
        r"\[Security Controls Catalog\]\([^)]+\)\s+project\.\s+"
        r"-\s+GitHub login:\s+" + a + r"\s+"
        r"-\s+GitHub account ID:\s+" + i + r"\s+"
        r"-\s+CLA version:\s+" + v + r"\s+"
        r"-\s+Project:\s+Security Controls Catalog\s+"
        r"-\s+Date:\s+(\d{4}-\d{2}-\d{2})\s*\Z"
    )
    mblock = block.match(body[len(canon):])
    if not mblock:
        return ["the signature block must follow the template in signatures/README.md "
                "exactly — the agreement statement (with both links), your GitHub login, "
                "numeric account ID, CLA version, project, and date — with nothing added "
                "before, between, or after it"]
    # The Date shape is pinned above; here we confirm it is a real calendar date
    # (rejects e.g. 2026-13-45) and not in the future. One day of slack absorbs
    # signer/runner timezone differences; the git commit timestamp is the
    # authoritative record of when, so this is a sanity check, not the clock.
    raw = mblock.group(1)
    try:
        signed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return [f'the signing date "{raw}" is not a real calendar date (use YYYY-MM-DD)']
    if signed > datetime.now(timezone.utc).date() + timedelta(days=1):
        return [f'the signing date "{raw}" is in the future']
    return []


def main():
    sigfiles = changed_signature_files()
    if not sigfiles:
        print("No signature files changed.")
        return 0
    problems = []
    for f in sigfiles:
        # Must be exactly <project>/signatures/<id>.md — no subdirectories, .md only.
        if not re.search(r"/signatures/[^/]+\.md$", f):
            problems.append(f"- `{f}`: signature files must be exactly "
                            "`<project>/signatures/<id>.md` — no subdirectories, `.md` only.")
            continue
        name = os.path.basename(f)[:-3]  # strip .md
        if name != AID:
            problems.append(f"- `{f}`: the file must be named for YOUR numeric account ID — `{AID}.md` (you may only add your own signature).")
            continue
        project = f.split("/signatures/")[0]
        errs = validate(head_file(f), project)
        if errs:
            problems.append(f"- `{f}`: " + "; ".join(errs))
    if problems:
        body = "Signature validation failed:\n" + "\n".join(problems)
        try:
            api("POST", f"/repos/{REPO}/issues/{PR}/comments", {"body": body})
        except Exception as ex:  # comment is best-effort; the check status is the gate
            print("could not post PR comment:", ex)
        print(body)
        return 1
    print(f"Signature valid: @{AUTHOR} (id {AID}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
