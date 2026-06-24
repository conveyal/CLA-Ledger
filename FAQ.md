# CLA — Frequently Asked Questions

Plain-English answers about signing a Cloud Security Alliance (CSA)
Contributor License Agreement. The agreement itself is the authoritative
document; this FAQ is a friendly summary.

### What is a CLA, and why does CSA require one?

A Contributor License Agreement records the rights you grant CSA when you
contribute. CSA publishes frameworks (like the Cloud Controls Matrix and AI
Controls Matrix) and licenses them — including commercially. To include your
contribution in that work, CSA needs clear, written permission. The CLA
provides it, and protects both you and CSA by making the terms explicit.

### Do I give up ownership of my contribution?

No — **you keep full ownership.** CSA takes a **license** (permission to use your
contribution), **not an assignment**: we deliberately do *not* take ownership of
your work. You remain free to use, publish, or relicense your own contribution
however you like, elsewhere. The license you grant CSA is broad — so CSA can
steward and evolve the catalog — but it takes nothing away from your own rights
to your work.

### What am I actually granting?

A broad, irrevocable license that lets CSA reproduce, modify, publish,
distribute, and **sublicense** your contribution — including using it in CSA's
commercial offerings. You also confirm the work is yours to give (or that you
have permission) and that you're not knowingly submitting someone else's
restricted material.

### Why does CSA get such broad rights when the published catalog is restricted?

Two different relationships are at play. When you **contribute**, you grant CSA
broad rights so CSA can *steward and evolve* the catalog over time — correct it,
reorganize it, translate it, republish it in new formats, build tooling on it,
and offer it in future editions — without returning to every contributor for
permission each time. When someone **consumes** the published catalog, they get
only the narrower rights in the catalog's own license (download, view, quote; no
modification or redistribution). So contributors enable CSA's stewardship;
recipients receive a controlled product.

Because the grant runs **to CSA** (and the published license stops others from
redistributing or modifying the catalog), this breadth is about CSA's own and
CSA-authorized uses — across documents, databases, software tooling, analytical
products, and AI/automation systems CSA builds on the catalog — not a license
for third parties to reuse your work.

On AI specifically: the agreement is deliberately **technology-neutral** rather
than listing AI or any other technology by name (today it's AI; tomorrow it's
something else). Whether CSA ever opens the *published* catalog more widely — for
AI training or other reuse by others — is a separate, future decision made
through the catalog's own license, not this agreement. The broad grant simply
keeps that option open for CSA.

### What are the patent and moral-rights clauses for?

The **patent** clause is standard CLA protection: if a contribution ever
includes patentable software or tooling, CSA and users of the catalog can rely
on it without a separate patent claim — and that protection is withdrawn from
anyone who brings a patent suit over it. The **moral-rights** clause lets CSA
edit, reorganize, and republish the catalog without attribution or integrity
disputes; where local law doesn't permit waiving such rights, you instead
consent to those uses. Neither clause affects your ownership of your
contribution.

### How do I sign?

You sign in GitHub, by opening a pull request that adds a small **signature
file** to the project's directory in the CSA CLA-Ledger:

1. Fork [`CloudSecurityAlliance/CLA-Ledger`](https://github.com/CloudSecurityAlliance/CLA-Ledger).
2. Look up your **numeric GitHub account ID** (the folder's README shows a
   one-line command) and add `security-controls-catalog/signatures/<your-id>.md`.
   Into that file you paste the **full text of the CLA** plus a short signature
   block — your GitHub login, numeric ID, the CLA version, and the date —
   following the template in that folder's README.
3. Open the pull request **from the account whose ID you used as the filename**.
   A check confirms the filename and the login/ID in the file match the account
   opening the PR, and that the CLA text you pasted matches the published
   version. CSA then accepts your signature by merging it.

After that, when you open a contribution pull request on that project, an
automated check confirms you've signed for it — no further action, unless the
CLA later *materially changes* and the project requires the new version, in
which case you re-sign that version once to keep contributing.

### Do I have to sign for every contribution? Every project?

**Once per project, not once per contribution.** Signing a project's CLA covers
all your future contributions to *that* project, so you won't be asked again for
it (as long as the agreement hasn't materially changed). If you later contribute
to a *different* CSA project, you sign that project's CLA once as well — each
signature is an explicit agreement to contribute to that specific project. (If
an agreement is ever materially revised, you'll be asked to sign the new version
for new contributions; your past contributions stay under the version you
signed.)

### What if I'm contributing for my employer?

If your employer owns the work you create, make sure you have your employer's
authorization before you sign and contribute. By signing, you confirm you are
entitled to grant these rights (see the CLA's representations). If you're not
sure, check with your employer first, or contact info@cloudsecurityalliance.org.

### What if my contribution came out of a group discussion, or someone helped?

That's normal, and usually **only the person who writes and submits it signs**.
Copyright covers the written expression, not the ideas or discussion behind it —
so people who only contributed ideas aren't co-authors and don't sign. The
person recorded as the commit's author signs, and by signing represents they
have the right to submit the whole thing. If several people genuinely co-wrote
the *text*, each signs (or you flag the part that isn't yours, per the CLA).
Only use `Co-authored-by:` for real co-authors who have also signed.

### Can I use AI assistance?

Yes. You remain responsible for the promises you make when you sign — in
particular, that the contribution is your original creation and that you have
the right to submit it. Don't submit anything you can't stand behind on those
terms.

### What information do you collect about me?

Your GitHub **username and numeric account ID**, a link to your signing
action, and the date. We record the numeric ID on purpose: usernames can be
changed, so the numeric ID is the stable identity of record. Your username and
your participation are already public once you contribute to a public repo; the
numeric ID is GitHub-assigned metadata visible via GitHub's API. We don't
collect your legal name, email, or employer. The record is published in the
public CLA-Ledger — see the [Privacy Notice](PRIVACY.md).

### What if I don't want to sign?

That's your choice — but CSA can't accept your contribution without it. We'll
thank you and close the pull request; you're welcome to participate in
discussion and issues regardless.

### Can I take it back later?

The license you grant is irrevocable, and the signature record is kept as
evidence of that grant. Deleting or renaming your GitHub account doesn't affect
it — the record is tied to your numeric account ID.

### Why Nevada law?

CSA is incorporated in Nevada, so the agreement uses CSA's home jurisdiction —
standard practice for an organization's contracts. It doesn't change your
ownership of, or your right to use, your own work.

### Where's the full agreement?

[`security-controls-catalog/CLA.md`](security-controls-catalog/CLA.md).
