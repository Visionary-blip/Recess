// Stores push subscriptions in Supabase through its REST API (no dependency).
// Table: see supabase/schema.sql.
//
// Env vars (Vercel project settings, server-side only, never PUBLIC_):
//   SUPABASE_URL          e.g. https://abcdefgh.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret / service_role key
const url = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const storeConfigured = () => Boolean(url() && key());

const TABLE = "push_subscriptions";

async function req(path, { method = "GET", body, prefer } = {}) {
  const k = key();
  const headers = { apikey: k, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and go in Authorization too; the newer sb_secret_ keys are not JWTs.
  if (k.startsWith("eyJ")) headers.Authorization = `Bearer ${k}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url()}/rest/v1/${TABLE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

export const saveSubscription = (id, subscription) =>
  req("?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates", body: { id, subscription } });

export const removeSubscription = (id) => req(`?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });

export const hasSubscription = async (id) =>
  ((await req(`?id=eq.${encodeURIComponent(id)}&select=id`)) || []).length > 0;

export const countSubscriptions = async () => ((await req("?select=id")) || []).length;

export async function allSubscriptions() {
  const rows = (await req("?select=id,subscription")) || [];
  return rows.map((r) => ({ id: r.id, sub: r.subscription }));
}
