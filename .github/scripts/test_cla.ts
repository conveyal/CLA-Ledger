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
import { individualRecord, individualEditorUrl } from "./signature_record.ts";
import * as prepareCheck from "./prepare_check.ts";
import * as runCheck from "./run_check.ts";
import * as refreshProjects from "./refresh_projects.ts";
// Capture repository paths before sandboxed tests switch the process to temporary ledger checkouts.
const repositoryRoot = process.cwd();
const fixtureVersion = helpers.currentVersion(repositoryRoot);
const script = path.resolve("sign.ts");
// Keep fixtures until suite teardown so nested tests can share a ledger safely.
const temporaryRoots: string[] = [];
const config = { cla_root: ".", ledger_blob: "https://example.test/blob", organization_name: "EBP US Inc." };
const individualPath = `signatures/${fixtureVersion}/individual/1.md`;

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
  write(root, "versions/CURRENT", `${fixtureVersion}\n`);
  write(root, `versions/CLA-${fixtureVersion}.md`, fs.readFileSync(path.join(repositoryRoot, `versions/CLA-${fixtureVersion}.md`)));
  return root;
}

/** Build a valid synthetic record so each test can alter one identity, template, or coverage constraint. */
function record(root: string, version = fixtureVersion) {
  const agreement = helpers.canonical(root, version);
  return `${agreement}\n\n${sign.buildIndividual(config, "octocat", "1", version, "2020-01-01")}`;
}

/**
 * Run a test against a temporary checkout with fixed workflow inputs.
 * Restore cwd and the complete environment after the test, including removal of newly introduced variables.
 */
function sandbox(t: TestContext, root: string) {
  const oldCwd = process.cwd();
  const oldEnvironment = { ...process.env };
  process.chdir(root);
  for (const key of ["CLA_CONFIG", "CLA_PROMPT", "SIGNATURE_PATH_PREFIX", "EVENT_HEAD_SHA", "EVENT_HEAD_REPO", "EDITOR_LINKS"]) delete process.env[key];
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
  comments?: { id: number; body: string; user: { login: string } }[];
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
  const repo = process.env.REPO || "conveyal/CLA-Ledger";
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
    if (request.method === "DELETE") return new Response(null, { status: 204 });
    if (request.method === "POST" || request.method === "PATCH") return Response.json({});
    if (parsed.pathname === `/repos/${repo}/pulls/1`) {
      metadataReads += 1;
      return Response.json(metadataReads > 1 && options.latestMetadata ? options.latestMetadata : metadata);
    }
    if (parsed.pathname.endsWith("/pulls/1/files") || parsed.pathname.endsWith("/pulls/1/commits")) {
      const items = parsed.pathname.endsWith("/files") ? files : commits;
      const start = (Number(parsed.searchParams.get("page")) - 1) * 100;
      return Response.json(items.slice(start, start + 100));
    }
    if (parsed.pathname.endsWith("/comments")) {
      const start = (Number(parsed.searchParams.get("page")) - 1) * 100;
      return Response.json((options.comments || []).slice(start, start + 100));
    }
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
  assert.equal(helpers.currentVersion(root), fixtureVersion);
  assert.equal(helpers.validDate("2020-01-01"), true);
  assert.equal(helpers.validDate("2020-02-30"), false);
  assert.equal(helpers.validDate("not-a-date"), false);
  assert.equal(helpers.validDate("2999-01-01"), false);
});

test("the current agreement matches the public signing document", () => {
  const version = helpers.currentVersion(repositoryRoot);
  assert.equal(fs.readFileSync(path.join(repositoryRoot, "CLA.md"), "utf8").trimEnd(), helpers.canonical(repositoryRoot, version));
});

