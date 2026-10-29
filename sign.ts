#!/usr/bin/env node
/**
 * Prepare an individual signature with Node 24.2+ built-ins.
 * Prepend the locally published agreement and create a new record without replacing existing history.
 * Account lookup and offline IDs prepare record text; the authenticated PR establishes the submitter's identity.
 * The workflow validator and maintainer review determine whether a proposed record enters the ledger.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { parseArgs as parseNodeArgs } from "node:util";
import { errorMessage, isObject, parseConfig, type ClaConfig } from "./.github/scripts/cla.ts";
import { buildIndividual, individualRecord, individualEditorUrl } from "./.github/scripts/signature_record.ts";

/** Parsed signing choices; prompts fill missing values before record generation. */
interface SignArgs {
  login?: string;
  id?: string;
  version?: string;
  help?: boolean;
  editorUrl?: boolean;
}

/** Stop generation with an error that the CLI prints as a failed exit status. */
function fail(message: string): never {
  throw new Error(message);
}

/** Load the target checkout's signing configuration and normalize its ledger root for generated paths. */
function loadConfig() {
  const file = process.env.CLA_CONFIG || "cla/config.json";
  if (!fs.existsSync(file)) fail(`cannot find ${file}; run this from the target repository root`);
  const config = parseConfig(JSON.parse(fs.readFileSync(file, "utf8")), file);
  return { ...config, cla_root: String(config.cla_root).replace(/^\/+|\/+$/g, "") };
}

/**
 * Parse CLI options and at most one positional login.
 * A --config option sets CLA_CONFIG for the subsequent configuration load.
 */
function parseArgs(argv: string[]): SignArgs {
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        id: { type: "string" },
        version: { type: "string" },
        config: { type: "string" },
        login: { type: "string" },
        "editor-url": { type: "boolean" },
      },
      allowPositionals: true,
    });
  } catch (error) {
    fail(errorMessage(error));
  }
  if (parsed.positionals.length > 1) fail("only one GitHub login may be provided");
  if (parsed.values.config) process.env.CLA_CONFIG = parsed.values.config;
  const result: SignArgs = {};
  const login = parsed.values.login || parsed.positionals[0];
  if (parsed.values.help) result.help = true;
  if (parsed.values["editor-url"]) result.editorUrl = true;
  if (login !== undefined) result.login = login;
  if (parsed.values.id !== undefined) result.id = parsed.values.id;
  if (parsed.values.version !== undefined) result.version = parsed.values.version;
  return result;
}

/**
 * Select a locally published version, defaulting to versions/CURRENT.
 * Explicit older versions can be generated, but the PR validator accepts only the current version.
 */
function currentVersion(config: ClaConfig, requested?: string) {
  const versionsDir = path.join(config.cla_root, "versions");
  const available = new Set(fs.readdirSync(versionsDir)
    .map((name) => name.match(/^CLA-(v\d+\.\d+)\.md$/)?.[1])
    .filter(Boolean));
  if (requested) {
    if (!available.has(requested)) fail(`version ${requested} is not published`);
    return requested;
  }
  const current = fs.readFileSync(path.join(versionsDir, "CURRENT"), "utf8").trim();
  if (!available.has(current)) fail(`versions/CURRENT names unpublished version ${current}`);
  return current;
}

/** Read published agreement text with the same trailing-whitespace normalization used by validation. */
function canonical(config: ClaConfig, version: string) {
  return fs.readFileSync(path.join(config.cla_root, "versions", `CLA-${version}.md`), "utf8").trimEnd();
}

/** Look up a login's numeric GitHub ID; throw on lookup failure or an ID that cannot be represented exactly. */
async function resolveId(login: string) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "conveyal-cla-node" },
  });
  if (response.status === 404) fail(`GitHub login "${login}" not found`);
  if (!response.ok) fail(`GitHub API error (${response.status}); pass --id to use the offline path`);
  const data: unknown = await response.json();
  if (!isObject(data) || typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id < 1) {
    fail("GitHub returned an invalid account ID");
  }
  return String(data.id);
}

/** Require decimal digits and retain the string representation so offline IDs do not lose precision. */
function numericId(value: string | undefined, label: string) {
  if (!/^\d+$/.test(String(value || ""))) fail(`${label} must contain only digits`);
  return String(value);
}

/**
 * Fill missing signing choices in place when a terminal or explicit CLA_PROMPT input is available.
 * Noninteractive callers must supply a login; later validation checks the remaining fields.
 */
async function promptForMissing(args: SignArgs) {
  const interactive = Boolean(process.stdin.isTTY || process.env.CLA_PROMPT === "1");
  if (!interactive && !args.login) {
    fail("missing required arguments; run in a terminal to be prompted or provide a login");
  }
  if (!interactive) return args;
  // Read explicit piped answers upfront; readline can otherwise consume lines before later questions register.
  const pipedLines = !process.stdin.isTTY && process.env.CLA_PROMPT === "1"
    ? fs.readFileSync(0, "utf8").split(/\r?\n/)
    : null;
  const input = pipedLines ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  /** Read one answer from a terminal or the buffered pipe, applying the default to an empty answer. */
  const ask = async (question: string, fallback = "") => {
    const prompt = `${question}${fallback ? ` [${fallback}]` : ""}: `;
    let answer: string;
    if (pipedLines) {
      process.stdout.write(prompt);
      answer = pipedLines.shift() || "";
    } else {
      if (!input) fail("interactive input is unavailable");
      answer = await input.question(prompt);
    }
    return answer || fallback;
  };
  try {
    args.login ||= await ask("GitHub login");
    args.id ||= await ask("GitHub account ID (leave blank to look it up)");
    return args;
  } finally {
    if (input) input.close();
  }
}

/** Generate one record and return 0, or throw on invalid input, lookup failure, or an unsafe write. */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node sign.ts [login] [--id ID] [--version VERSION] [--editor-url]");
    return 0;
  }
  const config = loadConfig();
  await promptForMissing(args);
  const login = String(args.login || "").replace(/^@/, "");
  if (!login) fail("GitHub login is required");
  let id = args.id;
  if (!id) {
    try {
      id = await resolveId(login);
    } catch (error) {
      if (!process.stdin.isTTY) fail(`could not resolve GitHub account ID: ${errorMessage(error)}; pass --id to use the offline path`);
      const input = readline.createInterface({ input: process.stdin, output: process.stdout });
      try { id = await input.question("GitHub account ID (numeric, for offline use): "); } finally { input.close(); }
    }
  }
  id = numericId(id, "account ID");
  const version = currentVersion(config, args.version);
  const date = new Date().toISOString().slice(0, 10);
  const individual = individualRecord(config, canonical(config, version), login, id, version, date);
  if (args.editorUrl) {
    if (fs.existsSync(path.join(config.cla_root, individual.path))) fail("this account already has a record for the selected version");
    console.log(individualEditorUrl(config, individual));
    return 0;
  }
  // Records are unique per account and CLA version.
  const output = path.join(config.cla_root, individual.path);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    // Exclusive creation protects existing records even if another process creates the path after selection.
    fs.writeFileSync(output, individual.text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isObject(error) && error.code === "EEXIST") fail(`${output} already exists; records are append-only and cannot be replaced`);
    throw error;
  }
  console.log(`Wrote ${output} (CLA ${version}, ${date})`);
  console.log("Review, commit, and open a pull request from the authenticated signer account.");
  return 0;
}

// Tests import the builders without prompting, making API requests, or writing records.
if (import.meta.main) {
  main().then((code) => process.exitCode = code).catch((error) => {
    console.error(`error: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}

export { parseArgs, currentVersion, buildIndividual };
