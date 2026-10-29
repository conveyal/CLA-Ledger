# Conveyal CLA FAQ

### Why is a CLA required?

It gives EBP US Inc. permission to use, modify, distribute, and sublicense
contributions to covered projects. Contributors retain ownership and may reuse
their work. See [CLA section 7](CLA.md#7-scope-and-versions) for which
projects are covered.

### Who signs?

Every human author of a new pull request must be covered. One signature per CLA
version covers every covered project; see [CLA section 7](CLA.md#7-scope-and-versions).
A corporate representative may authorize a set of GitHub account IDs through a
corporate record.

### How do I sign?

If your contribution's CLA comment has a **Sign the CLA** link beside your
account, open it, review the complete record in GitHub's editor, commit on a
new branch, and open the signature PR using that account. A maintainer must
merge it before the contribution has coverage. Corporate records use the CLI.

Clone `conveyal/CLA-Ledger` and run
`node sign.ts <your-login> --id <numeric-id> --individual`.
You may also run `node sign.ts` with no arguments; the helper prompts for
missing values. Review the generated
`signatures/<version>/individual/<id>.md`, commit it, and open a pull request
against `conveyal/CLA-Ledger` from that account. An authorized Conveyal maintainer
reviews and merges the record on behalf of EBP US Inc.

Corporate representatives use `--corporate --organization <slug>` and repeat
`--authorized-id` for each covered account. Each update adds a numbered
snapshot containing the complete set of authorized accounts. It preserves all
previous snapshots; the newest accepted one determines corporate coverage for
future contributions under that version.

### What if I use an employer's code?

Sign only after confirming that you or the corporate representative is
authorized to grant the rights. The public record does not collect employer
documents.

### What about bots?

GitHub accounts whose API type is `Bot` are exempt because they cannot execute a
legal signature. Human authors remain responsible for their work.

### What if the CLA changes?

The current version is shown in `versions/CURRENT`. See
[CLA section 7](CLA.md#7-scope-and-versions) for how a new version affects past and future contributions.

### Is this final legal text?

Yes. CLA `v1.0` is complete. Future material changes require a new version.