test("the agreement names EBP as the legal party while retaining Conveyal project scope", () => {
  const agreement = helpers.canonical(repositoryRoot, helpers.currentVersion(repositoryRoot));
  const settings = helpers.parseConfig(JSON.parse(fs.readFileSync(path.join(repositoryRoot, "cla/config.json"), "utf8")), "cla/config.json");
  assert.equal(settings.organization_name, "EBP US Inc.");
  assert.match(agreement, /rights you grant to EBP US Inc\.\s+\("EBP"\)/);
  assert.match(agreement, /github\.com Conveyal\s+organization\s+\(`conveyal`\)/);
  assert.match(agreement, /authorized Conveyal maintainers accept the offer\s+on behalf of EBP/);
  assert.match(agreement, /does not cover unrelated EBP\s+projects outside that organization/);
  assert.doesNotMatch(agreement, /Conveyal LLC|You grant Conveyal/);
});

test("the agreement explicitly covers all current and future public repositories with one signature", () => {
  const agreement = helpers.canonical(repositoryRoot, helpers.currentVersion(repositoryRoot));
  assert.match(agreement, /"Covered project" means any public repository in the github\.com Conveyal\s+organization \(`conveyal`\)/);
  assert.match(agreement, /including future additions/);
  assert.match(agreement, /One accepted signature per Agreement version covers all covered projects/);
  assert.match(agreement, /no separate repository signatures are required/);
  assert.match(agreement, /Workflow and refresh\s+enrollment do not limit\s+coverage/);
  assert.doesNotMatch(agreement, /[Cc]orporate|authorized representative/);
  assert.doesNotMatch(agreement, /\bR5\b|organization-wide program/);
});

test("validators reject signature scope outside the Conveyal organization", () => {
  const root = fixture();
  const agreement = helpers.canonical(root, fixtureVersion);
  const text = record(root);
  const validateRecord = (value: string) => validate.individualError(value, agreement, fixtureVersion, "octocat", "1");
  assert.equal(validateRecord(text), null);
  for (const scope of ["EBP's organization-wide open-source projects", "Conveyal's organization-wide open-source projects"]) {
    const altered = text.replace("for public repositories in the Conveyal GitHub organization.", `for ${scope}.`);
    assert.notEqual(altered, text);
    assert.notEqual(validateRecord(altered), null);
    write(root, individualPath, altered);
    assert.deepEqual(helpers.records(root, fixtureVersion), new Set());
  }
});

test("editor links round-trip the complete canonical record and pass signer validation", () => {
  const settings = { ...config, ledger_blob: "https://github.com/conveyal/cla-test/blob/main" };
  const agreement = `${helpers.canonical(fixture(), fixtureVersion)}\n\nFormatting: ✓ + & # %\n\n`;
  const prepared = individualRecord(settings, agreement, "octocat", "1", fixtureVersion, "2020-01-01");
  const url = new URL(individualEditorUrl(settings, prepared));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/conveyal/cla-test/new/main");
  assert.equal(url.searchParams.get("filename"), individualPath);
  assert.equal(url.searchParams.get("value"), prepared.text);
  assert.equal(validate.individualError(prepared.text, agreement.trimEnd(), fixtureVersion, "octocat", "1", helpers.recordLink(settings, fixtureVersion)), null);
  assert.notEqual(validate.individualError(prepared.text, agreement.trimEnd(), fixtureVersion, "someone-else", "2"), null);
});

test("editor links preserve nested ledger paths and reject unsafe destinations", () => {
  const settings = { ...config, cla_root: "cla", ledger_blob: "https://github.com/conveyal/cla-test/blob/main/" };
  const record = individualRecord(settings, "Agreement", "octocat", "1", fixtureVersion, "2020-01-01");
  const safe = { ...settings, ledger_blob: settings.ledger_blob.replace(/\/$/, "") };
  assert.equal(new URL(individualEditorUrl(safe, record)).searchParams.get("filename"), `cla/${individualPath}`);
  for (const ledger_blob of ["https://evil.test/o/r/blob/main", "https://github.com/o/r/blob/main?value=x", "https://github.com/o/r/blob/main#x", "https://github.com/o/r/blob/feature/branch"]) {
    assert.throws(() => individualEditorUrl({ ...safe, ledger_blob }, record), /ledger_blob/);
  }
  assert.throws(() => individualEditorUrl({ ...safe, cla_root: "../cla" }, record), /ledger root/);
  assert.throws(() => individualEditorUrl(safe, { ...record, path: "../README.md" }), /record path/);
});

