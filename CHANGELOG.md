# Changelog

## v0.0.1 — 2026-10-08

First tooling release. Consumers must grant `checks: write` and require the
explicit `Conveyal CLA` check on the PR head. Automatic refresh additionally
needs a `workflow_dispatch` input named `pr_number`; use the complete caller
in [SETUP_PROJECT.md](SETUP_PROJECT.md).

- Renumbered the unsigned provisional agreement to `v0.1`; legal review will
  produce a later version without rewriting accepted records.
- Added a shared individual-record renderer, `--editor-url`, and opt-in
  personalized signing comments. The maintainer-account browser prototype passed;
  outsider forking remains a rollout check.
- Added the commit-bound `Conveyal CLA` check and fresh-dispatch evaluations.
- Added accepted-record refresh through an enrolled-project allowlist and a
  scoped GitHub App. App installation and credentials are required to enable refresh.
- Verified native editor signing, maintainer acceptance, automatic fresh
  evaluation on the unchanged contribution commit, and comment replacement
  in `conveyal/cla-test`. Testing with an account without write access remains
  required before the production onboarding pilot.
- Selected `v0.0.1` for the first tooling release, independently of agreement `v0.1`.

## Initial implementation

- Adapted the Cloud Security Alliance CLA-Ledger under CC BY 4.0 for Conveyal.
- Added a provisional organization-wide CLA and GitHub-native
  individual/corporate record formats.
- Added trusted-base signature validation and fail-closed contribution checks.
