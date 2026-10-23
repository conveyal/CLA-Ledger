# CLA governance

The deployed ledger is public in `conveyal/CLA-Ledger`. A merged signature
record is EBP US Inc.'s acceptance of the contributor's offer. Authorized
Conveyal maintainers review and merge records on EBP's behalf. GitHub merge
permission alone does not establish EBP's authorization. The current
required version is the value in `versions/CURRENT`.

One accepted signature per CLA version covers all open-source repositories in
the Conveyal GitHub organization (`conveyal`), including future additions.
Repository workflows and refresh enrollment control enforcement, not agreement
scope. Corporate coverage remains limited to authorized contributor accounts.

CLA text is immutable once signed. A material change to the grant,
representations, execution, identity, or scope creates a new `vMAJOR.MINOR`
version and requires new records for future contributions. Existing records are
never rewritten, and historical contributions are not re-bound.

Signature records are append-only and grouped by CLA version. New versions
receive new individual records. Corporate updates append the next numbered
snapshot, retaining previous snapshots. For future contributions under a
version, coverage uses the newest accepted snapshot for each organization,
together with individual signatures. An authorization change does not undo
grants already accepted for earlier contributions.

The completed agreement, `v1.0`, has no governing-law or venue clause.
Adding either clause requires a counsel-reviewed material version.

During an outage, only designated maintainers may bypass the required check.
They must record the PR, reason, and approving maintainer in the maintainer-only
operations log. The automation never fails open.
