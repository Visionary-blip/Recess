// Vercel serverless function: receives booking inquiries from the site and emails
// them via Resend. Served at /api/inquiry on the same domain as the site.
//
// Env vars (Vercel project settings, never in the frontend):
//   RESEND_API_KEY  API key from resend.com
//   NOTIFY_EMAIL    where inquiries are sent

const FIELDS = [
  ["Venue", 100], ["Event type", 100], ["Distance", 100], ["Venue type", 100],
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

  const { RESEND_API_KEY, NOTIFY_EMAIL } = process.env;
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.error("RESEND_API_KEY or NOTIFY_EMAIL not set");
    return res.status(500).json({ error: "server not configured" });
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
      return res.status(502).json({ error: "email failed" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "email failed" });
  }
}
