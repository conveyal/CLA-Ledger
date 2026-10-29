# Projects

This repository contains the authoritative signature records.
[CLA section 7](CLA.md#7-scope-and-versions) defines which repositories
they cover. A repository such as R5 enforces coverage by calling the reusable
workflow, which reads this repository's trusted ledger branch.

`cla/projects.json` is the reviewed allowlist for automatic refresh after an
accepted record changes. It does not determine agreement scope. Each enabled
entry names a repository, its consumer workflow, and the branch on which fresh
evaluations run. Enrollment does not install the workflow or configure branch
protection; follow [SETUP_PROJECT.md](SETUP_PROJECT.md) for those steps.

The disposable `conveyal/cla-test` repository is enabled for the initial pilot.
R5 is listed with its `dev` branch and remains disabled until its consumer
workflow and refresh App access are configured. Test signature records stay
in the disposable repository and do not count as accepted public signatures.
