# CLA-Ledger Governance

How the Contributor License Agreements in this repository are versioned,
changed, and when contributors need to sign again. This document governs the
agreements; the agreement itself (`CLA.md`) is the contract.

## Three independent things

It helps to keep three distinct concepts separate, because they change on
different rules:

1. **The grant** — the rights you give CSA when you sign (broad, perpetual,
   irrevocable, sublicensable). Fixed at the moment you sign.
2. **The outbound license** — the license CSA distributes a work under (e.g.
   the CSA Standard License). CSA controls this and may change it.
3. **The CLA text** — the agreement you assent to. Preserved version by
   version; a signature is assent to one specific version.

Because the grant (1) is already broad and sublicensable, CSA can change the
outbound license (2) on a work — including for work already contributed **under
an accepted CLA signature** — without asking those contributors again. The only
thing that brings you back to sign is a change to the CLA text (3), and only a
*material* one. (Work CSA owns by other means, such as work made for hire, is
governed by that basis, not by this.)

## When re-signing IS and IS NOT required

| What changes | Re-sign needed? | Why |
|---|---|---|
| CSA uses or relicenses work **already contributed under an accepted CLA** under new, different, or commercial terms | **No** | The grant from each accepted CLA signature is broad, irrevocable, and sublicensable — independent of any repository's displayed license. (Pre-CLA work CSA owns by other means, e.g. work made for hire, is governed by that basis, not this row.) |
| CSA **updates the publication license** of a project (a new version of the same license) | **No** | Each CLA's scope covers the project's license "as updated from time to time." |
| CSA makes a **material change to the CLA itself** (grant, representations, or execution terms) | **Yes — for contributions made after the change.** Earlier contributions and the earlier signature remain valid under the version signed. | A signature is assent to a specific text. |
| You contribute to a **different CSA project** | **Yes — sign that project's CLA once.** Your signatures for other projects are unaffected. | Coverage is keyed to the project; each signature is an explicit agreement to contribute to one specific project. |

## Versioning

- CLA versions are numbered `vMAJOR.MINOR` (e.g. `v1.0`).
- Each project's current text lives at `<project>/CLA.md`. On approval, the
  exact text is frozen into `<project>/versions/` and is never edited again.
- A contributor has **one signature file per project** (`<id>.md`), which embeds
  the version they signed. **Re-signing replaces that file in place** with the
  new version; the prior signed text is preserved in the repository's git
  history — the immutable archive of what each contributor agreed to, and when.
- The project's CLA check enforces the **current required version**: a
  contributor who signed an earlier version must re-sign before contributing
  under the new one. Contributions made earlier remain governed by the version
  in force when they were made (provable from git history).
- New CLA versions are **prospective only**. CSA does not retroactively
  re-bind past contributions or past contributors to new terms.

## Material vs. non-material changes

A **material** change requires a new version and new assent for subsequent
contributions. A **non-material** change does not. As a working rule:

- **Material** — any change to the *grant of license*, the *contributor
  representations*, the *execution/identity* terms, or the *governing-law and
  venue* terms (in the current text, sections 2, 2A, 3, 4, 8, and 9). A change
  of governing law or forum can alter a contributor's rights and is treated as
  material by default.
- **Non-material** — clarifications and formatting. (Adding a new project to
  the ledger is not a change to any existing CLA; each project has its own.)
- **Borderline** — anything not clearly non-material is presumed material and
  confirmed through CSA's change-control process (below) with legal review.

## Who may change a CLA

Changes to any CLA text are made only through CSA's internal review and
approval process, including legal review. The text currently in `CLA.md` is
the authoritative version; superseded versions are preserved, unedited, under
`versions/`.

## Employer-owned contributions

There is no separate Corporate CLA. The program is individual-only: a
contributor who signs warrants (in the CLA's representations) that they are
entitled to grant the rights, including that no employer or third-party rights
prevent the grant. Contributors whose work is employer-owned must obtain their
employer's authorization before signing.

## How signatures are recorded

To sign, a contributor opens a pull request adding a file
`<project>/signatures/<id>.md`, named for their **GitHub numeric account ID**,
containing the full text of the CLA they agree to plus a short signature block
(login, numeric ID, version, date, assent). The `validate-signature.yml`
workflow takes identity from the **authenticated account that opens the PR** —
not git commit-author metadata — and confirms that the filename, the login, and
the numeric ID in the file all match that account, that the version/date/assent
fields are present, that the signature block matches the required template
exactly (nothing added before, between, or after it), and that the embedded CLA
text matches the published canonical version verbatim.

Separately, each project's own CLA check (`cla.yml`, in the project repository)
runs on contribution pull requests and confirms every commit author has a
signature **for the version the project currently requires** — prompting anyone
on an older version to re-sign. Re-signing replaces a contributor's file in
place; the repository's git history preserves every prior version of every
signature file and is the tamper-evidence.
