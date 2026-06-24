# Signatures — Security Controls Catalog

This directory holds one **signature file per contributor** to the CSA Security
Controls Catalog, named for the contributor's **GitHub numeric account ID**
(`<id>.md`). Opening a pull request that adds your signature file here is how
you sign this project's CLA; CSA accepts it by merging. The files in this
directory are the project's signature ledger.

Each signature file contains **the full text of the CLA you agreed to**, plus a
short signature block — so the file is a complete, self-contained record of
exactly what you signed and when.

## How to sign

**The quick way:** from a clone of your fork, run
`python3 sign.py <your-login>` (the [`sign.py`](../../sign.py) helper at the
ledger root). It looks up your numeric ID, reads the current frozen CLA, and
writes your `<id>.md` — full CLA text plus a correctly filled-in signature block,
ready to review and commit. It needs only Python 3 (no extra packages). The
manual steps below do exactly the same thing by hand:

1. **Find your numeric account ID:**
   ```sh
   curl -s https://api.github.com/users/<your-login> | jq -r .id
   # no jq?  curl -s https://api.github.com/users/<your-login> | grep '"id"' | head -n1
   ```
2. Fork [`CloudSecurityAlliance/CLA-Ledger`](https://github.com/CloudSecurityAlliance/CLA-Ledger)
   and create `security-controls-catalog/signatures/<your-id>.md`.
3. **Paste the full text of the frozen [`versions/CLA-v1.0.md`](../versions/CLA-v1.0.md)** —
   the exact, immutable text the check validates against — into that file, then
   append the signature block below (filled in).
4. Open a pull request **from the GitHub account whose ID you used as the
   filename**. The check confirms: the filename matches your account's numeric
   ID; the login and ID in your signature block match that account; the version,
   project, date, and agreement statement are present; and the CLA text you
   pasted matches the published version verbatim. When it passes and CSA merges
   your PR, your signature is accepted and recorded.

You sign **once per project**: this signature covers your contributions to the
Security Controls Catalog. Other CSA projects have their own CLAs, signed
separately (see `../../GOVERNANCE.md`).

## Re-signing when the CLA is updated

If this project adopts a **new CLA version**, you re-sign to keep contributing.
You have one signature file per project (`<id>.md`); re-signing **replaces it in
place** — update it to embed the new version's full CLA text and signature block
(new version and date), then open a pull request. Git history preserves the
version you signed before. The project's CLA check requires the current version,
so new contributions pause until you re-sign.

## Signature block (append after the full CLA text)

```markdown
---

## Signature

I, @<your-login> (GitHub account ID: <your-id>), agree to and sign the
[Cloud Security Alliance Contributor License Agreement, version 1.0](https://github.com/CloudSecurityAlliance/CLA-Ledger/blob/main/security-controls-catalog/versions/CLA-v1.0.md)
— reproduced in full above — with respect to the
[Security Controls Catalog](https://github.com/CloudSecurityAlliance/SecurityControlsCatalog) project.

- GitHub login: <your-login>
- GitHub account ID: <your-id>
- CLA version: v1.0
- Project: Security Controls Catalog
- Date: <YYYY-MM-DD>
```

Paste this block **exactly**, filling in your login, numeric ID, version, and
date — leave the agreement wording, the two links, and the `Project:` line as
shown, and add nothing before, between, or after it. The validator checks that
your file is the full CLA text followed by precisely this block.

## What is recorded / validated

Only your **GitHub login** and **numeric account ID** identify you (plus the CLA
version, the project, and the date). The numeric ID is the identity of record
because GitHub logins can change; the ID does not. The **signature file** does
not record your legal name, email, or employer. Identity is taken from the
**authenticated account that opens the signature pull request** — not from git
commit author metadata; note, though, that git stamps your own configured author
name and email into the commit, which is public in repository history (CSA
neither requests nor relies on it — see [`PRIVACY.md`](../../PRIVACY.md)).
