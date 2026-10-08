/**
 * Render an individual record and its GitHub new-file editor link without writing a file.
 * Callers supply canonical text from the trusted ledger and verified GitHub account metadata.
 * A generated link only prepares a proposal; PR-opener validation and maintainer merge establish acceptance.
 */

import { recordLink, validDate, type ClaConfig } from "./cla.ts";

/** Record contents and its append-only path relative to the configured ledger root. */
interface IndividualRecord {
  path: string;
  text: string;
}

/** Render the signature block shared by the CLI and editor-link generator. */
function buildIndividual(config: ClaConfig, login: string, id: string, version: string, date: string) {
  const link = recordLink(config, version);
  return `---\n\n## Signature\n\nI, @${login} (GitHub account ID: ${id}), agree to and sign the\n[Conveyal Contributor License Agreement, version ${version.slice(1)}](${link})\n— reproduced in full above — for Conveyal's organization-wide open-source projects.\n\n- GitHub login: ${login}\n- GitHub account ID: ${id}\n- CLA version: ${version}\n- Signature type: individual\n- Date: ${date}\n`;
}

/** Require literal identity fields and preserve the canonical agreement's internal whitespace. */
function individualRecord(config: ClaConfig, agreement: string, login: string, id: string, version: string, date: string): IndividualRecord {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) throw new Error("invalid GitHub login");
  if (!/^[1-9]\d*$/.test(id)) throw new Error("invalid GitHub account ID");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("invalid CLA version");
  if (!validDate(date)) throw new Error("invalid signing date");
  if (!agreement.trim()) throw new Error("canonical agreement is empty");
  return {
    path: `signatures/${version}/individual/${id}.md`,
    text: `${agreement.trimEnd()}\n\n${buildIndividual(config, login, id, version, date)}`,
  };
}

/**
 * Prepare GitHub's new-file editor; no branch, commit, or PR is created by opening the URL.
 * Content-prefill support must pass the authenticated prototype before workflows advertise these links.
 */
function individualEditorUrl(config: ClaConfig, record: IndividualRecord): string {
  const location = new URL(config.ledger_blob);
  if (location.origin !== "https://github.com" || location.search || location.hash
    || !/^\/[\w.-]+\/[\w.-]+\/blob\/[\w.-]+$/.test(location.pathname)) {
    throw new Error("editor links require a github.com ledger_blob with a single branch name");
  }
  const root = config.cla_root === "." ? "" : `${config.cla_root.replace(/^\/+|\/+$/g, "")}/`;
  if (root.split("/").some((part) => part === "." || part === "..")) throw new Error("invalid ledger root");
  if (!/^signatures\/v\d+\.\d+\/individual\/[1-9]\d*\.md$/.test(record.path)) throw new Error("invalid individual record path");
  location.pathname = location.pathname.replace("/blob/", "/new/");
  location.searchParams.set("filename", `${root}${record.path}`);
  location.searchParams.set("value", record.text);
  return location.href;
}

export { buildIndividual, individualRecord, individualEditorUrl, type IndividualRecord };
