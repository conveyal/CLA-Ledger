# CLA governance

The deployed ledger is public in `conveyal/CLA-Ledger`. A merged signature
record is Conveyal's acceptance of the contributor's offer. The current
required version is the value in `versions/CURRENT`.

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

The first R5 agreement, `v0.1`, is explicitly provisional and has no
governing-law or venue clause. Counsel review should produce the next material version.

During an outage, only designated maintainers may bypass the required check.
They must record the PR, reason, and approving maintainer in the maintainer-only
operations log. The automation never fails open.
