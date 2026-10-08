# Conveyal CLA Ledger

This repository is Conveyal's adapted, GitHub-native ledger for recording
Contributor License Agreement (CLA) acceptances. It is based on the
[Cloud Security Alliance CLA-Ledger](https://github.com/CloudSecurityAlliance/CLA-Ledger),
licensed under CC BY 4.0, and modified for Conveyal's open-source projects.

This public repository is the authoritative organization-wide ledger for
Conveyal. It contains the canonical agreement versions, public signature
records, signing helper, validation logic, and reusable workflows used by R5
and any other opted-in repository.

The helper and workflow scripts require Node.js 24.2 or newer and use only Node's
built-in modules. No npm install or TypeScript compiler is required; run them
directly with `node path/to/script.ts`.

For local development, use the pnpm version and Node.js 24 runtime declared in
`package.json`. Install the type-checking dependencies with `pnpm install --frozen-lockfile`.
Run `pnpm typecheck` to check the scripts with TypeScript. This
[no-output check](https://www.typescriptlang.org/tsconfig/noEmit.html) adds no
build step to signing or workflow execution.

Run the offline test suite with:

```sh
pnpm test
```

The [test workflow](.github/workflows/test.yml) runs type checking and tests on
pull requests and pushes to `main`. It sets up pnpm and Node.js from
`package.json` with `pnpm/setup` and installs dependencies from the lockfile.

## Design

- GitHub is the identity and acceptance system; no hosted CLA service or
  external database is required.
- A signature is a versioned file committed through a pull request. Maintainer
  merge is acceptance.
- Individual records are keyed by immutable GitHub numeric account ID.
- Corporate records name an organization, its representative account, and the
  authorized account IDs. They do not publish legal names, emails, or addresses.
- Records are append-only under `signatures/<version>/`. Individual signatures
  use `individual/<account-id>.md`; corporate authorizations use numbered
  snapshots under `corporate/<organization>/`. The newest accepted snapshot
  supplies corporate coverage for that version.
- The contribution check reads only records already present on the trusted base
  branch and exempts GitHub accounts whose API type is `Bot`.
- CLA text is provisional until legal review. A material revision gets a new
  immutable version and does not rewrite historical signatures.

## Using the ledger from another repository

Follow [SETUP_PROJECT.md](SETUP_PROJECT.md) for the R5 caller workflow,
release selection, rollout checks, and branch protection setup.

Consumer repositories need only a small caller workflow. It supplies the
central ledger repository and data ref (normally `main`), a reviewed immutable
release tag (such as `v1.0.0`), and the central signing URL. Use the same tag
for the reusable workflow reference and `implementation_ref`.
The reusable job checks out
the consumer's trusted base, the central ledger data, and the pinned
implementation separately. It reads records only from the central ledger and
never executes code from an untrusted pull request.

See [RELEASING.md](RELEASING.md) to publish a tooling release. Tooling releases
are independent of CLA agreement versions. New accepted signatures become
available through ledger data at `main` without a tooling release.

To add another repository, copy the caller workflow and change only its
repository-specific signing link if needed. No central enrollment file is
required.

Checks verify that GitHub returned every changed file and commit, and that the
PR head and base stayed unchanged during validation. GitHub's PR APIs cap
commit listings at 250 and file listings at 3,000. Checks fail closed when a
required list exceeds those limits or is incomplete. Split oversized PRs into
smaller changes. If the PR changed during validation, update the PR branch to
trigger a fresh workflow run; rerunning an old event retains its old head and
base references.

## Attribution

Based on Cloud Security Alliance's CLA-Ledger, licensed under CC BY 4.0.
Modified by Conveyal for GitHub-native use in R5 and other Conveyal projects.
