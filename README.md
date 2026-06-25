# CSA CLA-Ledger

The canonical home of the Cloud Security Alliance **Contributor License
Agreement (CLA)** and the public record of who has signed it. This repository
is shared infrastructure used across CSA projects — it is not itself a product
or framework; it's the contribution-agreement backbone the projects rely on.

**Want to sign?** → from a clone of your fork, run [`sign.py`](sign.py)
(`python3 sign.py <your-login>`) to generate your signature file, or follow the
step-by-step in
[`security-controls-catalog/signatures/README.md`](security-controls-catalog/signatures/README.md).
New to CLAs? → [`FAQ.md`](FAQ.md).

## Why this exists

CSA publishes frameworks (the Cloud Controls Matrix, the AI Controls Matrix,
the Security Controls Catalog, and others) and licenses them, including
commercially. To include an outside contribution in that work, CSA needs clear,
written permission from the contributor. The CLA is that permission; this
repository holds the agreement text and the signatures.

## Projects & CLAs covered

Coverage is **per project**: each has its own directory, CLA, and signatures.
Today the ledger covers one project; others (CCM, AICM, …) would be added as
sibling directories, each signed separately.

| Project | Current CLA | Project repo |
|---|---|---|
| **[Security Controls Catalog](security-controls-catalog/)** | [v1.0](security-controls-catalog/versions/CLA-v1.0.md) | [CloudSecurityAlliance/SecurityControlsCatalog](https://github.com/CloudSecurityAlliance/SecurityControlsCatalog) |

To sign a project's CLA, see its `signatures/README.md` (for the Security
Controls Catalog: [how to sign →](security-controls-catalog/signatures/README.md)).
[`PROJECTS.md`](PROJECTS.md) is the same list as a plain index; the authoritative
test for coverage is whether your signature file exists in a project's
`signatures/` directory.

## Why it works this way — GitHub-native by design

Contributions to CSA's catalogs happen **in GitHub**, as pull requests. So the
CLA lives where the work does, rather than in a separate system:

- **You sign in GitHub, by opening a pull request.** You add a signature file
  to the project's directory here via pull request; CSA accepts it by merging.
  There is **no third-party CLA service, no web form, and no separate account** —
  you use your existing GitHub account, and nothing about you is stored
  off-GitHub.
- **Enforcement is a GitHub Action.** When you open a pull request on a CSA
  project, an automated check confirms your signature for that project is on
  file here before it can be merged. (Two small workflows do this — see below —
  with no bot, no app, and no third-party or cross-repo token.)
- **Your signature is a durable git commit.** A file containing the full
  agreement and your "I agree," submitted through a pull request opened from your authenticated GitHub
  account, is strong, self-contained, timestamped evidence — and the git history
  is tamper-evident.
