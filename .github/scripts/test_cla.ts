#!/usr/bin/env node
/**
 * Offline contract tests for ledger coverage, PR validation, and the signing CLI.
 * Temporary ledgers contain the published agreement and synthetic identities; API responses use scoped fetch mocks.
 * Tests that change cwd or environment variables must run serially because those values are process-wide.
 * Child processes exercise the real CLI, including prompts and exclusive file creation.
 */

import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";

import * as helpers from "./cla.ts";
import * as check from "./check_cla.ts";
import * as validate from "./validate_signatures.ts";
import * as sign from "../../sign.ts";
// Capture repository paths before sandboxed tests switch the process to temporary ledger checkouts.
const repositoryRoot = process.cwd();
const script = path.resolve("sign.ts");
// Keep fixtures until suite teardown so nested tests can share a ledger safely.
const temporaryRoots: string[] = [];
const config = { cla_root: ".", ledger_blob: "https://example.test/blob", organization_name: "Conveyal LLC" };
const individualPath = "signatures/v1.0/individual/1.md";
const corporatePath = "signatures/v1.0/corporate/acme/0001.md";

// No offline test may accidentally fall through to a live API request.
test.beforeEach((t) => {
  assert.ok("mock" in t);
  t.mock.method(global, "fetch", async () => {
    throw new Error("Unexpected network request in offline test");
  });
});
test.after(() => {
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});

/** Create a fixture file and any parent directories inside a temporary ledger. */
function write(root: string, file: string, text: string | Uint8Array) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

/** Create a minimal ledger with the real canonical agreement, synthetic configuration, and no accepted records. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cla-test-"));
  temporaryRoots.push(root);
  write(root, "cla/config.json", JSON.stringify(config));
  write(root, "versions/CURRENT", "v1.0\n");
  write(root, "versions/CLA-v1.0.md", fs.readFileSync(path.join(repositoryRoot, "versions/CLA-v1.0.md")));
  return root;
}

/** Build a valid synthetic record so each test can alter one identity, template, or coverage constraint. */
function record(root: string, version = "v1.0", corporate = false, authorized = ["3", "10"]) {
  const agreement = helpers.canonical(root, version);
  const block = corporate
    ? sign.buildCorporate(config, "octocat", "1", "acme", authorized, version, "2020-01-01")
    : sign.buildIndividual(config, "octocat", "1", version, "2020-01-01");
  return `${agreement}\n\n${block}`;
}

/**
 * Run a test against a temporary checkout with fixed workflow inputs.
 * Restore cwd and the complete environment after the test, including removal of newly introduced variables.
 */
function sandbox(t: TestContext, root: string) {
  const oldCwd = process.cwd();
  const oldEnvironment = { ...process.env };
  process.chdir(root);
  for (const key of ["CLA_CONFIG", "CLA_PROMPT", "SIGNATURE_PATH_PREFIX"]) delete process.env[key];
  Object.assign(process.env, {
    CLA_ROOT: ".", REPO: "conveyal/CLA-Ledger", PR: "1", AUTHOR: "octocat", AUTHOR_ID: "1",
    HEAD_REPO: "octocat/fork", HEAD_SHA: "head-sha", BASE_SHA: "base-sha",
    SIGNING_URL: "https://example.test/CLA.md", SIGNATURE_ONLY_PR: "false",
  });
  t.after(() => {
    process.chdir(oldCwd);
    for (const key of Object.keys(process.env)) if (!(key in oldEnvironment)) delete process.env[key];
    Object.assign(process.env, oldEnvironment);
  });
}

/** Overrides for complete PR fixtures, inconsistent metadata, changed revisions, and proposed record content. */
interface MockPROptions {
  files?: helpers.FileChange[];
  commits?: helpers.Commit[];
  metadata?: Partial<helpers.PullRequestSnapshot>;
  latestMetadata?: helpers.PullRequestSnapshot;
  truncatedTree?: boolean;
  mode?: string;
  record?: string | Record<string, string>;
}

/** Captured API request fields used to assert comment writes and revision-pinned reads. */
interface RecordedRequest {
  url: string;
  method: string;
  body?: RequestInit["body"];
}

