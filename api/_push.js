// Web Push to the band's installed app. Subscriptions live in Supabase (see _store.js).
import webpush from "web-push";
import { createHash } from "node:crypto";
import { storeConfigured, allSubscriptions, removeSubscription } from "./_store.js";

export const subscriptionId = (endpoint) => createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

// Push services we accept. A subscription's endpoint is a URL our server will POST to, so an
// open list would let anyone aim the server at arbitrary hosts.
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

// Returns how many devices were notified. Never throws: a push problem must not lose an inquiry.
export async function notifyBand({ title, body }) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, NOTIFY_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !storeConfigured()) return 0;
  try {
    webpush.setVapidDetails(`mailto:${NOTIFY_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const subs = await allSubscriptions();
    const payload = JSON.stringify({ title, body, url: "/requests" });
    const results = await Promise.all(
      subs.map(async ({ id, sub }) => {
        try {
          await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
          return true;
        } catch (e) {
          // 404/410 mean the device uninstalled or revoked permission: forget it.
          if (e.statusCode === 404 || e.statusCode === 410) await removeSubscription(id).catch(() => {});
          else console.error("push failed", e.statusCode, e.body);
          return false;
        }
      })
    );
    return results.filter(Boolean).length;
  } catch (e) {
    console.error("push error", e);
    return 0;
  }
}
