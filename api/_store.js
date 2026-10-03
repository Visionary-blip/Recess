// Tiny Upstash Redis REST client (no dependency). Add the Upstash Redis integration from the
// Vercel Marketplace and it sets these env vars for you.
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const storeConfigured = () => Boolean(url() && token());

async function cmd(...args) {
  const r = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

const KEY = "push-subscriptions";

export const saveSubscription = (id, sub) => cmd("HSET", KEY, id, JSON.stringify(sub));
export const removeSubscription = (id) => cmd("HDEL", KEY, id);
export const countSubscriptions = () => cmd("HLEN", KEY);
export const hasSubscription = async (id) => (await cmd("HEXISTS", KEY, id)) === 1;

export async function allSubscriptions() {
  const flat = (await cmd("HGETALL", KEY)) || []; // [id, json, id, json, ...]
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ id: flat[i], sub: JSON.parse(flat[i + 1]) });
  return out;
}