/**
 * Install a test-scoped GitHub mock with pagination, metadata snapshots, Git tree entries, and file content.
 * Metadata overrides are independent of item lists so tests can simulate truncated API responses.
 * Unexpected read endpoints throw; captured requests expose the check's API behavior.
 */
function mockPR(t: TestContext, options: MockPROptions = {}) {
  const files = options.files || [{ filename: individualPath, status: "added" }];
  const commits = options.commits || [{ sha: "commit-1", author: { login: "octocat", id: 1, type: "User" } }];
  const metadata = {
    head: { sha: "head-sha", repo: { full_name: "octocat/fork" } }, base: { sha: "base-sha" },
    commits: commits.length, changed_files: files.length, ...options.metadata,
  };
  const requests: RecordedRequest[] = [];
  // A second metadata read can return a changed PR to exercise the final revision check.
  let metadataReads = 0;
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], request: RequestInit = {}) => {
    const parsed = new URL(String(url));
    requests.push({ url: String(url), method: request.method || "GET", body: request.body });
    if (request.method === "POST" || request.method === "PATCH") return Response.json({});
    if (parsed.pathname === "/repos/conveyal/CLA-Ledger/pulls/1") {
      metadataReads += 1;
      return Response.json(metadataReads > 1 && options.latestMetadata ? options.latestMetadata : metadata);
    }
    if (parsed.pathname.endsWith("/pulls/1/files") || parsed.pathname.endsWith("/pulls/1/commits")) {
      const items = parsed.pathname.endsWith("/files") ? files : commits;
      const start = (Number(parsed.searchParams.get("page")) - 1) * 100;
      return Response.json(items.slice(start, start + 100));
    }
    if (parsed.pathname.endsWith("/comments")) return Response.json([]);
    if (parsed.pathname.includes("/git/trees/")) {
      return Response.json({ truncated: Boolean(options.truncatedTree), tree: files.map((file) => ({
        path: file.filename, mode: options.mode || "100644", type: "blob", sha: "blob-sha",
      })) });
    }
    if (parsed.pathname.includes("/contents/")) {
      assert.equal(parsed.searchParams.get("ref"), "head-sha");
      const filename = parsed.pathname.split("/contents/")[1];
      const text = typeof options.record === "object" ? options.record[filename] : options.record;
      assert.ok(typeof text === "string", `Missing fixture content for ${filename}`);
      return Response.json({ content: Buffer.from(text).toString("base64"), encoding: "base64", sha: "blob-sha" });
    }
    throw new Error(`Unexpected API request: ${url}`);
  });
  return { requests, metadata };
}

/**
 * Execute the real signing CLI with this test process's Node binary in a temporary checkout.
 * Clear inherited config and prompt overrides; callers can explicitly supply subprocess options for individual cases.
 */
function runSign(root: string, args: string[], extra: Omit<SpawnSyncOptionsWithStringEncoding, "cwd" | "encoding"> = {}) {
  const env = { ...process.env };
  delete env.CLA_CONFIG;
  delete env.CLA_PROMPT;
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", env, ...extra });
}

test("current versions and dates are validated", () => {
  const root = fixture();
  assert.equal(helpers.currentVersion(root), "v1.0");
  assert.equal(helpers.validDate("2020-01-01"), true);
  assert.equal(helpers.validDate("2020-02-30"), false);
  assert.equal(helpers.validDate("not-a-date"), false);
  assert.equal(helpers.validDate("2999-01-01"), false);
});

test("individual coverage requires canonical text, matching identity, link, version, and date", () => {
  const root = fixture();
  const text = record(root);
  const agreement = helpers.canonical(root, "v1.0");
  write(root, individualPath, text);
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1"]));
  assert.equal(validate.individualError(text, agreement, "v1.0", "octocat", "1"), null);
  for (const invalid of [
    text.replace("GitHub login: octocat", "GitHub login: someone-else"),
    text.replace("GitHub account ID: 1", "GitHub account ID: 2"),
    text.replace("https://example.test/blob", "https://invalid.test/blob"),
    text.replace("CLA version: v1.0", "CLA version: v0.9"),
    text.replace("2020-01-01", "2999-01-01"),
    text.replace(agreement, "tampered agreement"),
    text + "tampered",
  ]) {
    write(root, individualPath, invalid);
    assert.deepEqual(helpers.records(root, "v1.0"), new Set());
  }
});

