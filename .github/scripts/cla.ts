#!/usr/bin/env node
/**
 * Shared GitHub API and ledger readers for the signing and enforcement scripts.
 * Callers supply a trusted ledger checkout; proposed PR files never supply code.
 * API responses remain unknown until runtime validation establishes their shape.
 * Node executes this module directly with built-in TypeScript type stripping.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const API = "https://api.github.com";

/** Ledger paths and public links used to generate and validate signature records. */
export interface ClaConfig {
  cla_root: string;
  ledger_blob: string;
  organization_name: string;
  [key: string]: unknown;
}

/** PR revisions and counts used to detect stale runs and incomplete API results. */
export interface PullRequestSnapshot {
  head: { sha: string; repo: { full_name: string } };
  base: { sha: string };
  commits: number;
  changed_files: number;
}

/** Both rename paths matter when a PR moves a record into or out of signatures/. */
export interface FileChange {
  filename: string;
  status: string;
  previous_filename?: string;
}

/** An absent author means GitHub cannot map the commit to an account. */
export interface Commit {
  sha: string;
  author?: {
    login?: string | null;
    id?: number | null;
    type?: string | null;
  } | null;
}

/** Narrows JSON objects without treating null or arrays as property containers. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a readable message for Error instances and other thrown values. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Includes the HTTP status and response excerpt supplied by the API reader. */
function apiError(response: Response, body: string) {
  const detail = body ? `: ${body}` : "";
  return new Error(`GitHub API ${response.status} ${response.statusText}${detail}`);
}

/**
 * Calls a GitHub REST endpoint path with GH_TOKEN when available.
 * Returns unknown JSON, or null for an empty response. HTTP and JSON errors throw.
 * Each caller validates the response fields it needs before using them.
 */
async function api(endpoint: string, method = "GET", body?: unknown): Promise<unknown> {
  const token = process.env.GH_TOKEN || "";
  const response = await fetch(API + endpoint, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "User-Agent": "conveyal-cla-node",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw apiError(response, text.slice(0, 500));
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`GitHub API returned invalid JSON: ${errorMessage(error)}`);
  }
}

/**
 * Reads list pages until GitHub returns an empty page, enforcing maxItems.
 * Pagination alone cannot detect an endpoint's total-result cap; PR readers also compare metadata counts.
 */
