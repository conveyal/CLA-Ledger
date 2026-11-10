// Prepare a CLA signature record in the browser and link to GitHub's new-file editor.
// The record must match .github/scripts/signature_record.ts; test_cla.ts compares them.
// Opening the link creates nothing. The signer commits and opens the PR from their own account.

const LEDGER = "https://github.com/conveyal/CLA-Ledger";
const RAW = "https://raw.githubusercontent.com/conveyal/CLA-Ledger/main";

/**
 * Render the individual record text and its ledger path.
 * @param {{ login: string, id: string, version: string, hash: string, date: string }} r
 */
export function individualRecord(r) {
  const link = `${LEDGER}/blob/main/versions/CLA-${r.version}.md`;
  return {
    path: `signatures/${r.version}/individual/${r.id}.md`,
    text: `## Signature\n\nI, @${r.login} (GitHub account ID: ${r.id}), have read, agree to, and sign the\n[Conveyal Contributor License Agreement, version ${r.version.slice(1)}](${link})\nfor public repositories in the Conveyal GitHub organization.\n\n- GitHub login: ${r.login}\n- GitHub account ID: ${r.id}\n- CLA version: ${r.version}\n- Agreement SHA-256: ${r.hash}\n- Signature type: individual\n- Date: ${r.date}\n`,
  };
}

/**
 * Link to GitHub's new-file editor with the record filled in.
 * @param {{ path: string, text: string }} record
 */
export function editorUrl(record) {
  const url = new URL(`${LEDGER}/new/main`);
  url.searchParams.set("filename", record.path);
  url.searchParams.set("value", record.text);
  return url.href;
}

/** @param {string} url */
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

/** Look up the account and current agreement, then show the record and editor link. */
export async function prepare(/** @type {string} */ login) {
  const user = await (await get(`https://api.github.com/users/${encodeURIComponent(login)}`)).json();
  if (user.type !== "User") throw new Error(`${user.login} is not a user account. Bots do not sign.`);
  const version = (await (await get(`${RAW}/versions/CURRENT`)).text()).trim();
  const agreement = await (await get(`${RAW}/versions/CLA-${version}.md`)).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", agreement));
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  const date = new Date().toISOString().slice(0, 10);
  return individualRecord({ login: user.login, id: String(user.id), version, hash, date });
}

if (typeof document !== "undefined") {
  const form = /** @type {HTMLFormElement} */ (document.getElementById("form"));
  const status = /** @type {HTMLElement} */ (document.getElementById("status"));
  const output = /** @type {HTMLElement} */ (document.getElementById("record"));
  const link = /** @type {HTMLAnchorElement} */ (document.getElementById("link"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const login = String(new FormData(form).get("login") || "").trim().replace(/^@/, "");
    status.textContent = "Preparing…";
    output.hidden = link.hidden = true;
    try {
      const record = await prepare(login);
      output.textContent = record.text;
      link.href = editorUrl(record);
      output.hidden = link.hidden = false;
      status.textContent = `Record for ${record.path}:`;
    } catch (error) {
      status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
}
