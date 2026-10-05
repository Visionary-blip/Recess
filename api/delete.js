// Deletes a booking request. Band members only, and only after it has been marked contacted.
import { requireBand, sameSite } from "./_auth.js";
import { storeConfigured, deleteContacted } from "./_store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!sameSite(req)) return res.status(403).json({ error: "forbidden" });
  if (!requireBand(req, res)) return;
  if (!storeConfigured()) return res.status(500).json({ error: "server not configured" });

  const id = req.body && typeof req.body === "object" ? req.body.id : "";
  if (!UUID.test(id)) return res.status(400).json({ error: "bad id" });
  try {
    const row = await deleteContacted(id);
    if (!row) return res.status(404).json({ error: "not found or not contacted yet" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "could not delete" });
  }
}