test("corporate coverage requires the matching slug and sorted authorized IDs", () => {
  const root = fixture();
  const text = record(root, "v1.0", true);
  write(root, corporatePath, text);
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1", "3", "10"]));
  const agreement = helpers.canonical(root, "v1.0");
  assert.equal(validate.corporateError(text, agreement, "v1.0", "octocat", "1", "acme"), null);
  const error = validate.corporateError(text, agreement, "v1.0", "octocat", "1", "other");
  assert.ok(error);
  assert.match(error, /exactly match/);
  write(root, corporatePath, text.replace("1, 3, 10", "10, 3, 1"));
  assert.deepEqual(helpers.records(root, "v1.0"), new Set());
});

test("only the latest corporate snapshot supplies coverage, with no fallback if malformed", () => {
  const root = fixture();
  const original = record(root, "v1.0", true, ["3", "10"]);
  write(root, corporatePath, original);
  write(root, "signatures/v1.0/corporate/acme/0002.md", record(root, "v1.0", true, ["4"]));
  write(root, "signatures/v1.0/individual/3.md", record(root).replaceAll("account ID: 1", "account ID: 3"));
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1", "3", "4"]));
  assert.equal(fs.readFileSync(path.join(root, corporatePath), "utf8"), original);
  write(root, "signatures/v1.0/corporate/acme/0002.md", "malformed newest snapshot");
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["3"]));
});

test("record symlinks cannot provide coverage", () => {
  const root = fixture();
  write(root, "outside.md", record(root));
  fs.mkdirSync(path.dirname(path.join(root, individualPath)), { recursive: true });
  fs.symlinkSync(path.join(root, "outside.md"), path.join(root, individualPath));
  assert.throws(() => helpers.records(root, "v1.0"), /regular file/);
});

test("signature validation accepts new records for root and nested ledger paths", async (t) => {
  for (const prefix of ["", "cla/"]) {
    await t.test(prefix || "root", async (t) => {
      const root = fixture();
      if (prefix) {
        write(root, "cla/versions/CURRENT", "v1.0\n");
        write(root, "cla/versions/CLA-v1.0.md", helpers.canonical(root, "v1.0"));
        write(root, "cla/config.json", JSON.stringify({ ...config, cla_root: "cla" }));
      }
      const text = record(root).replace("/blob/versions/", `/blob/${prefix}versions/`);
      sandbox(t, root);
      process.env.CLA_ROOT = prefix ? "cla" : ".";
      mockPR(t, { files: [{ filename: prefix + individualPath, status: "added" }], record: text });
      assert.equal(await validate.main(), 0);
    });
  }
});

test("signature-only PRs skip author gating only after complete file and stable-head checks", async (t) => {
  const root = fixture();
  sandbox(t, root);
  process.env.SIGNATURE_ONLY_PR = "true";
  const { requests } = mockPR(t);
  assert.equal(await check.main(), 0);
  assert.equal(requests.filter((item) => new URL(item.url).pathname.endsWith("/pulls/1")).length, 2);
  assert.equal(requests.some((item) => item.url.includes("/commits?")), false);
});

test("bot authors are exempt while uncovered humans and unmapped authors fail", async (t) => {
  const root = fixture();
  sandbox(t, root);
  const { requests } = mockPR(t, {
    files: [{ filename: "src/main.java", status: "modified" }],
    commits: [
      { sha: "bot-sha", author: { login: "dependabot[bot]", id: 10, type: "Bot" } },
      { sha: "human-sha", author: { login: "octocat", id: 1, type: "User" } },
      { sha: "unknown-sha", author: null },
    ],
  });
  assert.equal(await check.main(), 1);
  const comment = requests.find((item) => item.method === "POST");
  assert.ok(comment && typeof comment.body === "string");
  assert.match(comment.body, /octocat/);
  assert.match(comment.body, /unknown-sha/);
  assert.doesNotMatch(comment.body, /dependabot/);
});

