# CLAUDE.md — CSA CLA-Ledger

Guidance for working in this repository. This is a **public** repo; keep
everything here appropriate for public view.

## What this repo is

The canonical home for Cloud Security Alliance Contributor License Agreement
texts and the records of who has signed them, organized **by project** — one
top-level directory per project (the first is `security-controls-catalog/`),
each holding that project's `CLA.md`, `signatures/`, and `versions/`. Coverage
is per project. See `README.md` for the structure and the coverage model.

CLAs are **project-specific by design**: it gives a stronger evidentiary record
(explicit assent to a named project) and lets each project carry its own
publication license and its own CLA terms. A new project is a new sibling
directory; it may reuse the standard publication license
(`STANDARD-LICENSE.md`) or a different one, and may reuse another project's CLA
text or define its own — without affecting any existing project's signatures.

**Before flagging a design choice as a gap, read [`DESIGN-NOTES.md`](DESIGN-NOTES.md).**
It explains the deliberate, sometimes non-obvious decisions — forward-looking CLA
scope, commit-author enforcement, reviewed signature PRs, `pull_request_target`
safety, per-project coverage, and more — so they aren't repeatedly re-litigated.

## Load-bearing rules — do not break these

- **`*/signatures/` holds one contributor-committed file per signer**, named
  for the signer's numeric GitHub account ID (`<id>.md`) and embedding the full
  CLA text they assented to. A signature is added by the contributor via pull
  request (see `signatures/README.md`) and validated against the **authenticated
  account that opens the PR** (login + numeric id from the event payload), never
  git commit-author metadata. Do not hand-edit or remove signature files.
  Removing a signature does not revoke the rights granted — it only destroys the
  evidence.
- **`*/versions/` files are immutable.** Each is a frozen copy of a CLA
  version that real people have signed. Never edit or delete a file there. A
  signature is assent to a specific text; that exact text must survive
  unchanged.
- **`CLA.md` and `PRIVACY.md` are legal documents.** Do not change their
  substance without going through the approval chain. A *material* change to
  the CLA (grant, representations, execution, or governing-law/venue) is a
  **new version**: bump it, freeze the prior version under `versions/`, and do
  not migrate existing signatures. See `GOVERNANCE.md` for the taxonomy.
- **Coverage is per project, and version-aware.** A signature lives in a
  specific project's `signatures/` directory and covers contributions to *that*
  project only; the authoritative test is the contributor's `<id>.md` present
  **for the CLA version the project currently requires** (a material new version
  means re-signing). `PROJECTS.md` (top level) is a convenience index only.

## Common tasks

- **Add a project:** create `<project>/` with its own `CLA.md`, `signatures/`,
  and `versions/`; add a row to the top-level `PROJECTS.md`; and have that
  project's repo run the CLA check pointed at `<project>/signatures/`.
- **Publish a new CLA version:** freeze the current text into that project's
  `versions/`, update its `CLA.md`, and record the change in `GOVERNANCE.md`.

## Do not

- Do not put anyone's legal name, email, or employer in signature-file contents,
  agreement docs, or helper-generated fields. Git commit metadata is separate,
  self-asserted contributor-controlled data; remind contributors who do not want
  to publish a real name or email to use a chosen name and a GitHub
  noreply/private email before committing.
- Do not rewrite git history here — it is the integrity record for the
  signatures.
