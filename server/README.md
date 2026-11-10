# DukaanOS database API

The app stores everything in the browser by default. This small API stores the same data in
a SQLite database and keeps an activity log of every sale, refund, stock-in, supplier payment,
drawer entry, staff sign-in, campaign and export.

## What gets recorded

- `merchants`: latest business data per merchant mobile number (the same data the app saves locally).
- `snapshots`: a history row each time the app saves.
- `events`: one row per activity, with time, staff name, category and details.

## Run it

    node --no-warnings server/server.js

Environment variables:

- `PORT` (default 8787)
- `DB_FILE` (default `server/data/dukaanos.db`)
- `CORS_ORIGIN` (default `*`; set to your app's origin, e.g. `https://aniketabn.github.io`)

Requires Node 22.13 or newer (uses the built-in `node:sqlite`). No npm install needed.

## Link the app to it

In `index.html`, set the API address and keep the rest unchanged:

    const DB_API = "https://your-api-host.example.com";

With `DB_API` empty, the app stays local-only and sends nothing.

## Endpoints

- `POST /api/snapshot` body `{ mobile, bizName, mcc, data }`
- `POST /api/events` body `{ mobile, events: [{ ts, who, cat, what }] }`
- `GET /api/merchant?mobile=...`
- `GET /api/events?mobile=...&limit=100`
- `GET /health`

## Hosting

GitHub Pages only serves static files, so the API must run on a server host (for example Render, Railway or Fly.io)
with a persistent disk for the SQLite file. Then set `DB_API` to that host's URL.