async function pages(endpoint: string, maxItems = Infinity): Promise<unknown[]> {
  const result: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const batch = await api(`${endpoint}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`GitHub API returned a non-list for ${endpoint}`);
    if (batch.length === 0) return result;
    result.push(...batch);
    if (result.length > maxItems) throw new Error(`GitHub API returned too many items for ${endpoint}`);
  }
}

/** Reads a PR snapshot and rejects missing revisions, repository identity, or invalid counts. */
async function pullRequest(repo: string, pr: string): Promise<PullRequestSnapshot> {
  const data = await api(`/repos/${repo}/pulls/${pr}`);
  if (!isObject(data) || !isObject(data.head) || !isObject(data.base) || !isObject(data.head.repo)
    || typeof data.head.sha !== "string" || !data.head.sha
    || typeof data.base.sha !== "string" || !data.base.sha
    || typeof data.head.repo.full_name !== "string" || !data.head.repo.full_name
    || typeof data.commits !== "number" || !Number.isSafeInteger(data.commits) || data.commits < 1
    || typeof data.changed_files !== "number" || !Number.isSafeInteger(data.changed_files) || data.changed_files < 0) {
    throw new Error("GitHub returned incomplete pull request metadata");
  }
  return {
    head: { sha: data.head.sha, repo: { full_name: data.head.repo.full_name } },
    base: { sha: data.base.sha }, commits: data.commits, changed_files: data.changed_files,
  };
}

/** Rejects a live PR that no longer matches the revisions supplied by the workflow event. */
function assertPullRequestTarget(snapshot: PullRequestSnapshot) {
  if ((process.env.HEAD_SHA && snapshot.head.sha !== process.env.HEAD_SHA)
    || (process.env.BASE_SHA && snapshot.base.sha !== process.env.BASE_SHA)
    || (process.env.HEAD_REPO && snapshot.head.repo.full_name !== process.env.HEAD_REPO)) {
    throw new Error("Pull request changed since this workflow started; update the PR branch to trigger a fresh workflow run");
  }
}

/** Validates file identity, status, and optional rename source before path classification. */
function isFileChange(value: unknown): value is FileChange {
  return isObject(value) && typeof value.filename === "string" && Boolean(value.filename)
    && typeof value.status === "string"
    && (value.previous_filename === undefined || typeof value.previous_filename === "string");
}

/** Validates commit data while retaining absent authors for the coverage check to reject. */
function isCommit(value: unknown): value is Commit {
  if (!isObject(value) || typeof value.sha !== "string" || !value.sha) return false;
  const author = value.author;
  return author === undefined || author === null || (isObject(author)
    && (author.id === undefined || author.id === null || (typeof author.id === "number" && Number.isSafeInteger(author.id) && author.id > 0))
    && (author.login === undefined || author.login === null || typeof author.login === "string")
    && (author.type === undefined || author.type === null || typeof author.type === "string"));
}

/** Returns typed items only when every entry is valid, present, and uniquely identified. */
function verifiedItems<T>(items: unknown[], expected: number, kind: string, isItem: (value: unknown) => value is T, key: (item: T) => string): T[] {
  // Filtering narrows types; a rejected entry still invalidates the entire list.
  const validItems = items.filter(isItem);
  if (items.length !== expected || validItems.length !== items.length
    || new Set(validItems.map(key)).size !== expected) {
    throw new Error(`GitHub returned an incomplete or inconsistent PR ${kind} list (expected ${expected}, received ${items.length})`);
  }
  return validItems;
}

/**
 * Reads the requested PR list and requires its count to match the initial snapshot.
 * Rejects PRs beyond the endpoint limit instead of accepting a truncated list.
 */
function completePullRequestList(repo: string, pr: string, snapshot: PullRequestSnapshot, kind: "files"): Promise<FileChange[]>;
function completePullRequestList(repo: string, pr: string, snapshot: PullRequestSnapshot, kind: "commits"): Promise<Commit[]>;
async function completePullRequestList(repo: string, pr: string, snapshot: PullRequestSnapshot, kind: "files" | "commits") {
  const commits = kind === "commits";
  const expected = commits ? snapshot.commits : snapshot.changed_files;
  // These are total-result caps. Additional pages cannot exceed them.
  const limit = commits ? 250 : 3000;
  if (expected > limit) {
    throw new Error(`Cannot verify all PR ${kind}: GitHub's API limit is ${limit}, but this PR has ${expected}; split the PR into smaller changes`);
  }
  const items = await pages(`/repos/${repo}/pulls/${pr}/${kind}`, expected);
  // File identity is its path. Different paths can contain the same blob SHA.
  return commits
    ? verifiedItems(items, expected, kind, isCommit, (item) => item.sha)
    : verifiedItems(items, expected, kind, isFileChange, (item) => item.filename);
}

/** Rechecks PR revisions and counts before a caller reports success. */
async function assertPullRequestUnchanged(repo: string, pr: string, snapshot: PullRequestSnapshot) {
  const latest = await pullRequest(repo, pr);
  if (latest.head.sha !== snapshot.head.sha || latest.base.sha !== snapshot.base.sha
    || latest.head.repo.full_name !== snapshot.head.repo.full_name
    || latest.commits !== snapshot.commits || latest.changed_files !== snapshot.changed_files) {
    throw new Error("Pull request changed during validation; update the PR branch to trigger a fresh workflow run");
  }
}

