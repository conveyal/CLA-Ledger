# Signature record templates

The central ledger stores append-only records under `signatures/<version>/`.
[CLA section 7](../CLA.md#7-scope-and-versions) defines what an accepted record
covers.

Generate an individual record with:

```sh
node sign.ts <github-login> --id <numeric-id>
```

Run `node sign.ts` without arguments to answer the same questions interactively.

The current agreement is `v1.0`. The `--editor-url` option prepares
a signing link without writing a file. Opted-in contribution
workflows also include these links beside uncovered authors. Review the full
record in the GitHub editor, commit on a new branch, and open the signature PR
using the named account. See the [browser evidence](../EDITOR_PROTOTYPE.md).

Records use `signatures/<version>/individual/<id>.md`. Signing a new CLA
version creates a new file and preserves the previous record. The helper
refuses to replace an existing record. A maintainer merge is acceptance.

Accepted records cannot be modified, deleted, or renamed. There is no
`--force` option. The path version and record version must match
`versions/CURRENT` when the signature is validated.

Only GitHub login/ID metadata, version, and date belong in public records. Do not add legal names, email addresses, mailing addresses, or
private employer documents.
