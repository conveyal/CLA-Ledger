#!/usr/bin/env node
/**
 * Prepare an individual signature or corporate authorization with Node 24.2+ built-ins.
 * Prepend the locally published agreement and create a new record without replacing existing history.
 * Account lookup and offline IDs prepare record text; the authenticated PR establishes the submitter's identity.
 * The workflow validator and maintainer review determine whether a proposed record enters the ledger.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { parseArgs as parseNodeArgs } from "node:util";
import { nextCorporateSnapshot, errorMessage, isObject, parseConfig, type ClaConfig } from "./.github/scripts/cla.ts";

/** Parsed signing choices; prompts fill missing values before record generation. */
interface SignArgs {
  login?: string;
  id?: string;
  version?: string;
  organization?: string;
  authorizedIds: string[];
  corporate?: boolean;
  help?: boolean;
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
 * Parse CLI options and at most one positional login, preserving the last signing-type switch.
 * A --config option sets CLA_CONFIG for the subsequent configuration load.
 */
function parseArgs(argv: string[]): SignArgs {
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        corporate: { type: "boolean" },
        individual: { type: "boolean" },
        id: { type: "string" },
        version: { type: "string" },
        organization: { type: "string" },
        config: { type: "string" },
        login: { type: "string" },
        "authorized-id": { type: "string", multiple: true },
      },
      allowPositionals: true,
      tokens: true,
    });
  } catch (error) {
    fail(errorMessage(error));
  }
  if (parsed.positionals.length > 1) fail("only one GitHub login may be provided");
  if (parsed.values.config) process.env.CLA_CONFIG = parsed.values.config;
  let corporate: boolean | undefined;
  // Token order preserves the last-flag-wins behavior when both signing switches appear.
  for (const token of parsed.tokens) {
    if (token.kind === "option" && token.name === "corporate") corporate = true;
    if (token.kind === "option" && token.name === "individual") corporate = false;
  }
  const result: SignArgs = {
    authorizedIds: parsed.values["authorized-id"] || [],
  };
  const login = parsed.values.login || parsed.positionals[0];
  if (corporate !== undefined) result.corporate = corporate;
  if (parsed.values.help) result.help = true;
  if (login !== undefined) result.login = login;
  if (parsed.values.id !== undefined) result.id = parsed.values.id;
  if (parsed.values.version !== undefined) result.version = parsed.values.version;
  if (parsed.values.organization !== undefined) result.organization = parsed.values.organization;
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

/** Build the individual signature block; callers prepend the canonical agreement and validate inputs. */
function buildIndividual(config: ClaConfig, login: string, id: string, version: string, date: string) {
  const prefix = config.cla_root === "." ? "" : `${config.cla_root}/`;
  const link = `${config.ledger_blob}/${prefix}versions/CLA-${version}.md`;
  return `---\n\n## Signature\n\nI, @${login} (GitHub account ID: ${id}), agree to and sign the\n[Conveyal Contributor License Agreement, version ${version.slice(1)}](${link})\n— reproduced in full above — for Conveyal's organization-wide open-source projects.\n\n- GitHub login: ${login}\n- GitHub account ID: ${id}\n- CLA version: ${version}\n- Signature type: individual\n- Date: ${date}\n`;
}

/**
 * Build a corporate block with the representative included and authorized IDs deduplicated and numerically sorted.
 * Callers validate inputs and prepend the canonical agreement.
 */
function buildCorporate(config: ClaConfig, login: string, id: string, organization: string, authorized: string[], version: string, date: string) {
  const prefix = config.cla_root === "." ? "" : `${config.cla_root}/`;
  const link = `${config.ledger_blob}/${prefix}versions/CLA-${version}.md`;
  const ids = [...new Set([...authorized, id])].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
  return `---\n\n## Corporate Authorization\n\nI, @${login} (GitHub account ID: ${id}), confirm that I am authorized\nto accept the [Conveyal Contributor License Agreement, version ${version.slice(1)}](${link})\non behalf of the organization \`${organization}\` for the authorized GitHub\naccounts listed below, for Conveyal's organization-wide open-source projects.\n\n- Organization: ${organization}\n- Representative GitHub login: ${login}\n- Representative GitHub account ID: ${id}\n- Authorized GitHub account IDs: ${ids.join(", ")}\n- CLA version: ${version}\n- Signature type: corporate\n- Date: ${date}\n`;
}

/**
 * Fill missing signing choices in place when a terminal or explicit CLA_PROMPT input is available.
 * Noninteractive callers must supply a login and signing type; later validation checks the remaining fields.
 */
async function promptForMissing(args: SignArgs) {
  const interactive = Boolean(process.stdin.isTTY || process.env.CLA_PROMPT === "1");
  if (!interactive && (!args.login || args.corporate === undefined)) {
    fail("missing required arguments; run in a terminal to be prompted or provide login and signing type");
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
    if (args.corporate === undefined) {
      const type = (await ask("Signing type (individual/corporate)", "individual")).toLowerCase();
      if (!["individual", "corporate"].includes(type)) fail("signing type must be individual or corporate");
      args.corporate = type === "corporate";
    }
    args.id ||= await ask("GitHub account ID (leave blank to look it up)");
    if (args.corporate) {
      args.organization ||= await ask("Organization slug");
      if (args.authorizedIds.length === 0) {
        const list = await ask("Authorized GitHub account IDs (comma-separated)");
        args.authorizedIds = list ? list.split(",").map((item) => item.trim()).filter(Boolean) : [];
      }
    }
    return args;
  } finally {
    if (input) input.close();
  }
}

/** Generate one record and return 0, or throw on invalid input, lookup failure, or an unsafe write. */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node sign.ts [login] [--id ID] [--individual | --corporate --organization SLUG --authorized-id ID] [--version VERSION]");
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
  const organization = args.organization || "";
  if (args.corporate && !/^[a-z0-9][a-z0-9._-]*$/.test(organization)) fail("organization must be a lowercase GitHub slug");
  const corporateDirectory = path.join(config.cla_root, "signatures", version, "corporate", organization);
  // Corporate updates add numbered snapshots; individual records are unique per account and CLA version.
  const relative = args.corporate
    ? path.join("signatures", version, "corporate", organization, nextCorporateSnapshot(corporateDirectory))
    : path.join("signatures", version, "individual", `${id}.md`);
  const authorized = (args.authorizedIds || []).map((value) => numericId(value, "authorized ID"));
  const block = args.corporate
    ? buildCorporate(config, login, id, organization, authorized, version, date)
    : buildIndividual(config, login, id, version, date);
  const output = path.join(config.cla_root, relative);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    // Exclusive creation protects existing records even if another process creates the path after selection.
    fs.writeFileSync(output, `${canonical(config, version)}\n\n${block}`, { encoding: "utf8", flag: "wx" });
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

export { parseArgs, currentVersion, buildIndividual, buildCorporate };