test("generated individual records reject invalid identities, versions, dates, and empty agreements", () => {
  for (const args of [
    ["bad\nlogin", "1", fixtureVersion, "2020-01-01"],
    ["octocat", "0", fixtureVersion, "2020-01-01"],
    ["octocat", "1", `../../${fixtureVersion}`, "2020-01-01"],
    ["octocat", "1", fixtureVersion, "2999-01-01"],
  ]) {
    assert.throws(() => individualRecord(config, "Agreement", args[0], args[1], args[2], args[3]));
  }
  assert.throws(() => individualRecord(config, " ", "octocat", "1", fixtureVersion, "2020-01-01"), /empty/);
});

test("individual coverage requires canonical text, matching identity, link, version, and date", () => {
  const root = fixture();
  const text = record(root);
  const agreement = helpers.canonical(root, fixtureVersion);
  write(root, individualPath, text);
  assert.deepEqual(helpers.records(root, fixtureVersion), new Set(["1"]));
  assert.equal(validate.individualError(text, agreement, fixtureVersion, "octocat", "1"), null);
  for (const invalid of [
    text.replace("GitHub login: octocat", "GitHub login: someone-else"),
    text.replace("GitHub account ID: 1", "GitHub account ID: 2"),
    text.replace("https://example.test/blob", "https://invalid.test/blob"),
    text.replace(`CLA version: ${fixtureVersion}`, "CLA version: v0.0"),
    text.replace("2020-01-01", "2999-01-01"),
    text.replace(agreement, "tampered agreement"),
    text + "tampered",
  ]) {
    write(root, individualPath, invalid);
    assert.deepEqual(helpers.records(root, fixtureVersion), new Set());
  }
});

test("record symlinks cannot provide coverage", () => {
  const root = fixture();
  write(root, "outside.md", record(root));
  fs.mkdirSync(path.dirname(path.join(root, individualPath)), { recursive: true });
  fs.symlinkSync(path.join(root, "outside.md"), path.join(root, individualPath));
  assert.throws(() => helpers.records(root, fixtureVersion), /regular file/);
});

test("signature validation maintains one bot comment and resolves legacy failures", async (t) => {
  const marker = "<!-- conveyal-cla-signature-validation -->";
  const bot = { login: "github-actions[bot]" };
  for (const outcome of ["failure", "valid", "no records"]) {
    for (const existing of ["none", "legacy", "marked"]) {
      await t.test(`${outcome}, ${existing}`, async (t) => {
        const root = fixture();
        sandbox(t, root);
        const human = { id: 1, body: "CLA signature validation failed: human quotation", user: { login: "octocat" } };
        const coverage = { id: 2, body: "<!-- conveyal-cla-check -->\ncoverage", user: bot };
        const old = { id: 3, body: "CLA signature validation failed:\nold error", user: bot };
        const marked = { id: 4, body: `${marker}\nCLA signature validation failed:\nother error`, user: bot };
        const comments = [human, coverage, ...(existing === "none" ? [] : [old]), ...(existing === "marked" ? [marked] : [])];
        const { requests } = mockPR(t, {
          comments,
          files: outcome === "no records" ? [{ filename: "README.md", status: "modified" }] : undefined,
          record: outcome === "failure" ? "invalid record" : record(root),
        });
        assert.equal(await validate.main(), outcome === "failure" ? 1 : 0);
        const writes = requests.filter((request) => request.method !== "GET");
        if (existing === "none" && outcome !== "failure") {
          assert.equal(writes.length, 0);
          return;
        }
        const update = writes.find((request) => request.method === (existing === "none" ? "POST" : "PATCH"));
        assert.ok(update && typeof update.body === "string");
        const body = JSON.parse(update.body).body;
        assert.ok(body.startsWith(marker));
        assert.match(body, outcome === "failure" ? /CLA signature validation failed:/ : /CLA signature validation passed/);
        if (outcome !== "failure") assert.doesNotMatch(body, /old error|other error|validation failed/);
        if (existing !== "none") assert.ok(update.url.endsWith(`/issues/comments/${existing === "marked" ? 4 : 3}`));
        const deleted = writes.filter((request) => request.method === "DELETE");
        assert.deepEqual(deleted.map((request) => request.url.split("/").at(-1)), existing === "marked" ? ["3"] : []);
        assert.ok(writes.every((request) => !/\/comments\/[12]$/.test(request.url)));
      });
    }
  }
});

