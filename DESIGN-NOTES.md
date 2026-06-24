# Design notes & rationale

This document records the **deliberate design decisions** behind the CLA-Ledger
and the project CLAs, with the reasoning for each. It exists so reviewers and
contributors can see *why* a choice was made rather than re-deriving it — a few
of these look like gaps at first glance but are intentional and explained below.

If something here doesn't hold up, or you spot a real issue that isn't covered,
please open an issue — that's genuinely welcome. The notes below are meant to
save time, not to discourage scrutiny.

## 1. The CLA is forward-looking, by design

Each CLA covers a contributor's **present and future** Contributions to the
project, from the point they agree onward. It is intentionally **not**
retroactive.

- **Why not retroactive:** "present and future" is the standard, clean scope for
  a contributor agreement.
- **Why not a hard date cutoff either:** wording like "nothing before the
  effective date" would accidentally exclude a contributor's *first*
  contribution, whose commits are usually authored just before they sign.
  "Present and future" covers work in flight; a date cutoff would strand it.
- **The existing repository history:** the initial setup commits predate the CLA
  and are CSA's through work made for hire (the CLA's §10 savings clause), not
  through the CLA — so the forward-looking scope leaves no gap.

## 2. The CLA is individual, and the check verifies commit authors

"You" in the CLA is a single natural person, and the enforcement check verifies
that **every commit author** on a pull request has signed.

- **Why authors, not committers or PR openers:** copyright attaches to the
  **author** of the expression. Someone who merely applies a patch, or who opens
  a PR of another person's work, is not the author. Authors are the right party.
- **Group work is fully supported:** copyright protects written expression, not
  ideas or discussion. When several people discuss and one writes it up and
  submits it, that person is the sole author and the only required signer.
  Genuine co-authors (who co-wrote the text) each sign, or the submitter uses the
  CLA's "submissions on behalf of others" provision.
- **`Co-authored-by:` trailers** are not enforced by the check (they carry email
  addresses that do not map reliably to a GitHub numeric account ID). By policy,
  use them only for genuine co-authors who have also signed. See each project's
  `CONTRIBUTING.md`.

## 3. Coverage is per project, not per license regime

Each project has its own directory, CLA, and signature set; a contributor signs
once per project.

- **Why:** it gives a stronger evidentiary record — explicit assent to a named
  project the person then contributed to — and lets each project carry its own
  publication license and CLA terms without entangling another project's
  contributors. See `GOVERNANCE.md` and `README.md`.

## 4. Signing is offer-and-acceptance; signature PRs are reviewed

A contributor *offers* their signature by opening a pull request; CSA *accepts*
by **merging** it. Signature PRs are covered by `CODEOWNERS` (owner review).

- **Why owner review of signatures** (it can look like it blocks self-service):
  the merge is the acceptance step. An automated workflow validates each
  signature first (identity, required fields, verbatim CLA text), so review is
  light, and the merge is the act of acceptance. This is intentional, not an
  oversight, and matches each CLA's "Execution and Identity" section.

## 5. Identity = the authenticated PR opener, keyed to the numeric account ID

Signature files are named `<numeric-id>.md` and validated against the account
that **opens the PR** (login + numeric ID from the event payload), not git
commit metadata.

- **Why the numeric ID:** GitHub logins can be renamed; the numeric ID is
  permanent, so it is the durable identity of record.
- **Why the PR opener:** git author/committer fields are self-asserted and can be
  spoofed; the authenticated account that opens the PR cannot.
- **Why embed the full CLA text + an exact-shape check:** each signature file is
  a self-contained record of exactly what was agreed. The validator confirms the
  file is the published CLA text verbatim, followed by *exactly* the signature
  block from the template (login, numeric ID, version, date) — with nothing
  added before, between, or after it, so no extra or conflicting language can
  ride along.

## 6. The validation workflow never runs PR code

`validate-signature.yml` uses `pull_request_target`, checks out only the
**trusted base branch**, runs the validation script from there, and fetches the
PR's file content via the API. It does not check out or execute PR code.

- **Why this matters:** `pull_request_target` runs with repository write
  permissions; GitHub warns against running untrusted PR code under it. This
  workflow avoids that pattern deliberately.

## 7. Minimal data; privacy defers to CSA's notice

