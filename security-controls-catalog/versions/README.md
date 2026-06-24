# Archived CLA versions — immutable

This directory holds a **frozen, immutable copy of every version of the CLA**
that has ever been in force for the **Security Controls Catalog**.

## Why this exists

A signature is assent to the **specific text** in force when it was made, and
the **grant terms are fixed at the moment of signing**. To honor that, the
exact text each contributor agreed to must be preserved so it can be cited
without reconstructing it from version-control history.

## Naming

```
CLA-v<MAJOR>.<MINOR>.md      e.g. CLA-v1.0.md
```

## The `CURRENT` marker

`CURRENT` is a one-line file naming the version contributors should sign **now**
(e.g. `v1.0`). The `sign.py` helper reads it so it defaults to the version the
project actually *requires*, not merely the newest one frozen. Keep it **in sync
with each project's `REQUIRED_CLA_VERSION`** (in that project's
`.github/workflows/cla.yml`): when a new version is approved and frozen, update
`CURRENT` and the projects' `REQUIRED_CLA_VERSION` in the same change.

## Rules

1. **Files here are never edited or deleted once a version is in force** —
   i.e., once any signature references it — at which point it stays byte-for-byte
   forever. (Before the first signature references a version, see *Current
   status* for the one correction exception.)
2. A new version file is created only when a CLA version is **approved through
   CSA's review and approval process**. The working text lives one level up
   (`../CLA.md`); on approval it is copied here and frozen.
3. The signature files in `../signatures/` reference the version signed.
   Prior signatures remain bound to the version they signed; they are not
   migrated when a new version is approved.
4. A **material** change to a CLA (grant, representations, execution terms, or
   governing-law/venue) produces a new version and requires new assent for new
   contributions. Non-material changes (clarifications, formatting) do not. The
   full material-vs-non-material taxonomy is defined in the repo-root
   `GOVERNANCE.md`.

## Current status

`CLA-v1.0.md` is the frozen, canonical text of v1.0; the signature validator
checks each contributor's pasted CLA text against it. A frozen version becomes
permanent once a signature references it (per Rule 1); before then — while no
signature references it — it may still be corrected if an error is found.
