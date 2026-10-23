# Projects

The deployed Conveyal ledger lives in `conveyal/CLA-Ledger` and is scoped to
open-source contributions to the Conveyal GitHub organization (`conveyal`). EBP
US Inc. is the legal party, but unrelated EBP projects outside that organization
are not covered. R5 and additional Conveyal
projects may reuse the same agreement and records by calling the reusable
workflow and reading this repository's trusted ledger branch.

This repository contains the authoritative signature records.

`cla/projects.json` is the reviewed allowlist for automatic refresh after an
accepted record changes. Each enabled entry names a repository, its consumer
workflow, and the branch on which fresh evaluations run. Enrollment does not
install the workflow or configure branch protection; follow
[SETUP_PROJECT.md](SETUP_PROJECT.md) for those steps.

The disposable `conveyal/cla-test` repository is enabled for the initial pilot.
R5 is listed with its `dev` branch and remains disabled until its consumer
workflow and refresh App access are configured. Test signature records stay
in the disposable repository and do not count as accepted public signatures.
