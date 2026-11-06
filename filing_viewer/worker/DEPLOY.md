# Filing viewer Worker deployment

The hosted filing viewer calls this Worker for SEC filer search, filing metadata, and original filing documents. The Worker caches SEC responses as objects in a private R2 bucket.

1. Create an R2 bucket named `stock-topics-filings`. If using another name, update `bucket_name` in `wrangler.toml`. Set `ALLOWED_ORIGIN` to the exact origin of the hosted site.
2. From this directory, run `npx wrangler login`, then `npx wrangler deploy`. Run `npx wrangler secret put SEC_USER_AGENT` and enter your real name and email. Setting the secret deploys a new Worker version.
3. Set `window.FILINGS_API_BASE` in `../../filings/config.js` to the deployed Worker URL, then publish the site. Until this is set, hosted search stays disabled.

The Worker allows at most 50 SEC downloads or refreshes and 2,000 filing API requests per UTC day across all visitors and Cloudflare locations. A SQLite-backed Durable Object enforces both quotas. Cached objects remain readable after the SEC download quota is reached, until the filing API request quota is reached. Each SEC response is limited to 30 MB before it can be stored. Change `MAX_SEC_DOWNLOADS_PER_DAY`, `MAX_REQUESTS_PER_DAY`, and `MAX_SEC_OBJECT_BYTES` in `wrangler.toml` if needed.

The separate request limits are 5 searches per minute per client IP, 120 archive reads per minute per client IP, and 180 total requests per minute per Cloudflare location. Excess requests return HTTP 429 before an R2 read. Cloudflare's request limits are approximate and location based; the daily SEC download quota is global. SEC may reject requests from a cloud network with HTTP 403; test a ticker and filing after deployment. [SEC fair access guidance](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) asks clients to identify themselves and stay under 10 requests per second.