test("complete 250-commit PRs pass, including authors on the final page", async (t) => {
  const root = fixture();
  sandbox(t, root);
  write(root, individualPath, record(root));
  const commits = Array.from({ length: 250 }, (_,i) => ({
    sha: `commit-${i}`, author: i === 249
      ? { login: "octocat", id: 1, type: "User" }
      : { login: "dependabot[bot]", id: 10, type: "Bot" },
  }));
  const { requests } = mockPR(t, { files: [{ filename: "src/main.java", status: "modified" }], commits });
  assert.equal(await check.main(), 0);
  assert.equal(requests.filter((item) => item.url.includes("/commits?")).length, 4);
});

test("distinct changed files with identical blob SHAs do not count as duplicates", async (t) => {
  const root = fixture();
  sandbox(t, root);
  write(root, individualPath, record(root));
  const files = [
    { filename: "src/a.java", status: "modified", sha: "same-blob" },
    { filename: "src/b.java", status: "modified", sha: "same-blob" },
  ];
  mockPR(t, { files });
  assert.equal(await check.main(), 0);
});

test("251-commit PRs fail closed instead of trusting a truncated 250-commit list", async (t) => {
  const root = fixture();
  sandbox(t, root);
  write(root, individualPath, record(root));
  const { requests } = mockPR(t, {
    files: [{ filename: "src/main.java", status: "modified" }],
    commits: Array.from({ length: 250 }, (_,i) => ({ sha: `commit-${i}`, author: { id: 1, type: "User" } })),
    metadata: { commits: 251 },
  });
  await assert.rejects(check.main, /API limit is 250.*251/);
  assert.equal(requests.some((item) => item.url.includes("/commits?")), false);
});

test("incomplete or duplicate commit lists fail closed below the API limit", async (t) => {
  for (const commits of [[], [{ sha: "same", author: { type: "Bot" } }, { sha: "same", author: { type: "Bot" } }]]) {
    await t.test(`returned ${commits.length}`, async (t) => {
      const root = fixture();
      sandbox(t, root);
      mockPR(t, { files: [{ filename: "src/main.java", status: "modified" }], commits, metadata: { commits: 2 } });
      await assert.rejects(check.main, /incomplete or inconsistent PR commits/);
    });
  }
});

test("both gates reject incomplete, duplicate, oversized, or excess file lists", async (t) => {
  const cases = [
    { files: [{ filename: individualPath, status: "added" }], metadata: { changed_files: 2 } },
    { files: [{ filename: individualPath, status: "added" }, { filename: individualPath, status: "added" }] },
    { metadata: { changed_files: 3001 } },
    { metadata: { changed_files: 0 } },
  ];
  for (const [index, options] of cases.entries()) {
    await t.test(`case ${index}`, async (t) => {
      const root = fixture();
      sandbox(t, root);
      process.env.SIGNATURE_ONLY_PR = "true";
      mockPR(t, options);
      for (const main of [check.main, validate.main]) {
        await assert.rejects(main, /PR files|API limit is 3000|too many items/);
      }
    });
  }
});

test("both gates reject stale workflow targets before inspecting files", async (t) => {
  for (const metadata of [
    { head: { sha: "new-head", repo: { full_name: "octocat/fork" } } },
    { base: { sha: "new-base" } },
    { head: { sha: "head-sha", repo: { full_name: "different/fork" } } },
  ]) {
    await t.test(JSON.stringify(metadata), async (t) => {
      const root = fixture();
      sandbox(t, root);
      const { requests } = mockPR(t, { metadata });
      for (const main of [check.main, validate.main]) await assert.rejects(main, /changed since this workflow started/);
      assert.equal(requests.some((item) => item.url.includes("/files?")), false);
    });
  }
});