test("stale signature runs cannot update validation comments", async (t) => {
  for (const outcome of ["failure", "valid", "no records"]) {
    await t.test(outcome, async (t) => {
      const root = fixture();
      sandbox(t, root);
      const { requests } = mockPR(t, {
        files: outcome === "no records" ? [{ filename: "README.md", status: "modified" }] : undefined,
        record: outcome === "failure" ? "invalid record" : record(root),
        latestMetadata: {
          head: { sha: "new-head", repo: { full_name: "octocat/fork" } }, base: { sha: "base-sha" },
          commits: 1, changed_files: 1,
        },
      });
      await assert.rejects(validate.main, /changed during validation/);
      assert.ok(requests.every((request) => request.method === "GET"));
    });
  }
});

test("signature validation excludes only the ledger README from record paths", async (t) => {
  for (const prefix of ["", "cla/"]) {
    await t.test(prefix || "root", async (t) => {
      const root = fixture();
      if (prefix) {
        write(root, "cla/versions/CURRENT", `${fixtureVersion}\n`);
        write(root, `cla/versions/CLA-${fixtureVersion}.md`, helpers.canonical(root, fixtureVersion));
        write(root, "cla/config.json", JSON.stringify({ ...config, cla_root: "cla" }));
      }
      sandbox(t, root);
      process.env.CLA_ROOT = prefix ? "cla" : ".";
      mockPR(t, { files: [
        { filename: `${prefix}signatures/README.md`, status: "modified" },
        { filename: "README.md", status: "modified" },
        { filename: `${prefix}versions/CURRENT`, status: "modified" },
      ] });
      assert.equal(await validate.main(), 0);
    });
  }
});

test("the README exception cannot hide renamed or modified signature records", async (t) => {
  for (const prefix of ["", "cla/"]) {
    for (const file of [
      { filename: `${prefix}signatures/README.md`, previous_filename: prefix + individualPath, status: "renamed" },
      { filename: prefix + individualPath, previous_filename: `${prefix}signatures/README.md`, status: "renamed" },
      { filename: `${prefix}signatures/${fixtureVersion}/README.md`, status: "modified" },
    ]) {
      await t.test(JSON.stringify(file), async (t) => {
        const root = fixture();
        if (prefix) {
          write(root, "cla/versions/CURRENT", `${fixtureVersion}\n`);
          write(root, `cla/versions/CLA-${fixtureVersion}.md`, helpers.canonical(root, fixtureVersion));
          write(root, "cla/config.json", JSON.stringify({ ...config, cla_root: "cla" }));
        }
        sandbox(t, root);
        process.env.CLA_ROOT = prefix ? "cla" : ".";
        mockPR(t, { files: [file] });
        assert.equal(await validate.main(), 1);
      });
    }
  }
});

