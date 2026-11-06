import test from "node:test";
import assert from "node:assert/strict";
import worker, { fiscalPeriod, localizeHtml } from "../src/handler.js";

function environment() {
  const objects = new Map();
  return {
    SEC_USER_AGENT: "Test User test@example.com",
    ALLOWED_ORIGIN: "https://example.github.io",
    SEARCH_LIMIT: { limit: async () => ({ success: true }) },
    ARCHIVE_LIMIT: { limit: async () => ({ success: true }) },
    GLOBAL_LIMIT: { limit: async () => ({ success: true }) },
    MAX_SEC_OBJECT_BYTES: 30_000_000,
    DOWNLOAD_BUDGET: { getByName: () => ({ reserve: async () => true, reserveRequest: async () => true }) },
    FILINGS: {
      async get(key) {
        const entry = objects.get(key);
        if (!entry) return null;
        return {
          customMetadata: entry.metadata,
          json: async () => JSON.parse(new TextDecoder().decode(entry.body)),
          text: async () => new TextDecoder().decode(entry.body),
          arrayBuffer: async () => entry.body.slice().buffer
        };
      },
      async put(key, value, options = {}) {
        const body = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
        objects.set(key, { body, metadata: options.customMetadata || {} });
      }
    },
    objects
  };
}

test("fiscal periods and SEC links match the local server", () => {
  assert.deepEqual(fiscalPeriod("2026-08-31", "0531"), [2027, 1]);
  assert.deepEqual(fiscalPeriod("2026-05-31", "0531"), [2026, 4]);
  const html = '<a href="https://www.sec.gov/Archives/edgar/data/320187/000032018726000001/note.htm">SEC</a>';
  assert.equal(localizeHtml(html), '<a href="/archive/320187/0000320187-26-000001/note.htm">SEC</a>');
});

test("filings API joins older submission files and caches SEC responses", async () => {
  const env = environment();
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if (url.endsWith("CIK0000320187.json")) return Response.json({
      name: "NIKE INC", tickers: ["NKE"], fiscalYearEnd: "0531", filings: {
        recent: { accessionNumber: ["0000320187-26-000001"], form: ["10-Q"], filingDate: ["2026-10-01"], reportDate: ["2026-08-31"], primaryDocument: ["recent.htm"] },
        files: [{ name: "CIK0000320187-submissions-001.json" }]
      }
    });
    return Response.json({ accessionNumber: ["0000320187-95-000001"], form: ["10-Q"], filingDate: ["1995-10-01"], reportDate: ["1995-08-31"], primaryDocument: ["older.htm"] });
  };
  try {
    const request = new Request("https://worker.example/api/filings?cik=320187", { headers: { Origin: env.ALLOWED_ORIGIN } });
    const first = await worker.fetch(request, env);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);
    const data = await first.json();
    assert.equal(data.filings.length, 2);
    assert.equal(data.filings[0].fiscalQuarter, 1);
    assert.equal(data.filings[1].fiscalYear, 1996);
    await worker.fetch(request, env);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previousFetch; }
});

test("archive rejects traversal and serves cached localized HTML", async () => {
  const env = environment();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><img src="chart.png"><script>alert(1)</script></html>');
  try {
    const bad = await worker.fetch(new Request("https://worker.example/archive/320187/0000320187-26-000001/..%2Fsecret"), env);
    assert.equal(bad.status, 400);
    const url = "https://worker.example/archive/320187/0000320187-26-000001/filing.htm";
    const result = await worker.fetch(new Request(url), env);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("Content-Security-Policy"), /script-src 'none'/);
    assert.match(await result.text(), /chart\.png/);
    assert.ok(env.objects.has("archives/320187/000032018726000001/filing.htm"));
  } finally { globalThis.fetch = previousFetch; }
});

test("rate limit rejects a request before reading R2", async () => {
  const env = environment();
  env.SEARCH_LIMIT.limit = async () => ({ success: false });
  const response = await worker.fetch(new Request("https://worker.example/api/companies?q=nike"), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(env.objects.size, 0);
});

test("global daily quota prevents new SEC downloads", async () => {
  const env = environment();
  env.DOWNLOAD_BUDGET.getByName = () => ({ reserve: async () => false, reserveRequest: async () => true });
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    const response = await worker.fetch(new Request("https://worker.example/api/filings?cik=320187"), env);
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /daily SEC download limit/i);
    assert.equal(calls, 0);
    assert.equal(env.objects.size, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test("global daily request quota prevents R2 reads", async () => {
  const env = environment();
  env.DOWNLOAD_BUDGET.getByName = () => ({ reserve: async () => true, reserveRequest: async () => false });
  let reads = 0;
  env.FILINGS.get = async () => { reads++; return null; };
  const response = await worker.fetch(new Request("https://worker.example/api/filings?cik=320187"), env);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /daily filing request limit/i);
  assert.equal(reads, 0);
});

test("oversize SEC documents are never stored", async () => {
  const env = environment();
  env.MAX_SEC_OBJECT_BYTES = 5;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("123456", { headers: { "Content-Length": "6" } });
  try {
    const response = await worker.fetch(new Request("https://worker.example/archive/320187/0000320187-26-000001/filing.htm"), env);
    assert.equal(response.status, 413);
    assert.equal(env.objects.size, 0);
  } finally { globalThis.fetch = previousFetch; }
});
