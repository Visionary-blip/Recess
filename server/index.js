// Receives booking inquiries from the site and emails them via Resend.
// No dependencies: Node 18+ (global fetch) is enough.
//
// Env vars (set in the Render dashboard, never in the frontend):
//   RESEND_API_KEY  API key from resend.com
//   NOTIFY_EMAIL    where inquiries are sent
//   ALLOWED_ORIGIN  the site's origin, e.g. https://recess-booking.onrender.com
//   PORT            set by Render
import http from "node:http";

const { RESEND_API_KEY, NOTIFY_EMAIL, ALLOWED_ORIGIN, PORT = 3000 } = process.env;

const FIELDS = [
  ["Venue", 100], ["Event type", 100], ["Distance", 100], ["Venue type", 100],
  ["Date", 100], ["Time of day", 100], ["Set length", 100],
  ["Name", 200], ["Contact", 200], ["Notes", 2000],
];

// Naive per-IP limit: 5 inquiries per 10 minutes. Resets on restart, which is fine here.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "";

function send(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 20_000) { reject(new Error("too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const origin = ALLOWED_ORIGIN || "";
  const url = new URL(req.url, "http://x");

  if (req.method === "GET" && url.pathname === "/") return send(res, 200, { ok: true }, origin);
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);
  if (req.method !== "POST" || url.pathname !== "/inquiry") return send(res, 404, { error: "not found" }, origin);

  // Browsers always send Origin on cross-site POSTs; reject anything not from our site.
  if (ALLOWED_ORIGIN && req.headers.origin !== ALLOWED_ORIGIN) return send(res, 403, { error: "forbidden" }, origin);

  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "too many requests" }, origin);

  let input;
  try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "bad request" }, origin); }

  // Hidden honeypot field: real people never fill it, bots do. Pretend success.
  if (input.website) return send(res, 200, { ok: true }, origin);

  const data = Object.fromEntries(FIELDS.map(([k, max]) => [k, clean(input[k], max)]));
  if (!data.Name || !data.Contact) return send(res, 400, { error: "name and contact required" }, origin);

  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.error("RESEND_API_KEY or NOTIFY_EMAIL not set");
    return send(res, 500, { error: "server not configured" }, origin);
  }

  const text = FIELDS.filter(([k]) => data[k]).map(([k]) => `${k}: ${data[k]}`).join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Recess Bookings <onboarding@resend.dev>",
        to: [NOTIFY_EMAIL],
        subject: `Booking request: ${data.Name}${data.Date ? ` (${data.Date})` : ""}`,
        text,
      }),
    });
    if (!r.ok) {
      console.error("Resend error", r.status, await r.text());
      return send(res, 502, { error: "email failed" }, origin);
    }
    return send(res, 200, { ok: true }, origin);
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: "email failed" }, origin);
  }
}).listen(PORT, () => console.log(`listening on ${PORT}`));