test("signature validation accepts new records for root and nested ledger paths", async (t) => {
  for (const prefix of ["", "cla/"]) {
    await t.test(prefix || "root", async (t) => {
      const root = fixture();
      if (prefix) {
        write(root, "cla/versions/CURRENT", `${fixtureVersion}\n`);
        write(root, `cla/versions/CLA-${fixtureVersion}.md`, helpers.canonical(root, fixtureVersion));
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

test("one accepted record supplies coverage across consumer repositories without refresh enrollment", async (t) => {
  const root = fixture();
  sandbox(t, root);
  const text = record(root);
  write(root, individualPath, text);
  for (const repo of ["conveyal/example-existing", "conveyal/example-new"]) {
    await t.test(repo, async (t) => {
      process.env.REPO = repo;
      const { requests } = mockPR(t, { files: [{ filename: "README.md", status: "modified" }] });
      assert.equal(await check.main(), 0);
      assert.ok(requests.some(({ url }) => new URL(url).pathname === `/repos/${repo}/pulls/1`));
      assert.equal(fs.readFileSync(path.join(root, individualPath), "utf8"), text);
      assert.equal(fs.existsSync(path.join(root, "cla/projects.json")), false);
    });
  }
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
    ["signatures/v0.0/individual/1.md", fixtureVersion],
    [individualPath, "v0.0"],
    [`signatures/${fixtureVersion}/individual/2.md`, fixtureVersion],
    ["signatures/individual/1.md", fixtureVersion],
  ]) {
    await t.test(`${filename} ${version}`, async (t) => {
      const root = fixture();
      sandbox(t, root);
      mockPR(t, { files: [{ filename, status: "added" }], record: record(root).replace(`CLA version: ${fixtureVersion}`, `CLA version: ${version}`) });
      assert.equal(await validate.main(), 1);
    });
  }
});

test("signature validation rejects corporate record paths", async (t) => {
  const root = fixture();
  sandbox(t, root);
  mockPR(t, { files: [{ filename: `signatures/${fixtureVersion}/corporate/acme/0001.md`, status: "added" }], record: record(root) });
  assert.equal(await validate.main(), 1);
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
  assert.throws(() => helpers.records(root, fixtureVersion), /nonempty strings/);
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
        ? [{ id: 7, body: "<!-- conveyal-cla-check -->\nold", user: { login: "github-actions[bot]" } }] : []);
    }
    return Response.json({});
  });
  await helpers.updateComment("conveyal/r5", "42", "new body");
  const update = requests.find((request) => request.method === "PATCH");
  assert.ok(update && typeof update.body === "string");
  assert.match(update.url, /issues\/comments\/7$/);
  assert.match(update.body, /new body/);
});

test("argument parsing supports prompting, flags, and rejects removed options", () => {
  assert.deepEqual(sign.parseArgs(["octocat", "--id", "1"]), { login: "octocat", id: "1" });
  assert.deepEqual(sign.parseArgs([]), {});
  for (const option of ["--force", "--corporate", "--individual"]) {
    assert.throws(() => sign.parseArgs([option]), /Unknown option/);
  }
});

