# Publish a CLA Ledger tooling release

A tooling release versions the reusable workflows, validation scripts, and
signing helper. Consumer repositories reference its exact tag, such as
`v1.0.0`, in their caller workflows. GitHub Releases provide release notes and
protect published tags when release immutability is enabled.

This guide uses `v1.0.0` as an example. Substitute the new version throughout
the commands. Publishing a release requires write access to
`conveyal/CLA-Ledger` and an authenticated GitHub CLI.

## Version policy

Use `vMAJOR.MINOR.PATCH` for tooling releases:

| Change | Example |
| --- | --- |
| Backward-compatible bug fix | `v1.0.0` → `v1.0.1` |
| Backward-compatible feature or optional workflow input | `v1.0.0` → `v1.1.0` |
| Breaking workflow, signing, or record-format change | `v1.0.0` → `v2.0.0` |

Agreement versions follow [GOVERNANCE.md](GOVERNANCE.md) and
`versions/CURRENT`. A tooling release does not itself change the agreement
version or require contributors to sign again. A material agreement change
requires a new agreement version and new records for future contributions.

Use exact release tags in consumers. A moving tag such as `v1` permits automatic
implementation changes, so this guide uses explicit version upgrades.

## 1. Enable immutable releases

In `conveyal/CLA-Ledger`, open **Settings → General**.
Under **Releases**, select **Enable release immutability** before publishing.
This setting requires repository administration access and applies to future releases.

After publication, GitHub locks the release tag to its commit and protects its
assets. Ordinary tags do not provide this protection by themselves.
See GitHub's [release protection instructions](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)
and [immutable release documentation](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

## 2. Prepare the implementation

Start from a clean ledger checkout with the reviewed changes already merged
and pushed to `main`. Update the checkout:

```sh
git switch main
git pull --ff-only origin main
```

Run the implementation checks with the pnpm version and Node.js 24 runtime declared in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Review changes to the reusable workflow inputs, signature validation,
coverage rules, and signing helper. Review dependency action refs against the
consumer repositories' Actions policies. Verify that the setup guide matches
the implementation you will release.

Record breaking changes and migration instructions in [CHANGELOG.md](CHANGELOG.md).
Commit and push any release documentation changes before creating the tag.

## 3. Create a draft release

Create and push an annotated tag for the reviewed local commit:

```sh
git tag -a v1.0.0 -m "CLA Ledger v1.0.0"
git push origin v1.0.0
```

Create a draft release from that existing tag:

```sh
gh release create v1.0.0 \
  --repo conveyal/CLA-Ledger \
  --verify-tag \
  --title "CLA Ledger v1.0.0" \
  --generate-notes \
  --draft
```

The `--verify-tag` flag requires the published tag to exist. It prevents the
release command from selecting another commit through automatic tag creation.
See the [GitHub CLI reference](https://cli.github.com/manual/gh_release_create).

Review the draft notes on GitHub. Describe workflow compatibility, behavior
changes, and migration steps. These workflows run directly from repository
files at the tag, so the release needs no compiled asset.

## 4. Publish and verify

Verify that the draft references the reviewed tag. Then publish it:

```sh
gh release edit v1.0.0 \
  --repo conveyal/CLA-Ledger \
  --draft=false
```

The publishing command is documented in the
[GitHub CLI reference](https://cli.github.com/manual/gh_release_edit).
Verify that the published release page shows **Immutable**.
For corrections, publish a new version rather than moving an existing release tag.

## 5. Upgrade consumer repositories

Update both references in each consumer's caller workflow to the new tag:

```yaml
uses: conveyal/CLA-Ledger/.github/workflows/check-contributors.yml@v1.0.0
with:
  implementation_ref: v1.0.0
  ledger_data_ref: main
```

This excerpt shows the fields to update. Preserve the caller's other inputs,
permissions, and PR trigger. Use [SETUP_PROJECT.md](SETUP_PROJECT.md) for the
complete R5 workflow and rollout checks.

Ledger data continues to follow `main`. Newly accepted signatures supply
coverage without a tooling release. Consumer implementation upgrades remain
explicit, reviewed changes to the release tag references.
