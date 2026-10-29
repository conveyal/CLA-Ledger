# CLA governance

The deployed ledger is public in `conveyal/CLA-Ledger`. A merged signature
record is EBP US Inc.'s acceptance of the contributor's offer. Authorized
Conveyal maintainers review and merge records on EBP's behalf. GitHub merge
permission alone does not establish EBP's authorization. The current
required version is the value in `versions/CURRENT`.

CLA text is immutable once signed. A material change to the grant,
representations, execution, identity, or scope creates a new `vMAJOR.MINOR`
version. Existing records are never rewritten. See
[CLA section 7](CLA.md#7-scope-and-versions) for the effect of a new version on coverage.

Signature records are append-only and grouped by CLA version. New versions
receive new individual records. Corporate updates append the next numbered
snapshot, retaining previous snapshots. For future contributions under a
version, coverage uses the newest accepted snapshot for each organization,
together with individual signatures. An authorization change does not undo
grants already accepted for earlier contributions.

During an outage, only designated maintainers may bypass the required check.
They must record the PR, reason, and approving maintainer in the maintainer-only
operations log. The automation never fails open.
