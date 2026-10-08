#!/usr/bin/env node
/**
 * Request fresh CLA evaluations in the explicitly enrolled consumer repositories.
 * Trusted configuration supplies repositories, workflows, and refs; PR content supplies none of them.
 * The installation token may dispatch workflows and read PR metadata but cannot write contribution code.
 */

import * as fs from "node:fs";
import { api, pages, isObject, errorMessage } from "./cla.ts";

/** One reviewed consumer endpoint; disabled entries permit configuration before deployment. */
interface Project { repository: string; workflow: string; ref: string; enabled: boolean }

/** Reject malformed configuration and duplicate repository enrollments instead of refreshing a partial list. */
function projects(value: unknown): Project[] {
  if (!Array.isArray(value)) throw new Error("cla/projects.json must contain a project list");
  const result: Project[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isObject(entry) || typeof entry.repository !== "string" || !/^conveyal\/[\w.-]+$/.test(entry.repository)
      || typeof entry.workflow !== "string" || !/^[\w.-]+\.ya?ml$/.test(entry.workflow)
      || typeof entry.ref !== "string" || !/^[\w.-]+$/.test(entry.ref) || typeof entry.enabled !== "boolean"
      || seen.has(entry.repository)) throw new Error("invalid or duplicate refresh project");
    seen.add(entry.repository);
    result.push({ repository: entry.repository, workflow: entry.workflow, ref: entry.ref, enabled: entry.enabled });
  }
  return result;
}

/** Read configuration only from the workflow's trusted checkout. */
function loadProjects(): Project[] {
  return projects(JSON.parse(fs.readFileSync("cla/projects.json", "utf8")));
}

/** Validate all open PR selectors before issuing any dispatch for a repository. */
async function refresh(project: Project, dryRun = false) {
  const pulls = await pages(`/repos/${project.repository}/pulls?state=open`);
  const numbers: number[] = [];
  for (const pull of pulls) {
    if (!isObject(pull) || typeof pull.number !== "number" || !Number.isSafeInteger(pull.number) || pull.number < 1
      || pull.state !== "open" || numbers.includes(pull.number)) throw new Error(`incomplete PR list for ${project.repository}`);
    numbers.push(pull.number);
  }
  for (const number of numbers) {
    if (!dryRun) await api(`/repos/${project.repository}/actions/workflows/${project.workflow}/dispatches`, "POST", {
      ref: project.ref, inputs: { pr_number: String(number) },
    });
    console.log(`${dryRun ? "Would refresh" : "Requested refresh for"} ${project.repository}#${number}`);
  }
  return numbers.length;
}

/** Emit only the selected repository names for token scoping, or refresh all enrolled consumers. */
async function main() {
  const selected = loadProjects().filter((project) => project.enabled);
  if (process.argv.includes("--repositories")) {
    const output = process.env.GITHUB_OUTPUT;
    if (!output) throw new Error("GITHUB_OUTPUT is required");
    fs.appendFileSync(output, `repositories=${selected.map((project) => project.repository.split("/")[1]).join(",")}\n`);
    return;
  }
  const failures: string[] = [];
  for (const project of selected) {
    try { await refresh(project, process.env.DRY_RUN === "true"); }
    catch (error) { failures.push(`${project.repository}: ${errorMessage(error)}`); }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

if (import.meta.main) main().catch((error) => { console.error(errorMessage(error)); process.exitCode = 1; });

export { projects, refresh };
