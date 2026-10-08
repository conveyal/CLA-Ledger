#!/usr/bin/env node
/**
 * Validate new signature records against the trusted base checkout and authenticated PR author.
 * Read proposed content through GitHub's API without executing code from the PR.
 * Require canonical agreement text, current versions, matching identities, and append-only paths.
 * Check Git tree modes separately because the Contents API can follow symlinks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  api, claRoot, canonical, currentVersion, loadConfig, validDate,
  pullRequest, assertPullRequestTarget, completePullRequestList, assertPullRequestUnchanged,
  nextCorporateSnapshot,
  isObject, errorMessage, type FileChange,
} from "./cla.ts";

/** Read a required workflow input; missing authentication or revision data prevents validation. */
function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// Read these inputs on demand so imported helpers do not require a workflow environment.
const repo = () => env("REPO");
const pr = () => env("PR");

/** Git tree metadata needed to establish a record's file type and content identity. */
interface TreeEntry {
  path: string;
  type: string;
  mode: string;
  sha: string;
}

/** Validate API entry fields before using them to verify proposed record files. */
function isTreeEntry(value: unknown): value is TreeEntry {
  return isObject(value) && typeof value.path === "string" && typeof value.type === "string"
    && typeof value.mode === "string" && typeof value.sha === "string";
}

/** Fetch the pinned PR head's complete Git tree; reject truncation or malformed entries. */
async function headTree(repository: string, sha: string): Promise<Map<string, TreeEntry>> {
  const data = await api(`/repos/${repository}/git/trees/${encodeURIComponent(sha)}?recursive=1`);
  if (!isObject(data) || !Array.isArray(data.tree) || data.truncated !== false) {
    throw new Error("GitHub returned an incomplete head tree; record file types cannot be verified");
  }
  const entries: unknown[] = data.tree;
  if (!entries.every(isTreeEntry)) throw new Error("GitHub returned invalid head tree entries");
  return new Map(entries.map((entry) => [entry.path, entry]));
}

/**
 * Read a regular file at the pinned head revision and verify its blob SHA against the tree.
 * Reject symlinks and inconsistent API content before inspecting any signature text.
 */
async function headFile(repository: string, sha: string, filePath: string, tree: Map<string, TreeEntry>) {
  const entry = tree.get(filePath);
  if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
    throw new Error(`${filePath}: record must be a regular file, not a symlink`);
  }
  const data = await api(`/repos/${repository}/contents/${filePath}?ref=${encodeURIComponent(sha)}`);
  if (!isObject(data) || typeof data.content !== "string" || data.encoding !== "base64" || data.sha !== entry.sha) {
    throw new Error(`GitHub returned inconsistent content for ${filePath}`);
  }
  return Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
}

/** Extract a declared CLA version; callers must also compare it with the path and current version. */
function versionFromText(text: string) {
  return text.match(/^- CLA version:\s*(v\d+\.\d+)\s*$/m)?.[1] || null;
}

/**
 * Return null for canonical text and an individual block matching the authenticated PR author, or an error message.
 * An omitted expectedLink permits any single URL; production validation always supplies the configured agreement link.
 */
function individualError(text: string, agreement: string, version: string, author: string, authorId: string, expectedLink = "") {
  if (!text.startsWith(agreement)) return "record must begin with the complete canonical CLA text";
  const rest = text.slice(agreement.length);
  const pattern = new RegExp(
    String.raw`^\s*---\s*## Signature\s+` +
    String.raw`I,\s+@${escapeRegex(author)}\s+\(GitHub account ID:\s+${escapeRegex(authorId)}\),\s+agree to and sign the\s+` +
    String.raw`\[Conveyal Contributor License Agreement, version ${escapeRegex(version.replace(/^v/, ""))}\]\(${expectedLink ? escapeRegex(expectedLink) : "[^\\s)]+"}\)\s+` +
    String.raw`— reproduced in full above — for Conveyal's organization-wide open-source projects\.\s+` +
    String.raw`- GitHub login:\s+${escapeRegex(author)}\s+` +
    String.raw`- GitHub account ID:\s+${escapeRegex(authorId)}\s+` +
    String.raw`- CLA version:\s+${escapeRegex(version)}\s+` +
    String.raw`- Signature type:\s+individual\s+` +
    String.raw`- Date:\s+(\d{4}-\d{2}-\d{2})\s*$`,
  );
  const match = pattern.exec(rest);
  if (!match) return "individual signature block does not exactly match the template";
  return validDate(match[1]) ? null : "signing date is invalid or in the future";
}

