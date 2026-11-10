# Conveyal CLA Ledger

This repository is Conveyal's adapted, GitHub-native ledger for recording
Contributor License Agreement (CLA) acceptances. It is based on the
[Cloud Security Alliance CLA-Ledger](https://github.com/CloudSecurityAlliance/CLA-Ledger),
licensed under CC BY 4.0, and modified for Conveyal's open-source projects.

This public repository is the authoritative organization-wide ledger for
Conveyal. It contains the canonical agreement versions, public signature
records, signing helper, validation logic, and reusable workflows for Conveyal's
open-source repositories.

EBP US Inc. is the CLA's legal party and license recipient. The
[agreement](CLA.md) defines which repositories it covers and how signatures are
accepted.

## Sign the CLA

You sign once for each CLA version. One accepted signature covers all public
repositories in the Conveyal GitHub organization. You do not sign if GitHub
identifies your account as a bot, or if your account is in
[`cla/exempt.json`](cla/exempt.json). This file lists EBP US Inc. employees.

1. Read the [agreement](CLA.md). If your employer can own your work, make sure
   that you have its authorization. See section 4 of the agreement.
2. Make your signature record. Use one of these methods:
   - **From the signing page:** Open <https://conveyal.github.io/CLA-Ledger/>
     and enter your GitHub login. The page shows your record and a link that
     opens GitHub's file editor with the record filled in.
   - **From your pull request:** When the CLA check fails on a pull request,
     the check's comment shows a **Sign the CLA** link next to your account.
     Open the link. GitHub opens its file editor with your record filled in.
   - **From the command line:** Install Node.js 24.2 or later. Clone this
     repository. In the repository root, run `node sign.ts <your-github-login>`.
     The helper finds your numeric GitHub account ID and writes the file
     `signatures/v1.0/individual/<id>.md`. To get a GitHub editor link instead
     of a file, add `--editor-url`.
3. Examine the record. The GitHub login and account ID must identify your
   account. Do not add your name, email address, or postal address.
4. Commit the record to a new branch. Open a pull request to the `main` branch
   of this repository from the account that the record identifies. If you do
   not have write access, GitHub makes a fork for you in the editor. On the
   command line, push your branch to your fork.
5. A maintainer reviews the record. Your signature is accepted only when the
   maintainer merges the pull request.

After the merge, the CLA check on your open contribution pull requests runs
again automatically. If the check does not run again, ask a maintainer to start
it. When a new CLA version is published, sign again. Your earlier records stay
in the ledger.

## Development

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
- A signature is a versioned file committed through a pull request. It links to
  the agreement and records its SHA-256 hash. Maintainer merge is acceptance.
- Records are keyed by immutable GitHub numeric account ID. They do not
  publish legal names, emails, or addresses.
- Records are append-only under `signatures/<version>/individual/<account-id>.md`.
- The contribution check reads only records already present on the trusted base
  branch and exempts GitHub accounts whose API type is `Bot` and accounts listed
  in `cla/exempt.json`.
- CLA v1.0 is complete. A material revision gets a new
  immutable version and does not rewrite historical signatures.

## Using the ledger from another repository

Follow [SETUP_PROJECT.md](SETUP_PROJECT.md) for the caller workflow,
release selection, rollout checks, and branch protection setup.

Consumer repositories need only a small caller workflow. It supplies the
central ledger repository and data ref (normally `main`), a reviewed immutable
release tag (such as `v0.0.1`), and the central signing URL. Use the same tag
for the reusable workflow reference and `implementation_ref`.
The reusable job checks out
the consumer's trusted base, the central ledger data, and the pinned
implementation separately. It reads records only from the central ledger and
never executes code from an untrusted pull request.

See [RELEASING.md](RELEASING.md) to publish a tooling release. Tooling releases
are independent of CLA agreement versions. New accepted signatures become
available through ledger data at `main` without a tooling release.

The current agreement is `v1.0`; the first tooling release is
planned as `v0.0.1`. These version numbers are independent. The
[editor-link prototype](EDITOR_PROTOTYPE.md) records the successful maintainer
browser test and the remaining outsider-fork test. Consumers can enable
individual signing links with `personalized_signing_links: true`.

To add enforcement to another repository, copy the caller workflow, keep the
central ledger and signing URL, and configure the required check. Coverage
checking needs no central enrollment. Automatic refresh additionally requires an
entry in `cla/projects.json` and the scoped GitHub App described in [SETUP_PROJECT.md](SETUP_PROJECT.md).

Checks verify that GitHub returned every changed file and commit, and that the
PR head and base stayed unchanged during validation. GitHub's PR APIs cap
commit listings at 250 and file listings at 3,000. Checks fail closed when a
required list exceeds those limits or is incomplete. Split oversized PRs into
smaller changes. If the PR changed during validation, update the PR branch to
trigger a fresh workflow run, or dispatch the CLA workflow with the PR number.
Both paths publish the same **Conveyal CLA** check on the evaluated head commit.
Refresh dispatches resolve current revisions instead of replaying old events.

## Attribution

Based on Cloud Security Alliance's CLA-Ledger, licensed under CC BY 4.0.
Modified by Conveyal for GitHub-native use in its open-source projects, for example, R5.
This adaptation is not legal advice.
