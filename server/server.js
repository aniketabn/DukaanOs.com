// DukaanOS database API: stores merchant snapshots and the activity log in SQLite.
// Run: node --no-warnings server/server.js   (env: PORT, DB_FILE, CORS_ORIGIN)
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 8787);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "data", "dukaanos.db");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_BODY = 8 * 1024 * 1024;

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS merchants (
    mobile TEXT PRIMARY KEY, biz_name TEXT, mcc TEXT, data TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mobile TEXT NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL,
    device_id TEXT, user_agent TEXT, ip TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mobile TEXT, session_id TEXT, ts TEXT NOT NULL,
    who TEXT, cat TEXT, what TEXT, device_id TEXT, user_agent TEXT, ip TEXT, received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_mobile_ts ON events (mobile, ts);
  CREATE INDEX IF NOT EXISTS events_session ON events (session_id, ts);
`);

const stmt = {
  upsertMerchant: db.prepare(`INSERT INTO merchants (mobile, biz_name, mcc, data, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(mobile) DO UPDATE SET biz_name = excluded.biz_name, mcc = excluded.mcc, data = excluded.data, updated_at = excluded.updated_at`),
  addSnapshot: db.prepare("INSERT INTO snapshots (mobile, data, saved_at, device_id, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)"),
  addEvent: db.prepare("INSERT INTO events (mobile, session_id, ts, who, cat, what, device_id, user_agent, ip, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  listSessions: db.prepare(`SELECT session_id, MIN(ts) AS started, MAX(ts) AS last_seen, COUNT(*) AS events
    FROM events WHERE mobile = ? AND session_id IS NOT NULL GROUP BY session_id ORDER BY started DESC LIMIT ?`),
  listSessionEvents: db.prepare("SELECT ts, who, cat, what, device_id, ip, user_agent FROM events WHERE session_id = ? ORDER BY ts ASC LIMIT ?"),
  getMerchant: db.prepare("SELECT mobile, biz_name, mcc, updated_at FROM merchants WHERE mobile = ?"),
  listEvents: db.prepare("SELECT ts, session_id, who, cat, what, device_id, ip FROM events WHERE mobile = ? ORDER BY ts DESC LIMIT ?"),
  listAllEvents: db.prepare("SELECT mobile, ts, session_id, who, cat, what, device_id, ip FROM events ORDER BY ts DESC LIMIT ?"),
};

const str = (v, max = 200) => (v == null ? null : String(v).slice(0, max));
// IP of the device making the request. Behind a proxy, the first X-Forwarded-For address is the client.
const clientIp = (req) => {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (xf || req.socket.remoteAddress || "").replace(/^::ffff:/, "") || null;
};
const isMobile = (m) => typeof m === "string" && /^\d{6,15}$/.test(m);

function send(res, code, body) {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });

    if (req.method === "POST" && url.pathname === "/api/snapshot") {
      const b = await readBody(req);
      if (!isMobile(b.mobile) || typeof b.data !== "string") return send(res, 400, { error: "mobile and data required" });
      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        stmt.upsertMerchant.run(b.mobile, str(b.bizName), str(b.mcc, 10), b.data, now);
        stmt.addSnapshot.run(b.mobile, b.data, now, str(b.device_id, 64), str(req.headers["user-agent"], 300), clientIp(req));
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return send(res, 200, { ok: true, saved_at: now });
    }

    if (req.method === "POST" && url.pathname === "/api/events") {
      const b = await readBody(req);
      if (!isMobile(b.mobile) || !Array.isArray(b.events)) return send(res, 400, { error: "mobile and events required" });
      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        for (const e of b.events.slice(0, 500)) {
          stmt.addEvent.run(b.mobile, str(e.session_id, 64), str(e.ts, 40) || now, str(e.who, 60), str(e.cat, 40), str(e.what, 500),
            str(e.device_id, 64), str(req.headers["user-agent"], 300), clientIp(req), now);
        }
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return send(res, 200, { ok: true, stored: Math.min(b.events.length, 500) });
    }

    // Reads are private: every GET needs the READ_KEY secret (header x-read-key or ?key=).
    // If READ_KEY is not set, all reads are refused.
    if (req.method === "GET" && url.pathname.startsWith("/api/")) {
      const want = process.env.READ_KEY || "";
      const got = req.headers["x-read-key"] || url.searchParams.get("key") || "";
      if (!want || got !== want) return send(res, 401, { error: "read key required" });
    }

    if (req.method === "GET" && url.pathname === "/api/merchant") {
      const m = url.searchParams.get("mobile");
      const row = isMobile(m) ? stmt.getMerchant.get(m) : null;
      return row ? send(res, 200, row) : send(res, 404, { error: "not found" });
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      const m = url.searchParams.get("mobile");
      if (!isMobile(m)) return send(res, 400, { error: "mobile required" });
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
      return send(res, 200, { sessions: stmt.listSessions.all(m, limit) });
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      const sid = url.searchParams.get("id");
      if (!sid || sid.length > 64) return send(res, 400, { error: "id required" });
      const limit = Math.min(Number(url.searchParams.get("limit") || 500), 2000);
      return send(res, 200, { events: stmt.listSessionEvents.all(sid, limit) });
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      const m = url.searchParams.get("mobile");
      if (!isMobile(m)) return send(res, 400, { error: "mobile required" });
      const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);
      return send(res, 200, { events: stmt.listEvents.all(m, limit) });
    }

    // CSV export of one shop's events (opens in Excel / Google Sheets). Protected by the same read key.
    if (req.method === "GET" && url.pathname === "/api/events.csv") {
      // With ?mobile=NUMBER -> that shop only. Without it -> every shop, with a mobile column.
      const m = url.searchParams.get("mobile");
      if (m && !isMobile(m)) return send(res, 400, { error: "invalid mobile" });
      const limit = Math.min(Number(url.searchParams.get("limit") || 20000), 100000);
      const rows = m ? stmt.listEvents.all(m, limit) : stmt.listAllEvents.all(limit);
      const cell = (v) => {
        const s = v == null ? "" : String(v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = m
        ? ["time_utc", "session_id", "who", "category", "what", "device_id", "ip"]
        : ["mobile", "time_utc", "session_id", "who", "category", "what", "device_id", "ip"];
      const lines = [header.join(",")].concat(
        rows.map((r) =>
          (m
            ? [r.ts, r.session_id, r.who, r.cat, r.what, r.device_id, r.ip]
            : [r.mobile, r.ts, r.session_id, r.who, r.cat, r.what, r.device_id, r.ip]
          ).map(cell).join(",")
        )
      );
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dukaanos-events-${m || "all"}.csv"`,
        "access-control-allow-origin": CORS_ORIGIN,
      });
      return res.end("﻿" + lines.join("\r\n") + "\r\n");
    }

    return send(res, 404, { error: "no such route" });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`DukaanOS API on :${PORT}, db ${DB_FILE}`));
module.exports = server;
