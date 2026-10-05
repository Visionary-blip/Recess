// Vercel serverless function: receives booking inquiries from the site and emails
// them via Resend. Served at /api/inquiry on the same domain as the site.
//
// Env vars (Vercel project settings, never in the frontend):
//   RESEND_API_KEY  API key from resend.com
//   NOTIFY_EMAIL    where inquiries are sent
// Also pushes a notification to the band's installed app (see _push.js, subscribe.js).

import { buildEmail } from "./_email.js";
import { notifyBand } from "./_push.js";
import { storeConfigured, insertRequest } from "./_store.js";

const FIELDS = [
  ["Venue", 100], ["Event type", 100], ["Distance", 100], ["Venue type", 100], ["School", 200], ["Venue address", 250], ["Chapter", 150],
  ["Date", 100], ["Time of day", 100], ["Set length", 100],
  ["Name", 200], ["Contact", 200], ["Notes", 2000],
];

// Best-effort per-IP limit: 5 inquiries per 10 minutes. Memory is per function instance,
// so this only slows a bot down; the honeypot and origin check do the rest.
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  // Browsers always send Origin on POSTs; only accept ones from this site.
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "forbidden" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ error: "too many requests" });

  const input = req.body && typeof req.body === "object" ? req.body : {};

  // Hidden honeypot field: real people never fill it, bots do. Pretend success.
  if (input.website) return res.status(200).json({ ok: true });

  const data = Object.fromEntries(FIELDS.map(([k, max]) => [k, clean(input[k], max)]));
  if (!data.Name || !data.Contact) return res.status(400).json({ error: "name and contact required" });

  // Machine-readable date for sorting on the band's requests page; "Flexible" has none.
  const dateSort = /^\d{4}-\d{2}-\d{2}$/.test(input["Date ISO"]) ? input["Date ISO"] : null;

  const { RESEND_API_KEY, NOTIFY_EMAIL } = process.env;
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.error("RESEND_API_KEY or NOTIFY_EMAIL not set");
    return res.status(500).json({ error: "server not configured" });
  }

  const text = FIELDS.filter(([k]) => data[k]).map(([k]) => `${k}: ${data[k]}`).join("\n");

  // Email, saving and push are independent: the inquiry counts as received if any one gets through.
  const sendEmail = async () => {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Recess Bookings <onboarding@resend.dev>",
          to: [NOTIFY_EMAIL],
          subject: `Booking request: ${data.Name}${data.Date ? ` (${data.Date})` : ""}`,
          text,
          html: buildEmail(data),
        }),
      });
      if (!r.ok) console.error("Resend error", r.status, await r.text());
      return r.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const saveRequest = async () => {
    if (!storeConfigured()) return false;
    try {
      const row = {
        venue: data.Venue, event_type: data["Event type"], distance: data.Distance, venue_type: data["Venue type"],
        school: data.School, venue_address: data["Venue address"], chapter: data.Chapter,
        date_text: data.Date, date_sort: dateSort, time_of_day: data["Time of day"], set_length: data["Set length"],
        name: data.Name, contact: data.Contact, notes: data.Notes,
      };
      // Leave out empty fields so a request only touches the columns it actually uses.
      await insertRequest(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== "" && v != null)));
      return true;
    } catch (e) {
      console.error("save request failed", e);
      return false;
    }
  };

  const [emailed, saved, pushed] = await Promise.all([
    sendEmail(),
    saveRequest(),
    notifyBand({ title: "New booking request", body: [data.Name, data.School, data.Date].filter(Boolean).join(" · ") }),
  ]);
  if (!emailed && !saved && !pushed) return res.status(502).json({ error: "email failed" });
  return res.status(200).json({ ok: true });
}
