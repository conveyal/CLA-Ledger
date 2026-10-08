#!/usr/bin/env node
/**
 * Finish the PR-head CLA check after trusted checkouts, including checkout failures.
 * Coverage and API errors report failure; a dispatcher job's own success never supplies the merge gate.
 * A final snapshot check prevents a result from being attributed to changing PR revisions.
 */

import { main as checkCoverage } from "./check_cla.ts";
import { api, errorMessage, updateComment, pullRequest, assertPullRequestTarget, assertPullRequestUnchanged } from "./cla.ts";

/** Complete only the check created by this evaluation, preserving its head-commit association. */
async function main() {
  const repo = process.env.REPO || "";
  const pr = process.env.PR || "";
  const checkId = process.env.CHECK_ID || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(pr) || !/^[1-9]\d*$/.test(checkId)) {
    throw new Error("REPO, PR, and CHECK_ID are required");
  }
  let code = 1;
  let summary = "CLA coverage is incomplete. See the PR comment for signing instructions.";
  try {
    if (process.env.PREVIOUS_STATUS !== "success") throw new Error("trusted checkouts or runtime setup failed");
    const snapshot = await pullRequest(repo, pr);
    assertPullRequestTarget(snapshot);
    code = await checkCoverage();
    await assertPullRequestUnchanged(repo, pr, snapshot);
    if (code === 0) summary = "All human commit authors have accepted current-version coverage, or the separate signature validator gates this signature-only PR.";
  } catch (error) {
    code = 1;
    summary = `CLA check failed closed: ${errorMessage(error)}`;
    try { await updateComment(repo, pr, `${summary}\n\nSigning instructions: ${process.env.SIGNING_URL || "https://github.com/conveyal/CLA-Ledger/blob/main/CLA.md"}`); }
    catch (commentError) { console.error(`Could not update the PR comment: ${errorMessage(commentError)}`); }
  }
  await api(`/repos/${repo}/check-runs/${checkId}`, "PATCH", {
    status: "completed", conclusion: code === 0 ? "success" : "failure",
    output: { title: code === 0 ? "CLA coverage accepted" : "CLA coverage required", summary },
  });
  return code;
}

if (import.meta.main) main().then((code) => process.exitCode = code).catch((error) => { console.error(errorMessage(error)); process.exitCode = 1; });

export { main };
