// Address autofill for the booking form. Proxies Photon (photon.komoot.io, a free OpenStreetMap
// geocoder, no API key) so the browser only ever talks to our own domain. Results are US only.
// To upgrade accuracy later (Mapbox, Google Places, ...) only this file has to change.
const STATES = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

// Best-effort per-IP limit (memory is per serverless instance).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 150;
}

export function toLabel(p) {
  const st = STATES[p.state] || p.state;
  const isPlace = ["city", "locality", "district"].includes(p.type);
  if (isPlace) return [p.name, st].filter(Boolean).join(", ");
  const street = p.street || (p.type === "street" ? p.name : "");
  const place = p.name && p.name !== street && p.type !== "street" ? p.name : "";
  const line1 = [p.housenumber, street].filter(Boolean).join(" ");
  const line2 = [p.city, [st, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [place, line1, line2].filter(Boolean).join(", ");
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return res.status(403).json({ error: "forbidden" });

  const q = String(req.query.q || "").trim().slice(0, 120);
  if (q.length < 3) return res.status(200).json({ results: [] });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ error: "too many requests" });

  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.search = new URLSearchParams({ q, limit: "10", lang: "en", bbox: "-125,24,-66,50" });
    const r = await fetch(url, { headers: { "User-Agent": "RecessBooking/1.0" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`photon ${r.status}`);
    const { features = [] } = await r.json();
    const seen = new Set();
    const results = [];
    for (const f of features) {
      const p = f.properties || {};
      if (p.countrycode !== "US" || ["state", "county", "country"].includes(p.type)) continue;
      const label = toLabel(p);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      results.push({ label });
      if (results.length === 6) break;
    }
    // Same search gives the same answer, so let Vercel's CDN absorb repeats.
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({ results });
  } catch (e) {
    console.error("address lookup failed", e.message);
    return res.status(502).json({ error: "lookup failed" });
  }
}