/** Requires canonical positive snapshot filenames and sorts them by numeric sequence. */
function corporateSnapshots(directory: string) {
  const names = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  for (const name of names) {
    const number = name.match(/^(\d{4,})\.md$/)?.[1];
    if (!number || BigInt(number) === 0n || String(BigInt(number)).padStart(4, "0") !== number) {
      throw new Error(`Invalid corporate snapshot filename: ${name}`);
    }
  }
  // Numeric order remains correct after the sequence grows beyond four digits.
  return names.sort((left, right) => {
    const a = BigInt(left.slice(0, -3));
    const b = BigInt(right.slice(0, -3));
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Chooses the next local snapshot name; PR validation separately checks the trusted base. */
function nextCorporateSnapshot(directory: string) {
  const latest = BigInt(corporateSnapshots(directory).at(-1)?.slice(0, -3) || "0");
  return `${String(latest + 1n).padStart(4, "0")}.md`;
}

/** Normalizes a relative ledger path and rejects empty paths or paths that contain '..'. */
function claRoot(value = process.env.CLA_ROOT || "cla") {
  const root = String(value).replace(/^\/+|\/+$/g, "");
  if (!root || root.includes("..")) throw new Error("CLA_ROOT must be a relative directory");
  return root;
}

/** Accepts real ISO calendar dates through the next UTC day. */
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return false;
  // One day of tolerance permits dates from time zones ahead of UTC.
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return parsed <= tomorrow;
}

/** Reads the required version from the trusted ledger and requires its agreement file to exist. */
function currentVersion(root: string): string {
  const value = fs.readFileSync(path.join(root, "versions", "CURRENT"), "utf8").trim();
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("CURRENT does not name a valid CLA version");
  const agreement = path.join(root, "versions", `CLA-${value}.md`);
  if (!fs.existsSync(agreement)) throw new Error(`published CLA version is missing: ${agreement}`);
  return value;
}

/** Reads agreement text without trailing whitespace for consistent signature block comparison. */
function canonical(root: string, version: string): string {
  return fs.readFileSync(path.join(root, "versions", `CLA-${version}.md`), "utf8").trimEnd();
}

/** Reads configuration from the ledger root or its cla/ subdirectory. */
function loadConfig(root: string): ClaConfig {
  const direct = path.join(root, "config.json");
  const file = fs.existsSync(direct) ? direct : path.join(root, "cla", "config.json");
  return parseConfig(JSON.parse(fs.readFileSync(file, "utf8")), file);
}

/** Requires the configuration fields used by signing and coverage, retaining extra fields. */
export function parseConfig(value: unknown, file: string): ClaConfig {
  if (!isObject(value)) throw new Error(`${file} must contain a configuration object`);
  if (typeof value.cla_root !== "string" || !value.cla_root
    || typeof value.ledger_blob !== "string" || !value.ledger_blob
    || typeof value.organization_name !== "string" || !value.organization_name) {
    throw new Error(`${file} must define cla_root, ledger_blob, and organization_name as nonempty strings`);
  }
  return { ...value, cla_root: value.cla_root, ledger_blob: value.ledger_blob, organization_name: value.organization_name };
}

/** Splits the public ID list; record validation separately requires digits, order, and uniqueness. */
function numericIds(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Treats configured links and identity values as literal text in record patterns. */
function escapeRegex(value: string) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds the canonical agreement link from repository configuration, independent of checkout location. */
function recordLink(settings: ClaConfig, version: string) {
  const root = String(settings.cla_root || ".").replace(/^\/+|\/+$/g, "");
  const prefix = root === "." ? "" : `${root}/`;
  return `${String(settings.ledger_blob).replace(/\/$/, "")}/${prefix}versions/CLA-${version}.md`;
}

/**
 * Returns identity fields from a complete individual record, or null for invalid content.
 * The trusted checkout supplies acceptance evidence; this parser does not authenticate the account.
 */
function parseIndividualRecord(text: string, agreement: string, version: string, expectedId: string, expectedLink: string) {
  if (!text.startsWith(agreement)) return null;
  const rest = text.slice(agreement.length);
  const pattern = new RegExp(
    String.raw`^\s*---\s*## Signature\s+` +
    String.raw`I,\s+@([^\s]+)\s+\(GitHub account ID:\s+(\d+)\),\s+agree to and sign the\s+` +
    String.raw`\[Conveyal Contributor License Agreement, version ${escapeRegex(version.replace(/^v/, ""))}\]\(${escapeRegex(expectedLink)}\)\s+` +
    String.raw`— reproduced in full above — for Conveyal's organization-wide open-source projects\.\s+` +
    String.raw`- GitHub login:\s+([^\s]+)\s+` +
    String.raw`- GitHub account ID:\s+(\d+)\s+` +
    String.raw`- CLA version:\s+(${escapeRegex(version)})\s+` +
    String.raw`- Signature type:\s+individual\s+` +
    String.raw`- Date:\s+(\d{4}-\d{2}-\d{2})\s*$`,
  );
  const match = pattern.exec(rest);
  if (!match || match[2] !== expectedId || match[3] !== match[1] || match[4] !== expectedId) return null;
  if (!validDate(match[6])) return null;
  return { login: match[1], id: match[2], date: match[6] };
}

/** Returns covered IDs from a complete corporate snapshot, or null for invalid content. */
function parseCorporateRecord(text: string, agreement: string, version: string, expectedSlug: string, expectedLink: string) {
  if (!text.startsWith(agreement)) return null;
  const rest = text.slice(agreement.length);
  const pattern = new RegExp(
    String.raw`^\s*---\s*## Corporate Authorization\s+` +
    String.raw`I,\s+@([^\s]+)\s+\(GitHub account ID:\s+(\d+)\),\s+confirm that I am authorized\s+` +
    String.raw`to accept the \[Conveyal Contributor License Agreement, version ${escapeRegex(version.replace(/^v/, ""))}\]\(${escapeRegex(expectedLink)}\)\s+` +
    String.raw`on behalf of the organization \`([^\`]+)\` for the authorized GitHub\s+accounts listed below, for Conveyal's organization-wide open-source projects\.\s+` +
    String.raw`- Organization:\s+([^\s]+)\s+` +
    String.raw`- Representative GitHub login:\s+([^\s]+)\s+` +
    String.raw`- Representative GitHub account ID:\s+(\d+)\s+` +
    String.raw`- Authorized GitHub account IDs:\s+([0-9, ]+)\s+` +
    String.raw`- CLA version:\s+(${escapeRegex(version)})\s+` +
    String.raw`- Signature type:\s+corporate\s+` +
    String.raw`- Date:\s+(\d{4}-\d{2}-\d{2})\s*$`,
  );
  const match = pattern.exec(rest);
  if (!match || match[3] !== match[4] || match[3] !== expectedSlug
    || match[5] !== match[1] || match[6] !== match[2] || !validDate(match[9])) return null;
  const ids = numericIds(match[7]);
  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))
    || ids.join(", ") !== [...new Set(ids)].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0).join(", ")
    || !ids.includes(match[2])) return null;
  return { login: match[1], representativeId: match[2], ids, date: match[9] };
}

