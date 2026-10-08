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

Ordinary PR runs bind their head to the event. Fresh dispatches resolve an open
PR in the caller repository through the API. Both publish the same named check
on that head SHA, independently of the Actions run's own commit association.
They use trusted caller-base and pinned implementation checkouts. Checkout
failures complete the prepared check as failure; per-PR concurrency cancels
superseded evaluations.

Personalized editor links reproduce the complete agreement and record template
for each uncovered account. They do not submit a signature or establish identity.
The PR opener still supplies authentication. A conservative URL budget and a
comment-size budget retain manual instructions when a full link cannot fit.

The accepted-record refresh workflow reads an explicit project allowlist and
uses a scoped App installation token to dispatch fresh evaluations. Consumers
publish their own comments and commit-bound checks with GITHUB_TOKEN. The App
does not need contributor authorization or permission to write source files.