- **Minimal, already-public data.** The only *identity* fields the **signature
  file** records are your GitHub **login** and **numeric account ID** — not your
  legal name, email, or employer. (The numeric ID is recorded because logins can
  be renamed; the ID can't.) These are already public the moment you contribute
  to a public repo. (The signature file also notes the CLA version and the date;
  the public repository history records the commit — including the author name
  and email your own git is configured with — and GitHub records the associated
  pull request metadata. See [`PRIVACY.md`](PRIVACY.md).)
- **Sign once per project.** Your signature is keyed to the *project* you're
  contributing to — an explicit agreement to contribute to that specific work.
  Contributing to another CSA project later means signing that project's CLA
  too.

The trade-off: signing is one extra pull request the first time. In exchange,
the whole process is transparent, self-verifiable, and requires no
infrastructure beyond GitHub itself.

Several of these choices are deliberate and have reasoning that isn't obvious at
a glance (why the CLA is forward-looking, why the check verifies commit authors,
why signature PRs are reviewed, and more). That reasoning is collected in
[`DESIGN-NOTES.md`](DESIGN-NOTES.md) — worth a look before concluding something
is an oversight.

## How coverage works

Coverage is **per project**. Each CSA project that uses this ledger has its own
directory, holding that project's CLA, its frozen versions, and its
contributors' signatures. A contributor signs the CLA for each project they
contribute to — so a signature is an explicit agreement to contribute to *that*
project. Signing for the Security Controls Catalog does not, by itself, cover a
different CSA project; that project's CLA is signed separately.

**Why CLAs are project-specific.** This is a deliberate design choice, for two
reasons. First, it gives a stronger evidentiary record: a contributor explicitly
agreed to a specific agreement *naming the project they then contributed to*,
rather than to a blanket agreement signed once somewhere else. Second, it leaves
room to grow — different CSA projects can carry **different publication licenses
and different CLA terms** without entangling one project's contributors in
another's. The Security Controls Catalog is the first project here; others are
added as siblings.

```
CLA-Ledger/
├── README.md                  ← this file
├── PRIVACY.md                 ← what signing records; defers to the CSA Privacy Notice
├── GOVERNANCE.md              ← CLA versioning + change policy
├── FAQ.md                     ← plain-English: what signing means, and why
├── DESIGN-NOTES.md            ← why the design is the way it is (for reviewers)
├── STANDARD-LICENSE.md        ← reference: CSA's standard publication license
├── PROJECTS.md                ← index of projects tracked in this ledger
├── LICENSE                    ← license for the agreement texts in this repo
└── security-controls-catalog/ ← one directory per project (this is the first)
    ├── CLA.md                 ← this project's Contributor License Agreement
    ├── signatures/            ← one signature file per contributor (the ledger);
    │                            see signatures/README.md for how to sign
    └── versions/              ← immutable frozen copy of every CLA version
```

**Authoritative coverage is a current-version signature file for you in a
project's `signatures/` directory** — the project's check requires the CLA
version it currently uses, so a contributor who signed an earlier version
re-signs the new one to keep contributing. `PROJECTS.md` is a convenience index
only; if it is stale, coverage is unaffected.

## How signing & enforcement work

Two GitHub Actions workflows, both reading only public data — no third-party
action, GitHub App, or cross-repo token:

1. **In this repository** (`.github/workflows/validate-signature.yml`): when you
   open a pull request adding your `signatures/<id>.md` (named for your numeric
   account ID), the check takes identity from the **authenticated account that
   opened the PR** and confirms the filename, the login, and the numeric ID in
   the file all match that account — and that the CLA text embedded in the file
   matches the published version verbatim. When it passes and CSA merges the PR,
   your signature is **accepted and recorded** (CSA accepts at its discretion).
2. **In each CSA project repository** (`.github/workflows/cla.yml`): when you open
   a contribution PR there, the check reads this public ledger and confirms every
   commit author has a signature file **for that project** (keyed by numeric
   account ID). If not, it blocks the merge and points the contributor here.

## Integrity

Each signer has **one live signature file** under `signatures/` (`<id>.md`);
re-signing for a new CLA version **replaces it in place**, and every prior
signed version is preserved in the repository's git history. Frozen files under
any `versions/` directory are **never edited or deleted** — a signature is
assent to a specific text, so the exact text signed is preserved permanently.
Git history is the tamper-evidence for both.

## What a signature record contains

To sign, a contributor opens a pull request adding `signatures/<id>.md`, named
for their numeric account ID, in the relevant project's directory (see
`security-controls-catalog/signatures/README.md`).
Each file embeds the **full text of the CLA version signed** plus a short
signature block recording the contributor's **GitHub login** and **numeric
account ID**, the CLA version, and the date. The numeric ID is recorded because
logins can change. The **signature file** records no legal name, email, or
employer; git commit metadata is separate (see [`PRIVACY.md`](PRIVACY.md)). A check validates that file against the **authenticated account that
opens the PR** (not git commit-author metadata): the filename and the login/ID
in the file must match that account, and the embedded CLA text must match the
published version verbatim.

## Adding a project

A new project joins the ledger by (1) adding its own directory here — with its
`CLA.md`, `signatures/`, and `versions/` — (2) listing itself in `PROJECTS.md`,
and (3) running the CLA check in its own repository that verifies each
contributor has a signature file in *that project's* `signatures/` directory.
Contributors sign that project's CLA separately from any other.

Each project chooses its own terms:

- **Its publication license** may be CSA's standard publication license
  (documented in [`STANDARD-LICENSE.md`](STANDARD-LICENSE.md)) or a different
  one — whatever that project ships in its repository's `LICENSE.txt`.
- **Its CLA** may reuse the same agreement text another project uses, or carry
  project-specific terms — its own `CLA.md`, versioned independently in its own
  `versions/` directory.

Because coverage is per project, these choices for a new project never affect
the contributors or signatures of any existing one.