/**
 * Collects coverage from individual records and each organization's latest snapshot for one version.
 * The caller supplies a trusted checkout. Older versions remain stored but provide no coverage for this version.
 * Invalid records provide no coverage; filesystem errors propagate so the caller fails closed.
 */
function records(root: string, version: string): Set<string> {
  const agreement = canonical(root, version);
  const settings = loadConfig(root);
  const expectedLink = recordLink(settings, version);
  const covered = new Set<string>();
  const individualRoot = path.join(root, "signatures", version, "individual");
  if (fs.existsSync(individualRoot)) {
    for (const name of fs.readdirSync(individualRoot)) {
      if (!/^\d+\.md$/.test(name)) continue;
      const id = name.slice(0, -3);
      const file = path.join(individualRoot, name);
      if (!fs.lstatSync(file).isFile()) throw new Error(`Record must be a regular file: ${file}`);
      const text = fs.readFileSync(file, "utf8");
      if (parseIndividualRecord(text, agreement, version, id, expectedLink)) {
        covered.add(id);
      }
    }
  }
  const corporateRoot = path.join(root, "signatures", version, "corporate");
  if (fs.existsSync(corporateRoot)) {
    for (const entry of fs.readdirSync(corporateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9._-]*$/.test(entry.name)) continue;
      const organizationSlug = entry.name;
      const directory = path.join(corporateRoot, organizationSlug);
      // Never fall back to an older snapshot if the latest one is malformed.
      const latest = corporateSnapshots(directory).at(-1);
      if (!latest) continue;
      const file = path.join(directory, latest);
      if (!fs.lstatSync(file).isFile()) throw new Error(`Record must be a regular file: ${file}`);
      const text = fs.readFileSync(file, "utf8");
      const parsed = parseCorporateRecord(text, agreement, version, organizationSlug, expectedLink);
      if (parsed) for (const id of parsed.ids) covered.add(id);
    }
  }
  return covered;
}

/** Replaces the workflow's marker comment; success can avoid creating a new comment. */
async function updateComment(repo: string, pr: string, body: string, create = true) {
  // The hidden marker keeps repeated failures in one identifiable comment.
  const marker = "<!-- conveyal-cla-check -->";
  const payload = { body: `${marker}\n${body}` };
  const comments = await pages(`/repos/${repo}/issues/${pr}/comments`);
  const existing = comments.find((item): item is { id: number; body: string } => isObject(item)
    && typeof item.id === "number" && typeof item.body === "string" && item.body.includes(marker)
    && isObject(item.user) && item.user.login === "github-actions[bot]");
  if (existing) {
    return api(`/repos/${repo}/issues/comments/${existing.id}`, "PATCH", payload);
  }
  return create ? api(`/repos/${repo}/issues/${pr}/comments`, "POST", payload) : null;
}

export {
  API,
  api,
  pages,
  pullRequest,
  assertPullRequestTarget,
  completePullRequestList,
  assertPullRequestUnchanged,
  nextCorporateSnapshot,
  claRoot,
  validDate,
  currentVersion,
  canonical,
  loadConfig,
  records,
  numericIds,
  recordLink,
  parseIndividualRecord,
  parseCorporateRecord,
  updateComment,
};
