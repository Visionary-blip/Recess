// Band-only access is just the shared BAND_CODE (no accounts, no sessions). The app remembers the
// code on the device and sends it in the X-Band-Code header; the server compares it to BAND_CODE.
import { timingSafeEqual } from "node:crypto";

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const codeMatches = (given) => Boolean(process.env.BAND_CODE) && safeEqual(given || "", process.env.BAND_CODE);

// Same-site check for browser POSTs.
export const sameSite = (req) => !req.headers.origin || new URL(req.headers.origin).host === req.headers.host;

// Best-effort limit on wrong guesses: 10 per IP per 10 minutes. Memory is per serverless instance,
// so this only slows guessing down; use a long passphrase for BAND_CODE.
const failures = new Map();
const WINDOW = 10 * 60 * 1000;

// Checks the code. Sends the error response itself and returns false when it isn't valid.
export function checkBandCode(req, res, given) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= 10) {
    res.status(429).json({ error: "too many attempts" });
    return false;
  }
  if (codeMatches(given)) return true;
  recent.push(now);
  failures.set(ip, recent);
  res.status(401).json({ error: "wrong code" });
  return false;
}

export const requireBand = (req, res) => checkBandCode(req, res, req.headers["x-band-code"]);
