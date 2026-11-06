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
receive new records.

## Exempt accounts

`cla/exempt.json` lists GitHub accounts that need no signature record because
EBP US Inc. already holds rights in their work, such as EBP employees. Each
entry has the numeric account ID, which the check uses, plus the login and a
reason for readers. The check reads the list only from the trusted base branch,
so a pull request cannot exempt its own authors.

Changes to the list require code owner review. Remove an entry when the person
leaves EBP; their later contributions then need a signed record. Contractors
and other non-employees sign the CLA unless a written agreement assigns their
work to EBP. An entry publishes the person's login and employment
relationship, so add someone only with their agreement.

## Outages

During an outage, only designated maintainers may bypass the required check.
They must record the PR, reason, and approving maintainer in the maintainer-only
operations log. The automation never fails open.
