// Registers a band member's device for push notifications.
// Anyone can call this URL, so it needs the BAND_CODE; otherwise a stranger could subscribe
// themselves and read every inquiry.
//
// Env vars: BAND_CODE (shared passphrase the band types once per device), plus the Redis vars.
import { timingSafeEqual } from "node:crypto";
import { storeConfigured, saveSubscription, countSubscriptions, hasSubscription } from "./_store.js";
import { subscriptionId, validEndpoint } from "./_push.js";

const MAX_DEVICES = 25;

function codeMatches(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(process.env.BAND_CODE || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "forbidden" });

  if (!process.env.BAND_CODE || !storeConfigured()) {
    console.error("BAND_CODE or Redis not configured");
    return res.status(500).json({ error: "server not configured" });
  }

  const { subscription: s, code } = req.body && typeof req.body === "object" ? req.body : {};
  if (!codeMatches(code)) return res.status(401).json({ error: "wrong code" });

  const ok =
    s && typeof s.endpoint === "string" && s.endpoint.length < 1000 && validEndpoint(s.endpoint) &&
    s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" &&
    s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
  if (!ok) return res.status(400).json({ error: "bad subscription" });

  try {
    const id = subscriptionId(s.endpoint);
    if (!(await hasSubscription(id)) && (await countSubscriptions()) >= MAX_DEVICES)
      return res.status(409).json({ error: "too many devices" });
    await saveSubscription(id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "could not save" });
  }
}
