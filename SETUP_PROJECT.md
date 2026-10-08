# Configure the Conveyal CLA check in R5

This guide connects `conveyal/r5` to the central `conveyal/CLA-Ledger`.
R5 calls a reusable GitHub Actions workflow that checks every human commit
author against the current CLA version. Contributors sign in the central ledger.

R5 needs one caller workflow and a link to the signing instructions. The
reusable workflow supplies Node.js and reads the central records. R5 does not
need an npm package, a signing helper, or a local copy of the signature records.

## 1. Prepare the central ledger

1. Publish an immutable tooling release in `conveyal/CLA-Ledger` using [RELEASING.md](RELEASING.md).
2. Verify that the public `main` branch contains `cla/config.json`, `versions/CURRENT`, and the corresponding agreement file.
3. Verify that `.github/workflows/cla.yml` runs and accepts a valid signature PR through maintainer review.
4. Review the [provisional agreement](CLA.md) and [version policy](GOVERNANCE.md) before selecting the version to enforce.
5. Merge current-version records for the maintainers who will exercise the R5 check.

Individual and corporate records both supply coverage. An open signature PR
supplies no coverage until a maintainer merges it. See the
[signature instructions](signatures/README.md) for record generation and corporate updates.

Select a published release from the ledger's
[Releases page](https://github.com/conveyal/CLA-Ledger/releases).
Review its release notes and verify that GitHub marks it **Immutable**.
Use the exact release tag, such as `v1.0.0`, for both the workflow reference
and `implementation_ref`. A floating tag such as `v1` can change between runs.

Tooling releases and agreement versions are independent. A tooling release
does not change `versions/CURRENT` or require contributors to sign again.
GitHub documents release tag references in its
[reusable workflow guide](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#calling-a-reusable-workflow).

## 2. Add or update the R5 caller

Create or replace `.github/workflows/cla.yml` in R5 with this content.
The example uses `v1.0.0`; substitute your selected published version in both places.
The example version must exist as an immutable release before this caller can run.
An existing caller that references `main` needs both references updated.

```yaml
name: CLA

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  check:
    name: Check contributor coverage
    uses: conveyal/CLA-Ledger/.github/workflows/check-contributors.yml@v1.0.0
    with:
      ledger_repository: conveyal/CLA-Ledger
      ledger_data_ref: main
      implementation_repository: conveyal/CLA-Ledger
      implementation_ref: v1.0.0
      signing_url: https://github.com/conveyal/CLA-Ledger/blob/main/CLA.md
    permissions:
      contents: read
      pull-requests: write
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
- `actions/setup-node` at the ref used by the selected implementation

The caller requests `contents: read` and `pull-requests: write` through the
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
Rerun the R5 job while the PR head and base remain unchanged.
Verify that the job now passes using the newly merged record.
If either revision changed, update the PR branch to trigger a fresh event.

Inspect the run's checkout steps. Verify that the implementation uses the
selected release tag and that ledger data comes from `conveyal/CLA-Ledger` at `main`.

## 5. Make the check required

1. Open the branch protection rule or ruleset for each protected R5 target branch.
2. Require status checks before merging.
3. Select the actual coverage check emitted by the test PR, with GitHub Actions as its source where available.
4. Keep the caller and reusable job names stable after selecting the required check.
5. Verify that an uncovered contributor's PR cannot merge without an authorized bypass.

The caller and reusable job both use the name `Check contributor coverage`.
GitHub can display a combined name for a reusable job. Select the observed
check instead of guessing its full label.
GitHub explains enforcement in its
[protected branch documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

The current check requires a pull request event payload. It does not handle
`merge_group` events. A merge queue needs a separate compatible implementation
before it can require this check on queued merge groups.

## Maintenance and troubleshooting

| Situation | Action |
| --- | --- |
| A contributor just signed | Merge the central record, then rerun the unchanged R5 PR job. |
| The CLA version changes | Ask contributors to add records for `versions/CURRENT`; retain all earlier records. |
| A new tooling release is available | Review its release notes, update both release tag references together, and exercise the check again. |
| The reusable workflow cannot resolve | Verify that the release tag exists in the published ledger and that Actions policies permit the workflow and its actions. |
| A PR comment fails with a permission error | Verify the caller's `pull-requests: write` permission and applicable organization policies. |
| A commit author is unmapped | Ask the author to associate the commit email with their GitHub account, then trigger a fresh run. |
| The head or base changed during validation | Update the PR branch to trigger a fresh workflow event; an old event retains its earlier revisions. |
| A PR exceeds 250 commits or 3,000 files | Split it into smaller PRs; the GitHub list limits prevent complete verification. |
| The ledger or API is unavailable | Use only the designated maintainer bypass procedure in [GOVERNANCE.md](GOVERNANCE.md). |

The check fails closed when it cannot establish coverage. The
[reusable workflow](.github/workflows/check-contributors.yml) and
[coverage script](.github/scripts/check_cla.ts) define the current behavior.

For another Conveyal project, use the same caller in that repository.
Keep the central ledger and signing URL, and configure its own protected branches.
The central ledger needs no per-project enrollment entry.
