# Design notes

This ledger deliberately uses GitHub as the identity and audit system. The
signature workflow runs on `pull_request_target`, checks out only the trusted
base branch, and fetches proposed files through the API. It never executes code
from an untrusted fork.

The contribution workflow reads only merged records from the central ledger
data checkout. This prevents a pull request from adding its own signature and
code in one change. Signature-only pull requests against the ledger are
validated separately so contributors can sign without first being covered.

Coverage is keyed by numeric GitHub account ID because usernames can change.
Bot accounts are exempt; unknown or unmapped human commit authors fail closed.
The public record is intentionally minimal and corporate authorization records
contain only organization and GitHub account metadata.

Record paths include the signed CLA version. Corporate authorizations append
numbered snapshots; coverage uses the newest snapshot for each organization
and version. Validation accepts additions only and rejects changes to existing
records, including renames out of the signature directory.

PR file and commit lists must match the counts in GitHub's PR metadata. The
checker verifies the PR head and base before accepting a result. API limits,
incomplete lists, and changes during validation fail closed.
