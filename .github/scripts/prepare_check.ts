#!/usr/bin/env node
/**
 * Resolve a current open PR and start the CLA check on its exact head commit.
 * Only trusted workflow code runs here; event metadata binds ordinary PR runs,
 * while dispatches look up their PR number afresh instead of reusing stale events.
 */

import * as fs from "node:fs";
import { api, isObject, errorMessage } from "./cla.ts";

/** Validated revisions used for checkout, evaluation, and the check's commit association. */
interface CheckTarget { head_sha: string; base_sha: string; head_repo: string; check_id: string }

/** Validate selectors before constructing API paths or publishing workflow outputs. */
function selectors() {
  const repo = process.env.REPO || "";
  const pr = process.env.PR || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(pr)) throw new Error("valid REPO and PR are required");
  return { repo, pr };
}

/** Reject closed PRs, foreign base repositories, incomplete revisions, and stale event heads. */
async function prepare(): Promise<CheckTarget> {
  const { repo, pr } = selectors();
  const data = await api(`/repos/${repo}/pulls/${pr}`);
  if (!isObject(data) || String(data.number) !== pr || data.state !== "open" || !isObject(data.head) || !isObject(data.head.repo)
    || !isObject(data.base) || !isObject(data.base.repo) || data.base.repo.full_name !== repo
    || typeof data.head.sha !== "string" || !/^[a-f\d]{40}$/.test(data.head.sha)
    || typeof data.base.sha !== "string" || !/^[a-f\d]{40}$/.test(data.base.sha)
    || typeof data.head.repo.full_name !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(data.head.repo.full_name)) {
    throw new Error("GitHub did not return a complete open PR in the caller repository");
  }
  if ((process.env.EVENT_HEAD_SHA && process.env.EVENT_HEAD_SHA !== data.head.sha)
    || (process.env.EVENT_HEAD_REPO && process.env.EVENT_HEAD_REPO !== data.head.repo.full_name)) {
    throw new Error("PR head changed since the event; a fresh run must evaluate the new commit");
  }
  const check = await api(`/repos/${repo}/check-runs`, "POST", {
    name: "Conveyal CLA", head_sha: data.head.sha, status: "in_progress",
    output: { title: "Checking current CLA coverage", summary: `Evaluating ${repo}#${pr} against the accepted ledger.` },
  });
  if (!isObject(check) || typeof check.id !== "number" || !Number.isSafeInteger(check.id) || check.id < 1) {
    throw new Error("GitHub did not return the created CLA check ID");
  }
  return { head_sha: data.head.sha, base_sha: data.base.sha, head_repo: data.head.repo.full_name, check_id: String(check.id) };
}

/** Write newline-safe outputs only after metadata and check creation have succeeded. */
async function main() {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required");
  const target = await prepare();
  fs.appendFileSync(output, Object.entries(target).map(([key, value]) => `${key}=${value}\n`).join(""));
}

if (import.meta.main) main().catch((error) => { console.error(errorMessage(error)); process.exitCode = 1; });

export { prepare, selectors };
