// DukaanOS database on Google Apps Script + Google Sheets.
// Setup: open the Google Sheet, Extensions > Apps Script, paste this file, set SECRET,
// then Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone. Copy the /exec URL into DB_API in index.html.

const SECRET = "change-this-key";          // must match DB_KEY in index.html
const EVENTS_SHEET = "Events";
const SNAPSHOT_FOLDER = "DukaanOS snapshots"; // Google Drive folder, one JSON file per merchant
const EVENT_HEADERS = ["received_at", "ts", "mobile", "session_id", "device_id", "who", "cat", "what"];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    if (body.key !== SECRET) return json({ error: "forbidden" });
    if (body.route === "/api/events" && Array.isArray(body.events)) {
      appendEvents(body.mobile, body.events);
      return json({ ok: true, stored: body.events.length });
    }
    if (body.route === "/api/snapshot" && typeof body.data === "string") {
      saveSnapshot(body.mobile, body.bizName, body.mcc, body.device_id, body.data);
      return json({ ok: true });
    }
    return json({ error: "unknown route" });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: "dukaanos" });
}

function appendEvents(mobile, events) {
  const sheet = eventsSheet();
  const now = new Date().toISOString();
  const rows = events.slice(0, 500).map((ev) => [
    now, clip(ev.ts, 40), clip(mobile, 15), clip(ev.session_id, 64), clip(ev.device_id, 64),
    clip(ev.who, 60), clip(ev.cat, 40), clip(ev.what, 500),
  ]);
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
}

function eventsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EVENTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(EVENTS_SHEET);
  if (sheet.getLastRow() === 0) sheet.appendRow(EVENT_HEADERS);
  return sheet;
}

// Google Sheets cells hold at most about 50,000 characters, so each merchant's full data goes to a Drive file.
function saveSnapshot(mobile, bizName, mcc, deviceId, data) {
  const name = clip(mobile, 15) + ".json";
  const folder = snapshotFolder();
  const files = folder.getFilesByName(name);
  const meta = JSON.stringify({ mobile, bizName, mcc, deviceId, saved_at: new Date().toISOString() });
  const content = '{"meta":' + meta + ',"data":' + JSON.stringify(data) + "}";
  if (files.hasNext()) files.next().setContent(content);
  else folder.createFile(name, content, MimeType.PLAIN_TEXT);
}

function snapshotFolder() {
  const it = DriveApp.getFoldersByName(SNAPSHOT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SNAPSHOT_FOLDER);
}

function clip(v, max) {
  return v == null ? "" : String(v).slice(0, max);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