/**
 * Return null for a corporate block matching the PR author, organization path, and canonical text, or an error message.
 * Authorized IDs must be unique, numerically sorted, and include the representative.
 * Production callers supply expectedLink; an omitted value permits any single URL.
 */
function corporateError(text: string, agreement: string, version: string, author: string, authorId: string, expectedOrganization: string, expectedLink = "") {
  if (!text.startsWith(agreement)) return "record must begin with the complete canonical CLA text";
  const rest = text.slice(agreement.length);
  const pattern = new RegExp(
    String.raw`^\s*---\s*## Corporate Authorization\s+` +
    String.raw`I,\s+@${escapeRegex(author)}\s+\(GitHub account ID:\s+${escapeRegex(authorId)}\),\s+confirm that I am authorized\s+` +
    String.raw`to accept the \[Conveyal Contributor License Agreement, version ${escapeRegex(version.replace(/^v/, ""))}\]\(${expectedLink ? escapeRegex(expectedLink) : "[^\\s)]+"}\)\s+` +
    "on behalf of the organization `([^`]+)` for the authorized GitHub\\s+accounts listed below, for Conveyal's organization-wide open-source projects\\.\\s+" +
    String.raw`- Organization:\s+([^\s]+)\s+` +
    String.raw`- Representative GitHub login:\s+${escapeRegex(author)}\s+` +
    String.raw`- Representative GitHub account ID:\s+${escapeRegex(authorId)}\s+` +
    String.raw`- Authorized GitHub account IDs:\s+([0-9, ]+)\s+` +
    String.raw`- CLA version:\s+${escapeRegex(version)}\s+` +
    String.raw`- Signature type:\s+corporate\s+` +
    String.raw`- Date:\s+(\d{4}-\d{2}-\d{2})\s*$`,
  );
  const match = pattern.exec(rest);
  if (!match || match[1] !== match[2] || match[1] !== expectedOrganization) {
    return "corporate authorization block does not exactly match the template";
  }
  const ids = match[3].split(",").map((item) => item.trim());
  const sorted = [...new Set(ids)].sort(compareNumeric);
  if (ids.some((id) => !/^\d+$/.test(id)) || ids.length === 0
    || ids.join(", ") !== sorted.join(", ") || !ids.includes(authorId)) {
    return "corporate authorized IDs must be unique, numeric, sorted, and include the representative";
  }
  return validDate(match[4]) ? null : "signing date is invalid or in the future";
}