test("head, base, or count changes during validation prevent both gates from passing", async (t) => {
  for (const change of [
    { head: { sha: "new-head", repo: { full_name: "octocat/fork" } } },
    { base: { sha: "new-base" } },
    { commits: 2 },
    { changed_files: 2 },
  ]) {
    for (const main of [check.main, validate.main]) {
      await t.test(`${main === check.main ? "coverage" : "signature"} ${JSON.stringify(change)}`, async (t) => {
        const root = fixture();
        sandbox(t, root);
        process.env.SIGNATURE_ONLY_PR = "true";
        mockPR(t, { record: record(root), latestMetadata: {
          head: { sha: "head-sha", repo: { full_name: "octocat/fork" } }, base: { sha: "base-sha" },
          commits: 1, changed_files: 1, ...change,
        } });
        await assert.rejects(main, /changed during validation/);
      });
    }
  }
});

test("ordinary coverage success also rechecks PR stability", async (t) => {
  const root = fixture();
  sandbox(t, root);
  write(root, individualPath, record(root));
  mockPR(t, { files: [{ filename: "src/main.java", status: "modified" }], latestMetadata: {
    head: { sha: "new-head", repo: { full_name: "octocat/fork" } }, base: { sha: "base-sha" }, commits: 1, changed_files: 1,
  } });
  await assert.rejects(check.main, /changed during validation/);
});

test("record edits, deletions, and renames in either direction are rejected without reading head content", async (t) => {
  const changes = [
    { filename: individualPath, status: "modified" },
    { filename: individualPath, status: "removed" },
    { filename: individualPath, status: "renamed", previous_filename: "notes.md" },
    { filename: "notes.md", status: "renamed", previous_filename: individualPath },
  ];
  for (const change of changes) {
    await t.test(`${change.status} ${change.filename}`, async (t) => {
      const root = fixture();
      sandbox(t, root);
      const { requests } = mockPR(t, { files: [change] });
      assert.equal(await validate.main(), 1);
      assert.equal(requests.some((item) => item.url.includes("/contents/")), false);
    });
  }
});

test("an added file that already exists on the trusted base is rejected", async (t) => {
  const root = fixture();
  sandbox(t, root);
  write(root, individualPath, record(root));
  mockPR(t);
  assert.equal(await validate.main(), 1);
});

test("renames into signatures never receive the contributor exemption", async (t) => {
  const root = fixture();
  sandbox(t, root);
  process.env.SIGNATURE_ONLY_PR = "true";
  const { requests } = mockPR(t, { files: [{ filename: individualPath, status: "renamed", previous_filename: "src/main.java" }] });
  assert.equal(await check.main(), 1);
  assert.ok(requests.some((item) => item.url.includes("/commits?")));
});

test("signature path, account, record version, and current version must agree", async (t) => {
  for (const [filename, version] of [
    ["signatures/v0.9/individual/1.md", "v1.0"],
    [individualPath, "v0.9"],
    ["signatures/v1.0/individual/2.md", "v1.0"],
    ["signatures/individual/1.md", "v1.0"],
  ]) {
    await t.test(`${filename} ${version}`, async (t) => {
      const root = fixture();
      sandbox(t, root);
      mockPR(t, { files: [{ filename, status: "added" }], record: record(root).replace("CLA version: v1.0", `CLA version: ${version}`) });
      assert.equal(await validate.main(), 1);
    });
  }
});

test("corporate validation accepts only the next snapshot and preserves prior coverage evidence", async (t) => {
  for (const filename of ["0002.md", "0003.md", "0000.md"]) {
    await t.test(filename, async (t) => {
      const root = fixture();
      sandbox(t, root);
      const original = record(root, "v1.0", true);
      write(root, corporatePath, original);
      mockPR(t, { files: [{ filename: `signatures/v1.0/corporate/acme/${filename}`, status: "added" }], record: record(root, "v1.0", true, ["4"]) });
      assert.equal(await validate.main(), filename === "0002.md" ? 0 : 1);
      assert.equal(fs.readFileSync(path.join(root, corporatePath), "utf8"), original);
    });
  }
});

