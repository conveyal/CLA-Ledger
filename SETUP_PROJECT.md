# Configure the Conveyal CLA check in R5

This guide connects `conveyal/r5` to the central `conveyal/CLA-Ledger`.
R5 calls a reusable GitHub Actions workflow that checks every human commit
author against the current CLA version. Contributors sign in the central ledger.

R5 needs one caller workflow and a link to the signing instructions. Optional
automatic refresh uses a GitHub App configured in the central ledger. The
reusable workflow supplies Node.js and reads the central records. R5 does not
need an npm package, a signing helper, or a local copy of the signature records.

## 1. Prepare the central ledger

1. Publish an immutable tooling release in `conveyal/CLA-Ledger` using [RELEASING.md](RELEASING.md).
2. Verify that the public `main` branch contains `cla/config.json`, `versions/CURRENT`, and the corresponding agreement file.
3. Verify that `.github/workflows/cla.yml` runs and accepts a valid signature PR through maintainer review.
4. Use the current provisional agreement `v0.1` pending legal review. A counsel-reviewed material change will receive a new version; retain all accepted records.
5. Merge current-version records for the maintainers who will exercise the R5 check.

Individual and corporate records both supply coverage. An open signature PR
supplies no coverage until a maintainer merges it. See the
[signature instructions](signatures/README.md) for record generation and corporate updates.

