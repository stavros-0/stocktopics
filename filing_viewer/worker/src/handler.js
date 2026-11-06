import investors from "../../investor_managers.json" with { type: "json" };

const DATA = "https://data.sec.gov";
const WWW = "https://www.sec.gov";
const DAY = 86400;
const CSP = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' data:; object-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

class SecError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function cors(env, request) {
  const origin = request.headers.get("Origin");
  return origin && origin === env.ALLOWED_ORIGIN ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

async function secGet(env, key, url, maxAge) {
  const cached = await env.FILINGS.get(key);
  const stored = Number(cached?.customMetadata?.storedAt || 0);
  if (cached && (maxAge === null || Date.now() - stored < maxAge * 1000)) return cached;
  if (!env.SEC_USER_AGENT) {
    if (cached) return cached;
    throw new SecError("SEC_USER_AGENT is not configured on the Worker.");
  }
  const admitted = await env.DOWNLOAD_BUDGET.getByName("global").reserve();
  if (!admitted) {
    if (cached) return cached;
    throw new SecError("The daily SEC download limit has been reached. Try again tomorrow.", 429);
  }
  let response;
  try {
    response = await fetch(url, { headers: { "User-Agent": env.SEC_USER_AGENT, "Accept": "*/*" } });
  } catch (error) {
    if (cached) return cached;
    throw new SecError(`Could not retrieve SEC data: ${error.message}`);
  }
  if (!response.ok) {
    if (cached) return cached;
    throw new SecError(`SEC returned HTTP ${response.status} for ${url}`, response.status === 404 ? 404 : 502);
  }
  const maximumBytes = Number(env.MAX_SEC_OBJECT_BYTES) || 30_000_000;
  const declaredBytes = Number(response.headers.get("Content-Length"));
  if (declaredBytes > maximumBytes) {
    await response.body?.cancel();
    throw new SecError("SEC document exceeds the configured size limit.", 413);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new SecError("SEC document exceeds the configured size limit.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  await env.FILINGS.put(key, bytes, { customMetadata: { storedAt: String(Date.now()) } });
  return env.FILINGS.get(key);
}

async function secJson(env, key, url, maxAge) {
  const object = await secGet(env, key, url, maxAge);
  try { return await object.json(); }
  catch { throw new SecError("Invalid SEC JSON"); }
}

function normalize(value) { return String(value).toLowerCase().match(/[a-z0-9]+/g)?.join(" ") || ""; }

function personMatches(entry, query) {
  const names = [entry.manager, entry.person, ...(entry.aliases || [])].map(normalize);
  for (const person of [entry.person, ...(entry.aliases || [])]) {
    const words = normalize(person).split(" ");
    names.push(words.reverse().join(" "), words[0]);
  }
  return names.some(name => name.includes(query));
}

function indexQuarters(today = new Date(), count = 5) {
  const current = today.getUTCFullYear() * 4 + Math.floor(today.getUTCMonth() / 3);
  return Array.from({ length: count }, (_, offset) => {
    const n = current - offset;
    return [Math.floor(n / 4), n % 4 + 1];
  });
}

async function managerDirectory(env) {
  const directoryKey = "indices/13f_managers.json";
  const cached = await env.FILINGS.get(directoryKey);
  if (cached && Date.now() - Number(cached.customMetadata?.storedAt || 0) < DAY * 1000) return cached.json();
  const byCik = new Map();
  let downloaded = 0;
  for (const [index, [year, quarter]] of indexQuarters().entries()) {
    try {
      const url = `${WWW}/Archives/edgar/full-index/${year}/QTR${quarter}/master.idx`;
      const object = await secGet(env, `indices/${year}-QTR${quarter}.idx`, url, index === 0 ? DAY : 7 * DAY);
      downloaded++;
      const lines = (await object.text()).split(/\r?\n/);
      for (const line of lines) {
        const [cik, title, form, filingDate] = line.split("|").map(part => part?.trim());
        if (!/^\d+$/.test(cik || "") || !title || !form?.startsWith("13F-") || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate || "")) continue;
        const row = { cik_str: Number(cik), ticker: "", title, filing_date: filingDate, latest_form: form, is_13f_manager: true, preferred_form: "13F-HR" };
        if (!byCik.has(cik) || filingDate >= byCik.get(cik).filing_date) byCik.set(cik, row);
      }
    } catch { /* An unavailable current-quarter index should not break search. */ }
  }
  if (!downloaded) {
    if (cached) return cached.json();
    throw new SecError("13F manager directory is unavailable from SEC EDGAR.");
  }
  const rows = [...byCik.values()];
  await env.FILINGS.put(directoryKey, JSON.stringify(rows), { customMetadata: { storedAt: String(Date.now()) } });
  return rows;
}

async function companySearch(env, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  if (/^\d{1,10}$/.test(query)) return [{ cik_str: Number(query), ticker: "", title: `CIK ${Number(query)}` }];
  const normalized = normalize(query);
  const people = investors.filter(entry => personMatches(entry, normalized)).map(entry => ({
    cik_str: entry.cik, ticker: "", title: entry.manager, matched_person: entry.person,
    match_note: entry.note || "13F holdings", preferred_form: "13F-HR"
  }));
  if (people.length) return people;
  let rows = [];
  try {
    const data = await secJson(env, "company_tickers.json", `${WWW}/files/company_tickers.json`, 7 * DAY);
    rows = Array.isArray(data) ? data : Object.values(data);
  } catch { /* Manager search can still succeed if ticker data is unavailable. */ }
  const matches = rows.filter(row => row.ticker?.toLowerCase().includes(query) || row.title?.toLowerCase().includes(query));
  if (matches.some(row => row.ticker.toLowerCase() === query)) return matches.slice(0, 30);
  try {
    const managers = await managerDirectory(env);
    matches.push(...managers.filter(row => row.title.toLowerCase().includes(query)));
  } catch (error) { if (!matches.length) throw error; }
  matches.sort((a, b) => Number(a.title.toLowerCase() !== query) - Number(b.title.toLowerCase() !== query)
    || Number(!a.title.toLowerCase().startsWith(query)) - Number(!b.title.toLowerCase().startsWith(query))
    || Number(a.ticker?.toLowerCase() !== query) - Number(b.ticker?.toLowerCase() !== query)
    || a.title.localeCompare(b.title));
  return matches.slice(0, 30);
}

export function fiscalPeriod(reportDate, fiscalYearEnd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || "") || !/^\d{4}$/.test(fiscalYearEnd || "")) return [null, null];
  const date = new Date(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return [null, null];
  const month = Number(fiscalYearEnd.slice(0, 2));
  const day = Number(fiscalYearEnd.slice(2));
  if (month < 1 || month > 12 || day < 1 || day > 31) return [null, null];
  const year = date.getUTCFullYear() + Number(date.getUTCMonth() + 1 > month || (date.getUTCMonth() + 1 === month && date.getUTCDate() > day));
  const months = (date.getUTCMonth() + 1 - month + 12) % 12;
  const quarter = months === 0 ? 4 : Math.max(1, Math.min(4, Math.floor((months - 1) / 3) + 1));
  return [year, quarter];
}

async function submissions(env, cik) {
  const padded = cik.padStart(10, "0");
  const base = await secJson(env, `submissions/CIK${padded}.json`, `${DATA}/submissions/CIK${padded}.json`, DAY);
  const groups = [base.filings?.recent || {}];
  for (const file of base.filings?.files || []) {
    if (!/^CIK\d{10}-submissions-\d{3}\.json$/.test(file.name || "")) continue;
    groups.push(await secJson(env, `submissions/${file.name}`, `${DATA}/submissions/${file.name}`, 30 * DAY));
  }
  const seen = new Set();
  const filings = [];
  for (const group of groups) {
    for (let i = 0; i < (group.accessionNumber || []).length; i++) {
      const accession = group.accessionNumber[i];
      if (seen.has(accession)) continue;
      seen.add(accession);
      const field = name => group[name]?.[i] || "";
      const reportDate = field("reportDate");
      const form = field("form");
      const [fiscalYear, periodQuarter] = fiscalPeriod(reportDate, base.fiscalYearEnd || "1231");
      filings.push({ accession, form, filingDate: field("filingDate"), reportDate,
        primaryDocument: field("primaryDocument"), fiscalYear,
        fiscalQuarter: fiscalYear && ["10-K", "10-K/A"].includes(form) ? 4 : periodQuarter });
    }
  }
  filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate) || b.accession.localeCompare(a.accession));
  return { cik: Number(cik), name: base.name || "", tickers: base.tickers || [], fiscalYearEnd: base.fiscalYearEnd || "1231", filings };
}