test("signing CLI supports prompted, nested, and non-interactive modes", () => {
  const root = fixture();
  write(root, "cla/versions/CURRENT", `${fixtureVersion}\n`);
  write(root, `cla/versions/CLA-${fixtureVersion}.md`, helpers.canonical(root, fixtureVersion));
  write(root, "cla/config.json", JSON.stringify({ ...config, cla_root: "cla" }));
  const prompted = runSign(root, ["--id", "123"], {
    input: "octocat\n", env: { ...process.env, CLA_PROMPT: "1" },
  });
  assert.equal(prompted.status, 0, prompted.stderr);
  assert.ok(fs.existsSync(path.join(root, `cla/signatures/${fixtureVersion}/individual/123.md`)));
  const noArgs = runSign(root, [], { input: "octocat\n124\n", env: { ...process.env, CLA_PROMPT: "1" } });
  assert.equal(noArgs.status, 0, noArgs.stderr);
  assert.ok(fs.existsSync(path.join(root, `cla/signatures/${fixtureVersion}/individual/124.md`)));
  const explicit = runSign(root, ["octocat", "--id", "125"]);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.ok(fs.existsSync(path.join(root, `cla/signatures/${fixtureVersion}/individual/125.md`)));
  const missing = runSign(root, [], { input: "" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing required arguments/);
});

test("editor-url CLI is read-only and uses the same record as file generation", () => {
  const root = fixture();
  write(root, "cla/config.json", JSON.stringify({ ...config, ledger_blob: "https://github.com/conveyal/cla-test/blob/main" }));
  const args = ["octocat", "--id", "1"];
  const link = runSign(root, [...args, "--editor-url"]);
  assert.equal(link.status, 0, link.stderr);
  assert.equal(fs.existsSync(path.join(root, "signatures")), false);
  const generated = runSign(root, args);
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(new URL(link.stdout.trim()).searchParams.get("value"), fs.readFileSync(path.join(root, individualPath), "utf8"));
  const existing = runSign(root, [...args, "--editor-url"]);
  assert.equal(existing.status, 1);
  assert.match(existing.stderr, /already has a record/);
});

test("signing a newer version preserves the original bytes and older records do not cover it", () => {
  const root = fixture();
  const [major, minor] = fixtureVersion.slice(1).split(".").map(Number);
  const newerVersion = `v${major}.${minor + 1}`;
  const args = ["octocat", "--id", "1"];
  let result = runSign(root, args);
  assert.equal(result.status, 0, result.stderr);
  const original = fs.readFileSync(path.join(root, individualPath));
  result = runSign(root, args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /append-only/);
  assert.deepEqual(fs.readFileSync(path.join(root, individualPath)), original);
  write(root, `versions/CLA-${newerVersion}.md`, helpers.canonical(root, fixtureVersion).replaceAll(`(${fixtureVersion})`, `(${newerVersion})`));
  write(root, "versions/CURRENT", `${newerVersion}\n`);
  assert.deepEqual(helpers.records(root, newerVersion), new Set());
  result = runSign(root, args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(root, individualPath)), original);
  assert.ok(fs.existsSync(path.join(root, `signatures/${newerVersion}/individual/1.md`)));
  assert.deepEqual(helpers.records(root, newerVersion), new Set(["1"]));
  assert.deepEqual(helpers.records(root, fixtureVersion), new Set(["1"]));
});

