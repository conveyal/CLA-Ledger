# Conveyal CLA FAQ

### Why is a CLA required?

It gives Conveyal LLC permission to use, modify, distribute, and sublicense
contributions while contributors retain ownership and may reuse their work.

### Who signs?

Every human author of a new pull request must be covered. Individuals sign once
for the organization-wide program. A corporate representative may authorize a
set of GitHub account IDs through a corporate record.

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
against `conveyal/CLA-Ledger` from that account. A maintainer reviews and merges
the record.

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

The current version is shown in `versions/CURRENT`. A material revision is
published as a new immutable version and requires re-signing for future work;
past contributions remain under the version accepted at the time.

### Is this final legal text?

No. The initial agreement is a clearly marked provisional implementation draft
pending counsel review.