/** Treat identities, repository paths, and agreement links as literal text in template patterns. */
function escapeRegex(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compare decimal ID strings without losing precision through JavaScript number conversion. */
function compareNumeric(left: string, right: string) {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Return 0 when no records change or all proposed records pass; return 1 for record validation errors.
 * API or checkout failures throw, so the CLI cannot report success without complete evidence.
 */
async function main() {
  const root = claRoot();
  const repoPrefix = root === "." ? "" : `${root}/`;
  const signaturePrefix = `${repoPrefix}signatures/`;
  // The workflow supplies the PR opener's identity; record text cannot establish who submitted it.
  const author = env("AUTHOR");
  const authorId = env("AUTHOR_ID");
  const headRepository = env("HEAD_REPO");
  const headSha = env("HEAD_SHA");
  const snapshot = await pullRequest(repo(), pr());
  assertPullRequestTarget(snapshot);
  const changed = await completePullRequestList(repo(), pr(), snapshot, "files");
  // Inspect both paths so renaming a record out of signatures cannot bypass validation.
  const touchesSignature = (file: FileChange) => file.filename.startsWith(signaturePrefix)
    || Boolean(file.previous_filename?.startsWith(signaturePrefix));
  const files = changed.filter(touchesSignature);
  if (files.length === 0) {
    await assertPullRequestUnchanged(repo(), pr(), snapshot);
    console.log("No CLA signature files changed.");
    return 0;
  }
  const errors = changed
    .filter((file) => !touchesSignature(file))
    .map((file) => `${file.filename}: signature pull requests may change only signature or authorization records`);
  const current = currentVersion(root);
  const settings = loadConfig(root);
  // Fetch the tree only when a record needs content validation, then reuse the same pinned tree.
  let tree: Map<string, TreeEntry> | undefined;
  for (const change of files) {
    const file = change.filename;
    // The local checkout is the trusted base; existing records remain immutable even if the PR claims an addition.
    if (change.status !== "added" || change.previous_filename || fs.existsSync(file)) {
      errors.push(`${file}: records are append-only; modification, deletion, and renaming are forbidden`);
      continue;
    }
    const individual = file.match(new RegExp(`^${escapeRegex(repoPrefix)}signatures/(v\\d+\\.\\d+)/individual/(\\d+)\\.md$`));
    const corporate = file.match(new RegExp(`^${escapeRegex(repoPrefix)}signatures/(v\\d+\\.\\d+)/corporate/([a-z0-9][a-z0-9._-]*)/(\\d{4,})\\.md$`));
    if (!individual && !corporate) {
      errors.push(`${file}: invalid signature path`);
      continue;
    }
    const pathVersion = individual?.[1] || corporate?.[1];
    if (pathVersion !== current) {
      errors.push(`${file}: path must name the current CLA version ${current}`);
      continue;
    }
    if (individual && individual[2] !== authorId) {
      errors.push(`${file}: filename must be the authenticated account ID`);
      continue;
    }
    // Derive the next snapshot from the base, preventing PR content from choosing its own sequence.
    if (corporate && path.basename(file) !== nextCorporateSnapshot(path.dirname(file))) {
      errors.push(`${file}: corporate authorization must add the next numbered snapshot`);
      continue;
    }
    tree ||= await headTree(headRepository, headSha);
    const text = await headFile(headRepository, headSha, file, tree);
    const version = versionFromText(text);
    if (!version || version !== current) {
      errors.push(`${file}: missing, stale, or unpublished CLA version`);
      continue;
    }
    const agreement = canonical(root, version);
    const expectedLink = `${settings.ledger_blob}/${repoPrefix}versions/CLA-${version}.md`;
    const error = individual
      ? individualError(text, agreement, version, author, authorId, expectedLink)
      : corporate
        ? corporateError(text, agreement, version, author, authorId, corporate[2], expectedLink)
        : "invalid signature path";
    if (error) errors.push(`${file}: ${error}`);
  }
  if (errors.length > 0) {
    const body = `CLA signature validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`;
    try {
      await api(`/repos/${repo()}/issues/${pr()}/comments`, "POST", { body });
    } catch (error) {
      console.error(`could not post validation comment: ${errorMessage(error)}`);
    }
    console.error(body);
    return 1;
  }
  await assertPullRequestUnchanged(repo(), pr(), snapshot);
  console.log(`CLA record valid for @${author} (id ${authorId}).`);
  return 0;
}

// Imports expose validation helpers without executing the workflow entrypoint.
if (import.meta.main) {
  main().then((code) => process.exitCode = code).catch((error) => {
    console.error(`CLA signature validation failed closed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}

export { main, versionFromText, individualError, corporateError, validDate };
