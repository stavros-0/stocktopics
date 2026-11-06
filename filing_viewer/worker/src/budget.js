import { DurableObject } from "cloudflare:workers";

export class DownloadBudget extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily_downloads (day TEXT PRIMARY KEY, count INTEGER NOT NULL)");
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily_requests (day TEXT PRIMARY KEY, count INTEGER NOT NULL)");
  }

  // One globally named object handles every Worker location. Each reservation
  // is a single atomic SQL statement, so concurrent visitors share one quota.
  reserveRow(table, maximum) {
    const day = new Date().toISOString().slice(0, 10);
    return this.ctx.storage.sql.exec(
      `INSERT INTO ${table} (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
      day, maximum
    ).toArray().length > 0;
  }

  async reserve() {
    return this.reserveRow("daily_downloads", Number(this.env.MAX_SEC_DOWNLOADS_PER_DAY) || 50);
  }

  async reserveRequest() {
    return this.reserveRow("daily_requests", Number(this.env.MAX_REQUESTS_PER_DAY) || 2000);
  }
}
