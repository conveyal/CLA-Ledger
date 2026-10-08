# Test the GitHub signing editor

This prototype checks whether a GitHub new-file URL can carry a complete
individual signature record through review, commit, and PR creation. It uses
[conveyal/cla-test](https://github.com/conveyal/cla-test), a disposable repository.
Its canonical file includes an explicit test-only notice. Test records are not
accepted signatures in the public Conveyal ledger.

## Current state

- The agreement is `v0.1`. The planned first tooling release is `v0.0.1`.
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

## Subsequent work

Personalized contributor comments, the shared PR-head CLA check, and fresh
dispatch support are implemented. Configure the Conveyal-owned refresh App and accepted-record workflow,
exercise automatic rechecking, publish tooling release `v0.0.1`, and use that
release in the R5 pilot. R5's default branch is `dev`.

The refresh App will need Actions write and Pull requests read on R5. Its
private key belongs in CLA-Ledger's Actions secrets; the R5 workflow will use
its own built-in token to publish comments and checks. Maintainer review
remains the acceptance step for real signature PRs. See [SETUP_PROJECT.md](SETUP_PROJECT.md)
for the exact App variables, secret, permissions, and rollout steps.