test("a PR cannot add multiple snapshots for the same organization and version", async (t) => {
  const root = fixture();
  sandbox(t, root);
  mockPR(t, { files: [
    { filename: corporatePath, status: "added" },
    { filename: "signatures/v1.0/corporate/acme/0002.md", status: "added" },
  ], record: record(root, "v1.0", true) });
  assert.equal(await validate.main(), 1);
});

test("corporate snapshot numbering and coverage remain numeric beyond four digits", () => {
  const root = fixture();
  const directory = "signatures/v1.0/corporate/acme";
  write(root, `${directory}/9999.md`, record(root, "v1.0", true, ["3"]));
  assert.equal(helpers.nextCorporateSnapshot(path.join(root, directory)), "10000.md");
  write(root, `${directory}/10000.md`, record(root, "v1.0", true, ["4"]));
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1", "4"]));
});

test("signature validation rejects symlinks and truncated head trees", async (t) => {
  for (const options of [{ mode: "120000" }, { truncatedTree: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const root = fixture();
      sandbox(t, root);
      mockPR(t, { ...options, record: record(root) });
      await assert.rejects(validate.main, /regular file|incomplete head tree/);
    });
  }
});

test("API failures and invalid metadata cannot produce success", async (t) => {
  const root = fixture();
  sandbox(t, root);
  for (const response of [
    () => new Response("unavailable", { status: 503, statusText: "Service Unavailable" }),
    () => Response.json({}),
    () => new Response("not json", { status: 200 }),
  ]) {
    t.mock.method(global, "fetch", async () => response());
    for (const main of [check.main, validate.main]) await assert.rejects(main, /GitHub API 503|incomplete pull request metadata|invalid JSON/);
  }
});

test("malformed API file entries and author identities fail closed", async (t) => {
  const cases = [
    { kind: "files", value: { filename: individualPath, status: null } },
    { kind: "commits", value: { sha: "commit-1", author: "octocat" } },
    { kind: "commits", value: { sha: "commit-1", author: { id: "1", type: "User" } } },
  ];
  for (const { kind, value } of cases) {
    await t.test(JSON.stringify(value), async (t) => {
      const root = fixture();
      sandbox(t, root);
      mockPR(t, { files: [{ filename: "src/main.java", status: "modified" }] });
      const fallback = global.fetch;
      t.mock.method(global, "fetch", async (...args: Parameters<typeof fetch>) => {
        const url = new URL(String(args[0]));
        if (url.pathname.endsWith(`/pulls/1/${kind}`) && url.searchParams.get("page") === "1") {
          return Response.json([value]);
        }
        return fallback(...args);
      });
      await assert.rejects(check.main, /incomplete or inconsistent PR/);
    });
  }
});

test("invalid configuration cannot supply coverage", () => {
  const root = fixture();
  write(root, individualPath, record(root));
  write(root, "cla/config.json", JSON.stringify({ ...config, ledger_blob: 42 }));
  assert.throws(() => helpers.records(root, "v1.0"), /nonempty strings/);
});

test("pagination reads every page", async (t) => {
  const requests: string[] = [];
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0]) => {
    requests.push(String(url));
    const page = new URL(String(url)).searchParams.get("page");
    return Response.json(page === "1" ? [{ id: 1 }] : page === "2" ? [{ id: 2 }] : []);
  });
  assert.deepEqual(await helpers.pages("/test"), [{ id: 1 }, { id: 2 }]);
  assert.equal(requests.length, 3);
});

test("comment updates replace the existing marker comment", async (t) => {
  const requests: RecordedRequest[] = [];
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).includes("/comments?")) {
      return Response.json(new URL(String(url)).searchParams.get("page") === "1"
        ? [{ id: 7, body: "<!-- conveyal-cla-check -->\nold" }] : []);
    }
    return Response.json({});
  });
  await helpers.updateComment("conveyal/r5", "42", "new body");
  const update = requests.find((request) => request.method === "PATCH");
  assert.ok(update && typeof update.body === "string");
  assert.match(update.url, /issues\/comments\/7$/);
  assert.match(update.body, /new body/);
});

