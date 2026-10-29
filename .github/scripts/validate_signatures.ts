#!/usr/bin/env node
/**
 * Validate new signature records against the trusted base checkout and authenticated PR author.
 * Read proposed content through GitHub's API without executing code from the PR.
 * Require canonical agreement text, current versions, matching identities, and append-only paths.
 * Check Git tree modes separately because the Contents API can follow symlinks.
 */

import * as fs from "node:fs";
import {
  api, pages, claRoot, canonical, currentVersion, loadConfig, validDate,
  pullRequest, assertPullRequestTarget, completePullRequestList, assertPullRequestUnchanged,
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

/** Reuse the bot's validation comment, migrate old failures, and remove duplicate bot reports. */
async function validationComment(body: string, create = false) {
  const marker = "<!-- conveyal-cla-signature-validation -->";
  try {
    const comments = (await pages(`/repos/${repo()}/issues/${pr()}/comments`))
      .filter((item): item is { id: number; body: string } => isObject(item)
        && typeof item.id === "number" && typeof item.body === "string"
        && isObject(item.user) && item.user.login === "github-actions[bot]"
        && (item.body.startsWith(marker) || item.body.startsWith("CLA signature validation failed:\n")));
    const existing = comments.find((item) => item.body.startsWith(marker)) || comments[0];
    const payload = { body: `${marker}\n${body}` };
    if (existing) {
      await api(`/repos/${repo()}/issues/comments/${existing.id}`, "PATCH", payload);
      for (const duplicate of comments) {
        if (duplicate.id !== existing.id) await api(`/repos/${repo()}/issues/comments/${duplicate.id}`, "DELETE");
      }
    } else if (create) {
      await api(`/repos/${repo()}/issues/${pr()}/comments`, "POST", payload);
    }
  } catch (error) {
    console.error(`could not update validation comment: ${errorMessage(error)}`);
  }
}

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
    String.raw`— reproduced in full above — for open-source projects in the Conveyal GitHub organization\.\s+` +
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

/** Treat identities, repository paths, and agreement links as literal text in template patterns. */
function escapeRegex(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const isSignaturePath = (filename: string) => filename.startsWith(signaturePrefix)
    && filename !== `${signaturePrefix}README.md`;
  const touchesSignature = (file: FileChange) => isSignaturePath(file.filename)
    || Boolean(file.previous_filename && isSignaturePath(file.previous_filename));
  const files = changed.filter(touchesSignature);
  if (files.length === 0) {
    await assertPullRequestUnchanged(repo(), pr(), snapshot);
    await validationComment("CLA signature validation passed: no signature records changed.");
    console.log("No CLA signature files changed.");
    return 0;
  }
  const errors = changed
    .filter((file) => !touchesSignature(file))
    .map((file) => `${file.filename}: signature pull requests may change only signature records`);
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
    if (!individual) {
      errors.push(`${file}: invalid signature path`);
      continue;
    }
    if (individual[1] !== current) {
      errors.push(`${file}: path must name the current CLA version ${current}`);
      continue;
    }
    if (individual[2] !== authorId) {
      errors.push(`${file}: filename must be the authenticated account ID`);
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
    const error = individualError(text, agreement, version, author, authorId, expectedLink);
    if (error) errors.push(`${file}: ${error}`);
  }
  if (errors.length > 0) {
    const body = `CLA signature validation failed:\n${errors.map((item) => `- ${item}`).join("\n")}`;
    await assertPullRequestUnchanged(repo(), pr(), snapshot);
    await validationComment(body, true);
    console.error(body);
    return 1;
  }
  await assertPullRequestUnchanged(repo(), pr(), snapshot);
  await validationComment("CLA signature validation passed.");
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

export { main, versionFromText, individualError, validDate };
