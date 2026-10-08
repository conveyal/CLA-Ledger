#!/usr/bin/env node
/**
 * Enforce current CLA coverage for every human commit author on a pull request.
 * Read records from the trusted ledger checkout and PR metadata from GitHub.
 * Missing identities, incomplete responses, and changing revisions prevent success.
 * Signature-only PRs use the separate signature validator when explicitly enabled.
 */

import * as helpers from "./cla.ts";
import { individualRecord, individualEditorUrl } from "./signature_record.ts";

/** Leave room below GitHub's comment limit and the prototype's observed failing URL size. */
const COMMENT_BUDGET = 60000;
const EDITOR_URL_BUDGET = 5300;

/** Public account metadata retained separately from display text for safe record generation. */
interface MissingAuthor { login: string | null; id: string }

/** Fit personalized links into one comment, retaining every missing author and the manual fallback. */
function signingLines(root: string, version: string, missing: MissingAuthor[], remaining: number): string[] {
  const settings = helpers.loadConfig(root);
  const agreement = helpers.canonical(root, version);
  const date = new Date().toISOString().slice(0, 10);
  return missing.map(({ login, id }) => {
    const label = `- @${login || "unknown"} (GitHub ID ${id})`;
    if (process.env.EDITOR_LINKS !== "true" || !login) return label;
    try {
      const url = individualEditorUrl(settings, individualRecord(settings, agreement, login, id, version, date));
      const extra = ` — [Sign the CLA](${url})`;
      if (url.length <= EDITOR_URL_BUDGET && extra.length <= remaining) {
        remaining -= extra.length;
        return label + extra;
      }
    } catch {
      // Non-GitHub ledgers and unusable identities retain the configured signing instructions.
    }
    return `${label} — use the signing instructions above`;
  });
}

/** Read a required workflow input; an absent value prevents the check from running. */
function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Return 0 for complete coverage or an eligible signature-only PR; return 1 for missing coverage.
 * Unexpected ledger or API failures propagate to the CLI error handler.
 */
async function main() {
  const root = helpers.claRoot();
  const signaturePrefix = process.env.SIGNATURE_PATH_PREFIX || "signatures/";
  const signatureOnlyEnabled = process.env.SIGNATURE_ONLY_PR === "true";
  const repo = env("REPO");
  const pr = env("PR");
  const signingUrl = env("SIGNING_URL");
  const snapshot = await helpers.pullRequest(repo, pr);
  helpers.assertPullRequestTarget(snapshot);
  const changed = await helpers.completePullRequestList(repo, pr, snapshot, "files");
  // New signers cannot have existing coverage; their record contents need the signature validator instead.
  if (signatureOnlyEnabled && changed.length > 0 && changed.every((file) => file.status === "added"
    && file.filename.startsWith(signaturePrefix) && !file.previous_filename)) {
    await helpers.assertPullRequestUnchanged(repo, pr, snapshot);
    console.log("CLA signature-only pull request; signature validator is the gate.");
    return 0;
  }

  const version = helpers.currentVersion(root);
  const covered = helpers.records(root, version);
  // Account IDs remain stable when logins change and deduplicate authors across commits.
  const missing = new Map<string, MissingAuthor>();
  // Keep unmapped commits separate: no ledger lookup can establish coverage for an unknown identity.
  const unknown = new Set<string>();
  const bots = new Set<string>();
  const commits = await helpers.completePullRequestList(repo, pr, snapshot, "commits");
  for (const commit of commits) {
    const author = commit.author;
    if (author && author.type === "Bot") {
      bots.add(author.login || "unknown bot");
    } else if (!author || author.id === undefined || author.id === null) {
      unknown.add(String(commit.sha || "unknown").slice(0, 12));
    } else if (!covered.has(String(author.id))) {
      missing.set(String(author.id), { login: author.login || null, id: String(author.id) });
    }
  }

  if (missing.size > 0 || unknown.size > 0) {
    const lines = [
      "This pull request cannot merge until every human commit author is covered by the current Conveyal CLA.",
      "",
      `Current required version: \`${version}\``,
      `Sign here: ${signingUrl}`,
    ];
    if (unknown.size > 0) {
      lines.push("", "GitHub could not map these commit authors:");
      lines.push(...[...unknown].sort().map((item) => `- \`${item}\``));
    }
    if (missing.size > 0) {
      const authors = [...missing.values()].sort((a, b) => (a.login || a.id).localeCompare(b.login || b.id));
      // Reserve every label, fallback, instruction, and unknown-author entry before adding long URLs.
      const reserved = authors.reduce((sum, author) => sum + (author.login?.length || 7) + author.id.length + 100, 0);
      lines.push("", "Missing or stale records:");
      lines.push(...signingLines(root, version, authors, Math.max(0, COMMENT_BUDGET - lines.join("\n").length - reserved - 1000)));
      if (process.env.EDITOR_LINKS === "true") {
        lines.push("", "Open your signing link, review the complete agreement, then commit on a new branch and create the signature PR using your own GitHub account. A maintainer must merge it before coverage is accepted.");
      }
    }
    const body = lines.join("\n");
    await helpers.updateComment(repo, pr, body);
    console.error(body);
    return 1;
  }
  await helpers.assertPullRequestUnchanged(repo, pr, snapshot);
  await helpers.updateComment(repo, pr, `All human commit authors are covered by Conveyal CLA \`${version}\`.`, false);
  console.log(`CLA check passed; exempt bots: ${[...bots].sort().join(", ") || "none"}.`);
  return 0;
}

// Importing this module for tests does not run the workflow or post comments.
if (import.meta.main) {
  main().then((code) => process.exitCode = code).catch(async (error) => {
    const message = `CLA check failed closed because the ledger or GitHub API could not be read: ${helpers.errorMessage(error)}`;
    console.error(message);
    try {
      await helpers.updateComment(env("REPO"), env("PR"), `${message}\n\nMaintainers: use the documented emergency bypass process.\nSign/help: ${env("SIGNING_URL")}`);
    } catch (commentError) {
      console.error(`could not post failure comment: ${helpers.errorMessage(commentError)}`);
    }
    process.exitCode = 1;
  });
}

export { main, signingLines };