function archiveTarget(pathname) {
  const match = pathname.match(/^\/archive\/(\d{1,10})\/(\d{10}-\d{2}-\d{6})\/(.+)$/);
  if (!match) throw new SecError("Invalid archive path", 400);
  const [, cik, accession, encoded] = match;
  let path;
  try { path = decodeURIComponent(encoded); } catch { throw new SecError("Invalid archive path", 400); }
  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..") || /[\\\x00]/.test(path)) throw new SecError("Invalid archive path", 400);
  const flat = accession.replaceAll("-", "");
  const url = path === "__full_submission__.txt"
    ? `${WWW}/Archives/edgar/data/${Number(cik)}/${accession}.txt`
    : `${WWW}/Archives/edgar/data/${Number(cik)}/${flat}/${parts.map(encodeURIComponent).join("/")}`;
  return { key: `archives/${Number(cik)}/${flat}/${path}`, url, path };
}

export function localizeHtml(html) {
  const pattern = /(\b(?:href|src|data|poster)\s*=\s*['"]?)(?:(?:https?:)?\/\/(?:www\.)?sec\.gov)?\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//gi;
  return html.replace(pattern, (_, prefix, cik, flat) => `${prefix}/archive/${Number(cik)}/${flat.slice(0, 10)}-${flat.slice(10, 12)}-${flat.slice(12)}/`)
    .replace(/<base\b[^>]*>/gi, "");
}

function plainTextPage(content) {
  const escaped = content.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light}html,body{background:#fff;color:#111}body{margin:10px}pre{margin:0;font:12px/1.4 ui-monospace,Consolas,monospace;white-space:pre;tab-size:8}</style></head><body><pre>${escaped}</pre></body></html>`;
}

function contentType(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  return { htm: "text/html", html: "text/html", txt: "text/plain", sgml: "text/plain", xml: "application/xml", xsd: "application/xml", css: "text/css", js: "text/javascript", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf" }[extension] || "application/octet-stream";
}

function decodeDocument(bytes) {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 2048));
  const declared = /<meta\b[^>]*charset\s*=\s*["']?([a-z\d_-]+)/i.exec(header)?.[1];
  for (const encoding of [declared, "utf-8", "windows-1252"].filter(Boolean)) {
    try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch { /* Try the next encoding. */ }
  }
  return new TextDecoder("windows-1252").decode(bytes);
}

async function archive(env, pathname, headers) {
  const target = archiveTarget(pathname);
  const object = await secGet(env, target.key, target.url, null);
  const bytes = await object.arrayBuffer();
  const kind = contentType(target.path);
  const looksHtml = /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(new TextDecoder("ascii").decode(bytes.slice(0, 256)));
  const text = kind === "text/html" || kind === "text/plain" || kind === "application/xml" || looksHtml ? decodeDocument(bytes) : "";
  let body = bytes;
  let type = kind;
  if (kind === "text/html" || looksHtml) {
    body = localizeHtml(text);
    type = "text/html; charset=utf-8";
  } else if (kind === "text/plain") {
    body = plainTextPage(text);
    type = "text/html; charset=utf-8";
  }
  return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": CSP, ...headers } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, headers);
    try {
      const isSearch = url.pathname === "/api/companies" || url.pathname === "/api/filings";
      const isArchive = url.pathname.startsWith("/archive/");
      if (isSearch || isArchive) {
        const client = request.headers.get("CF-Connecting-IP") || "unknown";
        const limiter = isSearch ? env.SEARCH_LIMIT : env.ARCHIVE_LIMIT;
        const [visitor, global] = await Promise.all([
          limiter.limit({ key: client }),
          env.GLOBAL_LIMIT.limit({ key: "filings" })
        ]);
        if (!visitor.success || !global.success) {
          return new Response(JSON.stringify({ error: "Too many requests. Please try again shortly." }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60", ...headers }
          });
        }
        const withinDailyBudget = await env.DOWNLOAD_BUDGET.getByName("global").reserveRequest();
        if (!withinDailyBudget) {
          return new Response(JSON.stringify({ error: "The daily filing request limit has been reached. Try again tomorrow." }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "3600", ...headers }
          });
        }
      }
      if (url.pathname === "/api/companies") return json(await companySearch(env, url.searchParams.get("q") || ""), 200, headers);
      if (url.pathname === "/api/filings") {
        const cik = url.searchParams.get("cik") || "";
        if (!/^\d{1,10}$/.test(cik)) throw new SecError("A valid CIK is required", 400);
        return json(await submissions(env, cik), 200, headers);
      }
      if (url.pathname.startsWith("/archive/")) return await archive(env, url.pathname, headers);
      return json({ error: "Not found" }, 404, headers);
    } catch (error) {
      return json({ error: error.message || "Server error" }, error.status || 500, headers);
    }
  }
};