Select a published release from the ledger's
[Releases page](https://github.com/conveyal/CLA-Ledger/releases).
Review its release notes and verify that GitHub marks it **Immutable**.
Use the exact release tag, such as `v0.0.1`, for both the workflow reference
and `implementation_ref`. A floating tag such as `v1` can change between runs.

Tooling releases and agreement versions are independent. A tooling release
does not change `versions/CURRENT` or require contributors to sign again.
GitHub documents release tag references in its
[reusable workflow guide](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow).

## 2. Add or update the R5 caller

Create or replace `.github/workflows/cla.yml` in R5 with this content.
The example uses `v0.0.1`; substitute your selected published version in both places.
The example version must exist as an immutable release before this caller can run.
An existing caller that references `main` needs both references updated.

```yaml
name: CLA

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
    inputs:
      pr_number:
        description: Pull request number to evaluate afresh
        required: true
        type: string

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  check:
    name: Check contributor coverage
    uses: conveyal/CLA-Ledger/.github/workflows/check-contributors.yml@v0.0.1
    with:
      ledger_repository: conveyal/CLA-Ledger
      ledger_data_ref: main
      implementation_repository: conveyal/CLA-Ledger
      implementation_ref: v0.0.1
      signing_url: https://github.com/conveyal/CLA-Ledger/blob/main/CLA.md
      pr_number: ${{ inputs.pr_number || github.event.pull_request.number }}
      personalized_signing_links: true
    permissions:
      contents: read
      pull-requests: write
      checks: write
```

The implementation stays pinned to the release. Ledger data follows `main`, so a newly
accepted signature supplies coverage without an R5 workflow update.
The input `signature_only_pr` defaults to `false`; keep that default in R5.
The signature-only exemption belongs to the central ledger's signing workflow.

The check uses `pull_request_target` to read PR metadata and post comments,
including on PRs from forks. Its reusable workflow checks out trusted base
code and separate ledger data. It never runs proposed R5 code.
Keep R5 builds and tests in their existing workflows.
See GitHub's [event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) for the trust boundary.

## 3. Configure access and contributor links

In R5, open **Settings → Actions → General**.
Verify that the repository and organization policies permit these dependencies:

- `conveyal/CLA-Ledger/.github/workflows/check-contributors.yml` at the selected release tag
- `actions/checkout` at the ref used by the selected implementation
- `pnpm/setup` at the ref used by the selected implementation

The caller requests `contents: read`, `pull-requests: write`, and `checks: write` through the
built-in `GITHUB_TOKEN`. The current public-ledger implementation needs no
personal access token or custom repository secret. The repository's default
token permissions can remain restricted; the workflow requests its own permissions.
See GitHub's [Actions policy documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

Add this link to R5's README or contribution guide:

```markdown
Before contributing, sign the [Conveyal Contributor License Agreement](https://github.com/conveyal/CLA-Ledger/blob/main/CLA.md).
The automated check requires current CLA coverage for every human commit author.
```

Add the same link to `.github/PULL_REQUEST_TEMPLATE.md`.
Assign `.github/workflows/cla.yml` to the maintainer team in R5's `CODEOWNERS`.

## 4. Test before requiring the check

Merge the caller into R5's default branch through the existing review process.
The initial setup PR cannot demonstrate the new caller before it enters trusted base code.
Then open test PRs against a branch that contains the caller, including a PR from a fork.

Verify these results in the **CLA** workflow:

| Commit authors | Expected result |
| --- | --- |
| Every human author has a merged current-version record | Pass |
| One human author has no record or only an older-version record | Fail, with a signing link in the PR comment |
| Multiple human authors, including one without coverage | Fail, even if the PR opener has coverage |
| GitHub identifies the author as type `Bot` | Exempt that author; still check other authors |
| GitHub cannot map a human commit author to an account | Fail and identify the unmapped commit |

For the uncovered contributor test, merge that contributor's valid signature in the central ledger.
Dispatch the CLA workflow with that PR number, or let the configured refresh App do so.
Verify that **Conveyal CLA** on the current PR head now passes and that the
existing signing comment changes to a coverage confirmation. A fresh dispatch
uses current revisions and works even when the original run is too old to rerun.

Inspect the run's checkout steps. Verify that the implementation uses the
selected release tag and that ledger data comes from `conveyal/CLA-Ledger` at `main`.

## 5. Make the check required

1. Open the branch protection rule or ruleset for each protected R5 target branch.
2. Require status checks before merging.
3. Select **Conveyal CLA**, with GitHub Actions as its source where available.
4. Keep the caller and reusable job names stable after selecting the required check.
5. Verify that an uncovered contributor's PR cannot merge without an authorized bypass.

The reusable job publishes an explicit **Conveyal CLA** check on the evaluated
PR head. Require that check, not only the dispatch workflow job. In the central
ledger, also require the separate **Validate signature** job; signature-only
coverage success does not replace record validation.
GitHub explains enforcement in its
[protected branch documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

The check accepts PR events and dispatches with a PR number. It does not handle
`merge_group` events. A merge queue needs a separate compatible implementation
before it can require this check on queued merge groups.

## Maintenance and troubleshooting

| Situation | Action |
| --- | --- |
| A contributor just signed | Merge the central record; refresh will dispatch the R5 CLA check. If refresh is unavailable, dispatch it manually with the PR number. |
| The CLA version changes | Ask contributors to add records for `versions/CURRENT`; retain all earlier records. |
| A new tooling release is available | Review its release notes, update both release tag references together, and exercise the check again. |
| The reusable workflow cannot resolve | Verify that the release tag exists in the published ledger and that Actions policies permit the workflow and its actions. |
| A PR comment fails with a permission error | Verify the caller's `pull-requests: write` permission and applicable organization policies. |
| A commit author is unmapped | Ask the author to associate the commit email with their GitHub account, then trigger a fresh run. |
| The head or base changed during validation | Dispatch a fresh evaluation for the PR number, or update its branch to trigger a new event. |
| A PR exceeds 250 commits or 3,000 files | Split it into smaller PRs; the GitHub list limits prevent complete verification. |
| The ledger or API is unavailable | Use only the designated maintainer bypass procedure in [GOVERNANCE.md](GOVERNANCE.md). |

The check fails closed when it cannot establish coverage. The
[reusable workflow](.github/workflows/check-contributors.yml) and
[coverage script](.github/scripts/check_cla.ts) define the current behavior.

For another Conveyal project, use the same caller in that repository.
Keep the central ledger and signing URL, and configure its own protected branches.
Coverage alone needs no enrollment. Automatic refresh needs the project entry and App installation below.

## 6. Enable automatic refresh

The refresh App acts only as a workflow dispatcher. Contributors do not
authorize it; they commit and open their own signature PRs in GitHub.
The R5 workflow publishes comments and the commit-bound check with its own
built-in token.

1. In **Conveyal organization settings → Developer settings → GitHub Apps**,
   create a Conveyal-owned App, for example **Conveyal CLA Refresh**.
2. Set its homepage to the ledger repository. Disable **Active** under Webhook.
   This workflow-based integration needs no webhook service or OAuth callback.
3. Set repository permissions **Actions: Read and write** and
   **Pull requests: Read-only**. Metadata is included automatically.
   Do not request Contents write or Checks write for this App.
4. Install it using **Only select repositories**. During the disposable pilot,
   select **cla-test**. Add **r5** before enabling its project entry. The App
   need not be installed on CLA-Ledger to let the ledger mint a token for its
   selected consumer repositories.
5. From the App settings, copy its **Client ID** to the CLA-Ledger Actions
   variable **CLA_REFRESH_APP_CLIENT_ID**. The action uses Client ID, not the
   numeric App ID.
6. Generate a private key. In CLA-Ledger's **Settings → Secrets and variables →
   Actions → Secrets**, create **CLA_REFRESH_APP_PRIVATE_KEY** with the complete
   PEM file contents. Enter it in GitHub, never in a chat or committed file.
7. Review `cla/projects.json`. It contains the consumer repository, workflow
   filename, dispatch ref, and enabled flag. The initial fixture enrolls
   `conveyal/cla-test` at `main`; R5 at `dev` stays disabled until its caller is
   deployed. Enable R5 after its workflow and App access are verified.
8. Allow `actions/create-github-app-token@v3` in CLA-Ledger's Actions policy.
9. Run **Refresh contributor CLA checks** with **dry_run** selected. Verify
   that it lists the expected open PRs. Then run it without dry run and verify
   the actual **Conveyal CLA** result on each PR's current commit.
10. Merge a valid current-version fixture record in `cla-test` and test its
    accepted-record refresh workflow before the R5 rollout. Fixture grants do
    not enter the real ledger. The test repository temporarily uses the same
    refresh implementation with test-only configuration.
11. After the pilot, disable `cla-test` in `cla/projects.json` and remove the
    App's access to that repository. Keep R5 enrolled and installed.

The central refresh workflow runs after signature or agreement changes merge
to `main`. It paginates through open PRs in each enabled project and requests
fresh evaluations. Per-PR concurrency prevents overlapping evaluations from
winning out of order. If a refresh fails, its run reports the failure; consumers
retain their normal CLA enforcement. Retry the refresh or dispatch a specific
consumer PR manually.

Until the Client ID variable exists, the central refresh job is explicitly
skipped. This does not make missing contributors pass. If a private key is
rotated, update the Actions secret and rerun the dry-run test.

GitHub documents [App installation tokens in Actions](https://github.com/actions/create-github-app-token)
and the [Actions write permission needed for dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

To manually refresh an R5 PR:

```sh
gh workflow run cla.yml --repo conveyal/r5 --ref dev -f pr_number=123
```

Replace `123` with the actual open PR number. This runs trusted workflow code
on `dev`, resolves that PR through the API, and publishes **Conveyal CLA** on
its current head SHA.
