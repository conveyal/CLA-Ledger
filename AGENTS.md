# Conveyal CLA Ledger

This repository is an adapted ledger based on Cloud Security Alliance's
CLA-Ledger. Keep the CC BY 4.0 attribution. Do not add or copy upstream
signature records.

The deployed public ledger is this repository. Keep canonical CLA text under
`versions/`, keep `CURRENT` synchronized, and never edit a frozen version after
it has been signed.

Signature workflows must validate PR content through the API while checking out
only trusted base-branch code. Contribution checks must inspect commit authors,
exempt GitHub `Bot` accounts, and fail closed for unknown human authors.