test("argument parsing supports prompting, flags, and rejects force", () => {
  assert.deepEqual(sign.parseArgs(["octocat", "--id", "1", "--authorized-id", "2", "--authorized-id", "3", "--corporate"]), {
    authorizedIds: ["2", "3"], corporate: true, login: "octocat", id: "1",
  });
  const empty = sign.parseArgs([]);
  assert.equal(empty.login, undefined);
  assert.equal(empty.corporate, undefined);
  assert.throws(() => sign.parseArgs(["--force"]), /Unknown option/);
});

test("signing CLI supports prompted, nested, and non-interactive modes", () => {
  const root = fixture();
  write(root, "cla/versions/CURRENT", "v1.0\n");
  write(root, "cla/versions/CLA-v1.0.md", helpers.canonical(root, "v1.0"));
  write(root, "cla/config.json", JSON.stringify({ ...config, cla_root: "cla" }));
  const prompted = runSign(root, ["--id", "123"], {
    input: "octocat\nindividual\n", env: { ...process.env, CLA_PROMPT: "1" },
  });
  assert.equal(prompted.status, 0, prompted.stderr);
  assert.ok(fs.existsSync(path.join(root, "cla/signatures/v1.0/individual/123.md")));
  const noArgs = runSign(root, [], { input: "octocat\nindividual\n124\n", env: { ...process.env, CLA_PROMPT: "1" } });
  assert.equal(noArgs.status, 0, noArgs.stderr);
  assert.ok(fs.existsSync(path.join(root, "cla/signatures/v1.0/individual/124.md")));
  const explicit = runSign(root, ["octocat", "--id", "125", "--individual"]);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.ok(fs.existsSync(path.join(root, "cla/signatures/v1.0/individual/125.md")));
  const missing = runSign(root, [], { input: "" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing required arguments/);
});

test("signing a newer version preserves the original bytes and older records do not cover it", () => {
  const root = fixture();
  const args = ["octocat", "--id", "1", "--individual"];
  let result = runSign(root, args);
  assert.equal(result.status, 0, result.stderr);
  const original = fs.readFileSync(path.join(root, individualPath));
  result = runSign(root, args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /append-only/);
  assert.deepEqual(fs.readFileSync(path.join(root, individualPath)), original);
  write(root, "versions/CLA-v1.1.md", helpers.canonical(root, "v1.0").replaceAll("version 1.0", "version 1.1"));
  write(root, "versions/CURRENT", "v1.1\n");
  assert.deepEqual(helpers.records(root, "v1.1"), new Set());
  result = runSign(root, args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(root, individualPath)), original);
  assert.ok(fs.existsSync(path.join(root, "signatures/v1.1/individual/1.md")));
  assert.deepEqual(helpers.records(root, "v1.1"), new Set(["1"]));
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1"]));
});

test("corporate CLI updates append snapshots and replace the current authorization set", () => {
  const root = fixture();
  const args = ["octocat", "--id", "1", "--corporate", "--organization", "acme", "--authorized-id", "3"];
  let result = runSign(root, args);
  assert.equal(result.status, 0, result.stderr);
  const original = fs.readFileSync(path.join(root, corporatePath));
  result = runSign(root, [...args.slice(0, -1), "4"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(root, corporatePath)), original);
  assert.ok(fs.existsSync(path.join(root, "signatures/v1.0/corporate/acme/0002.md")));
  assert.deepEqual(helpers.records(root, "v1.0"), new Set(["1", "4"]));
});

test("workflow wiring binds the trusted base and run head with separate ledger data", () => {
  const reusable = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/check-contributors.yml"), "utf8");
  const signature = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/validate-signature.yml"), "utf8");
  for (const workflow of [reusable, signature]) {
    assert.match(workflow, /uses: pnpm\/setup@v3/);
    assert.match(workflow, /working-directory: \.cla-ledger\n\s+install: false/);
    assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.match(workflow, /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
    assert.match(workflow, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  }
  assert.match(reusable, /path: \.cla-ledger-data/);
  assert.match(signature, /HEAD_REPO/);
  assert.doesNotMatch(reusable + signature, /pull_request\.head\.sha.*actions\/checkout/);
});