test("workflow wiring binds the trusted base and run head with separate ledger data", () => {
  const reusable = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/check-contributors.yml"), "utf8");
  const signature = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/validate-signature.yml"), "utf8");
  for (const workflow of [reusable, signature]) {
    assert.match(workflow, /uses: pnpm\/setup@v3/);
    assert.match(workflow, /working-directory: \.cla-ledger\n\s+install: false/);
  }
  assert.match(signature, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(signature, /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(signature, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(reusable, /ref: \$\{\{ steps\.pr\.outputs\.base_sha \}\}/);
  assert.match(reusable, /HEAD_SHA: \$\{\{ steps\.pr\.outputs\.head_sha \}\}/);
  assert.match(reusable, /BASE_SHA: \$\{\{ steps\.pr\.outputs\.base_sha \}\}/);
  assert.match(reusable, /path: \.cla-ledger-data/);
  assert.match(signature, /HEAD_REPO/);
  assert.doesNotMatch(reusable + signature, /pull_request\.head\.sha.*actions\/checkout/);
});

test("personalized comments preserve canonical records and stay within their size budget", () => {
  const root = fixture();
  const old = process.env.EDITOR_LINKS;
  process.env.EDITOR_LINKS = "true";
  try {
    const settings = { ...config, ledger_blob: "https://github.com/conveyal/cla-test/blob/main" };
    write(root, "cla/config.json", JSON.stringify(settings));
    const authors = Array.from({ length: 250 }, (_, i) => ({ login: `user-${i}`, id: String(i + 1) }));
    const lines = check.signingLines(root, fixtureVersion, authors, 30000);
    assert.equal(lines.length, 250);
    assert.ok(lines.join("\n").length < 60000);
    assert.ok(lines.some((line) => line.includes("[Sign the CLA]")));
    assert.ok(lines.some((line) => line.includes("use the signing instructions")));
    const url = new URL(lines[0].match(/\[Sign the CLA\]\(([^)]+)\)/)?.[1] || "");
    assert.equal(url.searchParams.get("filename"), individualPath);
    assert.equal(validate.individualError(url.searchParams.get("value") || "", helpers.canonical(root, fixtureVersion), fixtureVersion, "user-0", "1", helpers.recordLink(settings, fixtureVersion)), null);
    write(root, `versions/CLA-${fixtureVersion}.md`, "x".repeat(6000));
    assert.doesNotMatch(check.signingLines(root, fixtureVersion, [authors[0]], 60000)[0], /\[Sign the CLA\]/);
  } finally { if (old === undefined) delete process.env.EDITOR_LINKS; else process.env.EDITOR_LINKS = old; }
});

test("success comments neither create unsolicited messages nor edit another author's marker", async (t) => {
  const requests: RecordedRequest[] = [];
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).includes("comments?") && new URL(String(url)).searchParams.get("page") === "1") {
      return Response.json([{ id: 9, body: "<!-- conveyal-cla-check -->", user: { login: "someone-else" } }]);
    }
    return Response.json([]);
  });
  await helpers.updateComment("conveyal/r5", "1", "covered", false);
  assert.equal(requests.some((r) => r.method !== "GET"), false);
});

/** Complete live metadata used to prove that dispatches cannot publish a check for another repository. */
const liveHead = "a".repeat(40);
const liveBase = "b".repeat(40);
function livePR() {
  return { number: 1, state: "open", head: { sha: liveHead, repo: { full_name: "octocat/fork" } }, base: { sha: liveBase, repo: { full_name: "conveyal/CLA-Ledger" } } };
}

test("dispatch preparation creates its check on the fresh PR head and uses the fresh trusted base", async (t) => {
  sandbox(t, fixture());
  const requests: RecordedRequest[] = [];
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    return Response.json(options.method === "POST" ? { id: 12 } : livePR());
  });
  assert.deepEqual(await prepareCheck.prepare(), { head_sha: liveHead, base_sha: liveBase, head_repo: "octocat/fork", check_id: "12" });
  const posted = requests.find((r) => r.method === "POST");
  assert.ok(posted && typeof posted.body === "string");
  assert.equal(JSON.parse(posted.body).head_sha, liveHead);
  assert.equal(JSON.parse(posted.body).name, "Conveyal CLA");
});

test("closed, foreign, incomplete, and stale-event PRs cannot start a check", async (t) => {
  for (const change of [
    { state: "closed" }, { base: { sha: liveBase, repo: { full_name: "someone/else" } } },
    { head: { sha: "bad", repo: { full_name: "octocat/fork" } } },
  ]) {
    await t.test(JSON.stringify(change), async (t) => {
      sandbox(t, fixture());
      t.mock.method(global, "fetch", async (_url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
        assert.notEqual(options.method, "POST");
        return Response.json({ ...livePR(), ...change });
      });
      await assert.rejects(prepareCheck.prepare, /complete open PR/);
    });
  }
  await t.test("stale event", async (t) => {
    sandbox(t, fixture());
    process.env.EVENT_HEAD_SHA = "c".repeat(40);
    t.mock.method(global, "fetch", async (_url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
      assert.notEqual(options.method, "POST"); return Response.json(livePR());
    });
    await assert.rejects(prepareCheck.prepare, /head changed/);
  });
});

