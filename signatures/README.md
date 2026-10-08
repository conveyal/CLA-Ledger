# Signature record templates

The central ledger stores append-only records under `signatures/<version>/`.
Generate an individual record with:

```sh
node sign.ts <github-login> --id <numeric-id> --individual
```

Run `node sign.ts` without arguments to answer the same questions interactively.

The current provisional agreement is `v0.1`. The `--editor-url` option prepares
an individual signing link without writing a file. Opted-in contribution
workflows also include these links beside uncovered authors. Review the full
record in the GitHub editor, commit on a new branch, and open the signature PR
using the named account. See the [browser evidence](../EDITOR_PROTOTYPE.md).

Generate a corporate authorization with `--corporate --organization <slug>`
and one or more `--authorized-id` values. Include the complete set of accounts
to authorize, including accounts retained from the previous snapshot. Open the
pull request against `conveyal/CLA-Ledger` from the authenticated representative
account. A maintainer merge is acceptance.

Individual records use `signatures/<version>/individual/<id>.md`. Signing a new
CLA version creates a new file and preserves the previous record. The helper
refuses to replace an existing individual record.

Corporate records use `signatures/<version>/corporate/<slug>/0001.md`, followed
by `0002.md` and subsequent snapshots. The helper selects the next number from
your local checkout. Update your checkout before signing; if another snapshot
merges first, regenerate yours with the next number. Only one new snapshot per
organization and version may be submitted in a PR. Snapshot numbers are padded
to at least four digits.

The newest accepted corporate snapshot determines coverage for future
contributions under that CLA version. Earlier snapshots remain as evidence;
removing an account from a later snapshot does not undo an earlier grant or
remove coverage supplied by an individual or another organization.

Accepted records cannot be modified, deleted, or renamed. There is no
`--force` option. The path version and record version must match
`versions/CURRENT` when the signature is validated.

Only GitHub login/ID metadata, organization slug, version, and date belong in
public records. Do not add legal names, email addresses, mailing addresses, or
private employer documents.
