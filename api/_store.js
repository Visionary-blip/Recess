// Stores push subscriptions and booking requests in Supabase through its REST API (no dependency).
// Tables: see supabase/schema.sql.
//
// Env vars (Vercel project settings, server-side only, never PUBLIC_):
//   SUPABASE_URL          e.g. https://abcdefgh.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret / service_role key
const url = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const storeConfigured = () => Boolean(url() && key());

async function req(table, path, { method = "GET", body, prefer } = {}) {
  const k = key();
  const headers = { apikey: k, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and go in Authorization too; the newer sb_secret_ keys are not JWTs.
  if (k.startsWith("eyJ")) headers.Authorization = `Bearer ${k}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url()}/rest/v1/${table}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const SUBS = "push_subscriptions";
const REQUESTS = "booking_requests";

export const saveSubscription = (id, subscription) =>
  req(SUBS, "?on_conflict=id", { method: "POST", prefer: "resolution=merge-duplicates", body: { id, subscription } });

export const removeSubscription = (id) => req(SUBS, `?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });

export const hasSubscription = async (id) =>
  ((await req(SUBS, `?id=eq.${encodeURIComponent(id)}&select=id`)) || []).length > 0;

export const countSubscriptions = async () => ((await req(SUBS, "?select=id")) || []).length;

export async function allSubscriptions() {
  const rows = (await req(SUBS, "?select=id,subscription")) || [];
  return rows.map((r) => ({ id: r.id, sub: r.subscription }));
}

export const insertRequest = (row) => req(REQUESTS, "", { method: "POST", body: row });

export async function listRequests() {
  return (await req(REQUESTS, "?select=*&order=created_at.desc&limit=500")) || [];
}

// Returns the updated row, or undefined if no row has that id.
export async function markContacted(id) {
  const rows = await req(REQUESTS, `?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { contacted: true, contacted_at: new Date().toISOString() },
  });
  return (rows || [])[0];
}

// Deletes a request only if it has been marked contacted (enforced here, not just in the app).
// Returns the deleted row, or undefined if there was no such contacted request.
export async function deleteContacted(id) {
  const rows = await req(REQUESTS, `?id=eq.${encodeURIComponent(id)}&contacted=eq.true`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return (rows || [])[0];
}
