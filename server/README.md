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
- `POST /api/events` body `{ mobile, events: [{ ts, session_id, who, cat, what }] }`
- `GET /api/merchant?mobile=...`
- `GET /api/sessions?mobile=...` one row per browser session: start, last activity, event count
- `GET /api/session?id=...` every event in one session, in order
- `GET /api/events?mobile=...&limit=100`
- `GET /health`

## Hosting

GitHub Pages only serves static files, so the API must run on a server host (for example Render, Railway or Fly.io)
with a persistent disk for the SQLite file. Then set `DB_API` to that host's URL.

## What the app records

- `session`: opened the app, resumed, signed in, logged out, closed the app
- `input`: every field the user changes (values of PIN and OTP fields are masked)
- `navigate`: every menu screen opened
- `tap`: every button tapped, by its label
- `sale`, `refund`, `purchase`, `supplier`, `drawer`, `staff`, `grow`, `expense`, `discount`, `owner`, `data`: the app's own activity log
- `merchants` and `snapshots`: the full business data after each save (every sale, customer, khata line, stock count and setting)

## Option: Google Apps Script + Google Sheet (no server to run)

Activity events go to an `Events` sheet in your Google account. Each merchant's full data goes to a JSON file in the Drive folder `DukaanOS snapshots`.

1. Create a Google Sheet. Open Extensions, then Apps Script. Paste `server/apps-script/Code.gs`, and change `SECRET`.
2. Deploy, then New deployment, type Web app. Set Execute as: Me, and Who has access: Anyone. Copy the `/exec` URL.
3. In `index.html`, set `DB_API` to that URL and `DB_KEY` to the same secret as `SECRET`.

Limits:
- The app's shared key sits in the page source, so it only stops casual misuse. Anyone who reads the page can use it.
- Apps Script cannot see the caller's IP address, so IP addresses are not recorded on this option. Device IDs and session history still are.
- Google stores the data outside India. Check this against your DPDP obligations.
- Apps Script has daily quotas, so heavy use will hit them.