The personal data the **signature file** records is the contributor's GitHub
login and numeric account ID (both already public), plus the CLA version, date,
and assent; the signing commit and pull request are part of the public
repository/GitHub history. (Git also stamps each commit with the contributor's
own self-asserted author name and email — CSA neither requests nor relies on it;
see `PRIVACY.md`.) Retention is for the life of the (perpetual, irrevocable)
grant, as evidence of it.

- `PRIVACY.md` here is a *processing-specific* addendum; CSA's overall privacy
  practices, contributor rights, and contact details are in the **CSA Privacy
  Notice** linked there. The ledger does not maintain its own parallel
  regulatory apparatus.

## 8. Versioning: frozen canonical text, replace-in-place signatures, version-aware enforcement

- **Canonical text** for each version is frozen into `versions/` so signatures
  bind to exact text. Before any signature references a version, the frozen copy
  may still be regenerated (e.g., if wording changes during final review); once
  a signature references it, it is permanent.
- **Signatures are one file per contributor per project** (`<id>.md`), embedding
  the version signed. If the project adopts a new version, the contributor
  **re-signs by replacing that file in place**; git history preserves every
  prior signed version (the immutable archive).
- **Enforcement is version-aware:** the project's `cla.yml` checks that each
  commit author has a signature for the *currently required* version — not
  merely that a file exists — so a material new version actually compels
  re-signing. See `GOVERNANCE.md` and each project's `versions/README.md`.

## 9. The grant is broad to CSA; CSA controls what recipients receive

The CLA grants rights to **CSA only** (with CSA holding the right to
sublicense). It does **not** grant rights directly to recipients of the
published Work.

- **Why:** CSA's outbound license (`LICENSE.txt`) is *restrictive* — no
  modification, no redistribution. Permissive-project CLAs (e.g. Apache's) grant
  recipients broad rights directly, which suits a permissive outbound license;
  here that would undercut the restriction. So contributors grant broadly to
  CSA, and CSA licenses recipients on its own terms (the restrictive outbound
  license, or whatever CSA later chooses). Broad inbound, CSA-controlled
  outbound.

## 10. Clauses reviewers often question — and why they stay

These come up in nearly every review. Each is a deliberate keep.

- **Patent grant (§3).** Kept. The Contribution definition includes software and
  schemas, and the project will carry tooling (bundle generation, format
  conversion, validation), so patentable contributions are plausible. The grant
  plus its defensive-termination clause is cheap, standard, and future-proof;
  removing it and re-adding it later would force everyone to re-sign.
- **Moral-rights waiver (§2A).** Kept. It lets CSA edit, reorganize, translate,
  and republish the catalog without attribution/integrity disputes. Where local
  law doesn't permit a waiver, the clause falls back to *consent* — which is why
  it's safe even though EU/academic contributors may ask about it.
- **Nevada governing law (§9).** CSA's incorporation state; using an
  organization's home jurisdiction is standard. Expect occasional questions; it
  does not change a contributor's rights to their own work.
- **AI / computational use — intentionally implicit.** The granted rights of
  reproduction and derivative-work preparation already reach computational and
  AI uses (training, embeddings, retrieval) — those operate by copying and
  creating derivatives of the text. The CLA does **not** add a blanket all-purpose clause or name AI; that was
  **considered and declined**, for four reasons:
  1. *Enumeration is a treadmill that can narrow the grant.* Today it's AI;
     tomorrow it's the next paradigm. Listing "AI/ML" risks the *expressio
     unius* reading — "you named the uses you meant, and mine isn't there" — so
     relying on the general reproduction and derivative-work rights is safer
     than a named carve-out.
  2. *No AI-specific terms are baked in.* Naming AI in the agreement would
     assert a position better set at the policy / outbound-license layer; the
     CLA stays technology-neutral.
  3. *AI/openness is an outbound-license question, not a CLA one.* What *CSA*
     may do (train, build tooling) is already fully granted; what *third
     parties* may do is governed by `LICENSE.txt`. If CSA later decides it
     wants the catalog to be trainable by others, that's a change to the
     **outbound license**, decided when CSA has a position.
  4. *The broad grant preserves every option without re-signing.* Relicensing
     already-contributed work under more open terms is a "No re-sign" case (see
     `GOVERNANCE.md`), so leaving AI implicit costs CSA nothing and locks in
     nothing.

  A tech-neutral catch-all phrase (covering uses "now known or hereafter
  developed") was deliberately **not** adopted; if broader certainty is later
  wanted, such a phrase — not an AI enumeration — is the standard move. The
  contributor FAQ explains the practical effect in plain terms.
