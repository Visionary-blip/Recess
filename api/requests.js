// Lists every booking request for the band's /requests page. Band members only.
import { requireBand } from "./_auth.js";
import { storeConfigured, listRequests } from "./_store.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  if (!requireBand(req, res)) return;
  if (!storeConfigured()) return res.status(500).json({ error: "server not configured" });
  try {
    return res.status(200).json({ requests: await listRequests() });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "could not load" });
  }
}