test("the commit-bound reporter completes success and failure on its own check ID", async (t) => {
  for (const covered of [true, false]) {
    await t.test(String(covered), async (t) => {
      const root = fixture(); sandbox(t, root);
      process.env.CHECK_ID = "12"; process.env.PREVIOUS_STATUS = "success";
      if (covered) write(root, individualPath, record(root));
      const { requests } = mockPR(t, { files: [{ filename: "src/main.java", status: "modified" }] });
      assert.equal(await runCheck.main(), covered ? 0 : 1);
      const result = requests.find((r) => r.url.endsWith("/check-runs/12"));
      assert.ok(result && typeof result.body === "string");
      assert.equal(JSON.parse(result.body).conclusion, covered ? "success" : "failure");
    });
  }
});

test("checkout errors and changing revisions cannot publish a successful check", async (t) => {
  for (const checkoutFailure of [true, false]) {
    await t.test(String(checkoutFailure), async (t) => {
      const root = fixture(); sandbox(t, root); write(root, individualPath, record(root));
      process.env.CHECK_ID = "12"; process.env.PREVIOUS_STATUS = checkoutFailure ? "failure" : "success";
      const { requests } = mockPR(t, { latestMetadata: { head: { sha: "different", repo: { full_name: "octocat/fork" } }, base: { sha: "base-sha" }, commits: 1, changed_files: 1 } });
      assert.equal(await runCheck.main(), 1);
      const result = requests.find((r) => r.url.endsWith("/check-runs/12"));
      assert.ok(result && typeof result.body === "string");
      assert.equal(JSON.parse(result.body).conclusion, "failure");
    });
  }
});

test("refresh configuration refuses unknown destinations, malformed refs, and duplicates", () => {
  const project = { repository: "conveyal/r5", workflow: "cla.yml", ref: "dev", enabled: true };
  assert.deepEqual(refreshProjects.projects([project]), [project]);
  for (const bad of [null, [project, project], [{ ...project, repository: "other/r5" }], [{ ...project, workflow: "../../file.yml" }], [{ ...project, ref: "dev\nother" }], [{ ...project, enabled: "true" }]]) {
    assert.throws(() => refreshProjects.projects(bad));
  }
});

test("refresh paginates open PRs and dispatches only the configured workflow and branch", async (t) => {
  const requests: RecordedRequest[] = [];
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
    requests.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (options.method === "POST") return new Response(null, { status: 204 });
    return Response.json(new URL(String(url)).searchParams.get("page") === "1" ? [{ number: 1, state: "open" }, { number: 2, state: "open" }] : []);
  });
  const project = { repository: "conveyal/r5", workflow: "cla.yml", ref: "dev", enabled: true };
  assert.equal(await refreshProjects.refresh(project), 2);
  const posts = requests.filter((r) => r.method === "POST");
  assert.equal(posts.length, 2);
  assert.ok(posts.every((r) => r.url.endsWith("/actions/workflows/cla.yml/dispatches")));
  assert.deepEqual(posts.map((r) => JSON.parse(String(r.body))), [{ ref: "dev", inputs: { pr_number: "1" } }, { ref: "dev", inputs: { pr_number: "2" } }]);
  requests.length = 0;
  await refreshProjects.refresh(project, true);
  assert.equal(requests.some((r) => r.method === "POST"), false);
});

test("invalid refresh listings cause no partial dispatch", async (t) => {
  let writes = 0;
  t.mock.method(global, "fetch", async (url: Parameters<typeof fetch>[0], options: RequestInit = {}) => {
    if (options.method === "POST") writes++;
    return Response.json(new URL(String(url)).searchParams.get("page") === "1" ? [{ number: 1, state: "open" }, { number: 1, state: "open" }] : []);
  });
  await assert.rejects(() => refreshProjects.refresh({ repository: "conveyal/r5", workflow: "cla.yml", ref: "dev", enabled: true }), /incomplete PR list/);
  assert.equal(writes, 0);
});
