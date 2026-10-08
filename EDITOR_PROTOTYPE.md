# Test the GitHub signing editor

This prototype checks whether a GitHub new-file URL can carry a complete
individual signature record through review, commit, and PR creation. It uses
[conveyal/cla-test](https://github.com/conveyal/cla-test), a disposable repository.
Its canonical file includes an explicit test-only notice. Test records are not
accepted signatures in the public Conveyal ledger.

## Current state

- The agreement is `v0.1`. Tooling release
  [v0.0.1](https://github.com/conveyal/CLA-Ledger/releases/tag/v0.0.1)
  is published and immutable. The fixture workflows now use that release.
- `sign.ts --editor-url` generates a URL without creating a local record.
- Offline tests check the decoded URL contents against the canonical record
  and the production signature validator.
- GitHub accepts the full URL and redirects a signed-out visitor to login.
- Authenticated editor prefill, commit, and PR creation passed for
  `@trevorgerhardt` in [test PR #1](https://github.com/conveyal/cla-test/pull/1).
  The PR is byte-for-byte identical to the generated fixture (4,618 bytes), and
  the production signature validator passed.
- The account has repository write access. Outsider forking remains unverified.
- Contributor workflows can opt into personalized individual editor links.
- [Test contribution PR #2](https://github.com/conveyal/cla-test/pull/2)
  initially failed coverage while the signature was unmerged. Its bot comment
  supplies a personalized link containing the exact complete fixture, and its
  `Conveyal CLA` check is attached to the contribution's head commit.
- Fresh workflow dispatch also publishes checks on each PR's head commit:
  the signature-only PR passes, and the unsigned contribution fails. The
  dispatcher dry run identifies both open PRs from the trusted project list.
- Maintainer acceptance and automatic refresh passed on 2026-10-08. Merging
  PR #1 triggered the [fixture refresh](https://github.com/conveyal/cla-test/actions/runs/37749209081),
  which dispatched a [fresh successful evaluation](https://github.com/conveyal/cla-test/actions/runs/37749232478)
  of PR #2 on its unchanged head `8d5006670680eff45cef736d28b06584c68f552f`.
  The existing bot comment was updated to report coverage; no duplicate
  signing comment was created.

The compact test fixture produces a 5,212-character URL and reaches GitHub's
login page successfully. A longer test-only introduction produced a
5,528-character URL whose login redirect returned HTTP 500. Both included the
entire agreement; shortening only the test notice fixed that observed failure.
This is evidence of a URL-size constraint in this flow, not a documented
universal limit. Future agreement changes must repeat the browser test.

GitHub documents its automatic fork-and-propose workflow in
[Creating new files](https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files).
The `filename` and `value` URL parameters are experimental here; passing the
browser test is required before relying on them for contributor onboarding.

## Generate a link

From a checkout with the desired ledger configuration and canonical text:

```sh
node /path/to/CLA-Ledger/sign.ts trevorgerhardt --id 776780 --individual --editor-url
```

The current directory supplies `cla/config.json` and `versions/`. In the test
repository, these point to the disposable fixture. In the real ledger, they
point to the real agreement. Never generate a real signing link for a test.

The CLI supports individual records only for this option. It refuses a link
when the selected version already has a record for that ID. Opening the URL
does not create a branch, commit, or PR; the contributor performs those actions.

## Browser acceptance test

1. Sign in as the account named in the test repository's link.
2. Open its **Open the prefilled test file** link.
3. Verify the filename is `signatures/v0.1/individual/<account-id>.md`.
4. Verify the editor includes the test-only notice, the entire agreement, and
   the signature block. The test fixture also contains Unicode and literal
   `+`, `&`, `#`, and `%` characters to detect encoding problems.
5. Select **Commit changes**, choose a new branch, and open a pull request.
   Accounts with write access must choose a new branch instead of committing
   directly to `main`.
6. Verify the diff adds only the signature file and the signature validator passes.
7. Leave the PR open for automated comparison against the expected fixture.

Repeat from a signed-out browser to check that login preserves the URL. Before
the production pilot, repeat with an account without repository write access,
including one that already owns a fork. A maintainer account can establish
prefill and signer identity but cannot establish outsider permission behavior.

If the editor is empty, the content is truncated, or GitHub rejects the URL,
stop and revisit the signing experience. Keep the existing CLI instructions.
Do not introduce a hosted signing application without a separate decision.

## Coverage and refresh acceptance test

The test repository uses the reusable coverage implementation and the same
refresh dispatcher as the public ledger. Since it refreshes only itself, its
temporary refresh workflow can use the repository's built-in token. This
tests dispatch behavior without creating an App or accepting a real signature.
Cross-repository refresh still requires the App described in the setup guide.

1. Leave test contribution PR #2 open and confirm `Conveyal CLA` fails with
   a signing link for `@trevorgerhardt`.
2. Review and merge test signature PR #1. Its generated contents and signature
   validation have already passed; maintainer review remains the acceptance step.
3. Confirm the signature merge triggers the refresh workflow, which requests a
   fresh evaluation of PR #2 without another contribution commit.
4. Confirm `Conveyal CLA` passes on the same PR #2 head commit and the existing
   bot comment changes to report accepted coverage.

Do not merge the contribution PR before verifying this transition. The test
signature's explicit test-only notice keeps this exercise out of the public ledger.

## Subsequent work

Personalized contributor comments, the shared PR-head CLA check, and fresh
dispatch support passed the disposable acceptance test. Configure the
Conveyal-owned refresh App, repeat signing with an account without write access,
and use tooling release `v0.0.1` in the R5 pilot. R5's default branch is `dev`.

The refresh App will need Actions write and Pull requests read on R5. Its
private key belongs in CLA-Ledger's Actions secrets; the R5 workflow will use
its own built-in token to publish comments and checks. Maintainer review
remains the acceptance step for real signature PRs. See [SETUP_PROJECT.md](SETUP_PROJECT.md)
for the exact App variables, secret, permissions, and rollout steps.

The central App dry run passed on 2026-10-08: it minted a token scoped to
`cla-test`, read its open PRs, and selected PR #2 for refresh. See the
[App dry-run result](https://github.com/conveyal/CLA-Ledger/actions/runs/37752329769).
The [actual central refresh](https://github.com/conveyal/CLA-Ledger/actions/runs/37752444836)
also passed and dispatched a [successful v0.0.1 consumer evaluation](https://github.com/conveyal/cla-test/actions/runs/37752472944).
The PR-head `Conveyal CLA` check and the existing coverage comment remained
successful without changing the contribution commit.
R5's release-pinned integration is prepared in
[PR #1020](https://github.com/conveyal/r5/pull/1020), and its existing Java CI
and CodeQL checks passed. The PR is ready for review; the `dev` branch requires
one approving review. R5 enrollment remains disabled until the caller
is deployed on `dev` and App access is verified. The fork-and-sign browser
test is deferred until a suitable external account is available; retain the
manual signing path and complete the test before making the R5 check required.
