import { useEffect, useRef, useState } from "preact/hooks";
import { getBandCode, setBandCode, clearBandCode } from "../lib/band.js";

const WM = "WILLIAM & MARY";

const pad = (n) => String(n).padStart(2, "0");
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// "Newest": most recently submitted first.
// "By date": soonest show first (Oct 10 before Oct 11), then requests with flexible dates, then dates already past.
function arrange(list, mode) {
  if (mode === "new") return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ r }));
  const today = isoToday();
  const upcoming = [], flexible = [], past = [];
  for (const r of list) (!r.date_sort ? flexible : r.date_sort >= today ? upcoming : past).push(r);
  upcoming.sort((a, b) => a.date_sort.localeCompare(b.date_sort) || a.created_at.localeCompare(b.created_at));
  flexible.sort((a, b) => b.created_at.localeCompare(a.created_at));
  past.sort((a, b) => b.date_sort.localeCompare(a.date_sort));
  return [
    ...upcoming.map((r) => ({ r })),
    ...(flexible.length ? [{ divider: "Flexible dates" }, ...flexible.map((r) => ({ r }))] : []),
    ...(past.length ? [{ divider: "Past dates" }, ...past.map((r) => ({ r }))] : []),
  ];
}

const SAMPLE = [
  { id: "1", created_at: new Date(Date.now() - 20 * 60e3).toISOString(), venue: WM, event_type: "Greek", date_text: "Sat, Oct 24, 2026", date_sort: "2026-10-24", time_of_day: "10:00 PM", set_length: "2 Hour Set", name: "Jimi Hendrix", contact: "555-123-4567", notes: "Load-in at 8.\nWe have a PA.", contacted: false },
  { id: "2", created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), venue: "OFF CAMPUS", distance: "2-6 Hours Away", venue_type: "Venue", date_text: "Sat, Oct 10, 2026", date_sort: "2026-10-10", time_of_day: "9pm", set_length: "1.5 Hour Set", name: "Janis Joplin", contact: "janis@example.com", notes: "", contacted: true, contacted_at: new Date(Date.now() - 3600e3).toISOString() },
  { id: "3", created_at: new Date(Date.now() - 2 * 86400e3).toISOString(), venue: WM, event_type: "Student Org", date_text: "Flexible", date_sort: null, time_of_day: "8pm", set_length: "1 Hour Set", name: "Sam", contact: "555-000-1111", notes: "", contacted: false },
];

// Contacted cards can be swiped left-to-right to delete. Past this share of the card's width, letting go deletes.
const SWIPE_COMMIT = 0.4;

function Card({ r, onContacted, onDelete }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const wrap = useRef(null);
  const [stage, setStage] = useState(0); // 0 idle, 1 waiting for the confirming tap, 2 saving
  const [err, setErr] = useState("");

  // The confirm state lapses after a few seconds so a stray tap can't linger.
  useEffect(() => {
    if (stage !== 1) return;
    const t = setTimeout(() => setStage(0), 4000);
    return () => clearTimeout(t);
  }, [stage]);

  const press = async () => {
    if (stage === 0) return setStage(1);
    if (stage !== 1) return;
    setStage(2);
    setErr("");
    try {
      await onContacted(r.id);
    } catch {
      setErr("Couldn't save. Try again.");
      setStage(0);
    }
  };

  // Swiping is only ever wired up for contacted requests.
  const swipe = r.contacted && {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, tracking: false, id: e.pointerId };
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d) return;
      const mx = e.clientX - d.x, my = e.clientY - d.y;
      if (!d.tracking) {
        // Only a mostly-horizontal rightward drag counts; anything else is the page scrolling.
        if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { drag.current = null; return; }
        if (mx > 10 && mx > Math.abs(my) * 1.5) {
          d.tracking = true;
          setDragging(true);
          try { e.currentTarget.setPointerCapture(d.id); } catch { /* synthetic or finished pointer */ }
        } else return;
      }
      setDx(Math.max(0, mx));
    },
    onPointerUp: () => finishSwipe(),
    onPointerCancel: () => finishSwipe(),
  };

  function finishSwipe() {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.tracking) return;
    setDragging(false);
    const width = (wrap.current && wrap.current.offsetWidth) || 300;
    if (dx > width * SWIPE_COMMIT) {
      setDx(width); // slide off to the right, then remove
      setTimeout(() => onDelete(r), 180);
    } else {
      setDx(0);
    }
  }

  const isWM = r.venue === WM;
  const sub = (isWM ? [r.event_type] : [r.distance, r.venue_type]).concat(r.chapter || []).filter(Boolean).join(" · ");
  const isEmail = (r.contact || "").includes("@");
  const href = isEmail ? `mailto:${r.contact}` : `tel:${(r.contact || "").replace(/[^\d+]/g, "")}`;

  return (
    <div class="swipewrap" ref={wrap}>
      {r.contacted && <div class="swipe-bg" aria-hidden="true" style={{ opacity: dx > 0 ? 1 : 0 }}>Delete</div>}
    <article class={"rq" + (r.contacted ? " done swipeable" : "")} {...swipe}
      style={r.contacted ? { transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform .18s ease-out" } : undefined}>
      <div class="rq-venue" style={{ background: isWM ? "#0b5d2e" : "#10307a" }}>
        <b>{r.venue}</b>
        {sub && <span>{sub}</span>}
      </div>
      <div class="rq-body">
        <h2>{r.name}</h2>
        {r.school && <div class="rq-school">{r.school}</div>}
        {r.venue_address && (
          <a class="rq-school rq-addr" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.venue_address)}`}
            target="_blank" rel="noreferrer">{r.venue_address}</a>
        )}
        <div class="rq-date">{r.date_text}</div>
        <div class="rq-chips">
          {r.time_of_day && <span><i>Start</i>{r.time_of_day}</span>}
          {r.set_length && <span><i>Set</i>{r.set_length}</span>}
        </div>
        <a class="rq-contact" href={href}>
          <i>{isEmail ? "Email" : "Call or text"}</i>
          {r.contact}
        </a>
        {r.notes && <p class="rq-notes">{r.notes}</p>}
        <div class="rq-foot">Submitted {ago(r.created_at)}</div>
        {r.contacted ? (
          <div class="rq-btn is-done">
            ✓ Contacted{r.contacted_at ? ` · ${ago(r.contacted_at)}` : ""}
            <small>Swipe right to delete</small>
          </div>
        ) : (
          <button type="button" disabled={stage === 2}
            class={"rq-btn " + (stage === 1 ? "confirm" : "")} onClick={press}>
            {stage === 0 ? "Mark as contacted" : stage === 1 ? "Tap again to confirm" : "Saving…"}
          </button>
        )}
        {err && <p class="err">{err}</p>}
      </div>
    </article>
    </div>
  );
}

function CodeForm({ onSubmit, error, busy }) {
  const [code, setCode] = useState("");
  const submit = (e) => { e.preventDefault(); if (code.trim()) onSubmit(code.trim()); };
  return (
    <form class="rqlogin" onSubmit={submit}>
      <h1>Band only</h1>
      <p class="sub">Enter the band code to see booking requests. You'll only need to do this once on this device.</p>
      <div class="fields">
        <div>
          <label for="code">Band code</label>
          <input id="code" type="password" autocomplete="off" autofocus
            value={code} onInput={(e) => setCode(e.currentTarget.value)} />
        </div>
      </div>
      <p class="err">{error}</p>
      <button class="go" type="submit" disabled={busy}>{busy ? "Checking…" : "View requests"}</button>
    </form>
  );
}

export default function RequestsPage() {
  const [code, setCode] = useState(null); // null until we've looked in storage
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState("new");

  // Dev-only (stripped from production builds): ?mock shows sample data. location doesn't exist during server rendering.
  const dev = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("mock");

  const fetchRequests = async (c, { fresh = false } = {}) => {
    if (dev) { setRequests(SAMPLE); setCode(c || "dev"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/requests", { headers: { "X-Band-Code": c } });
      if (res.status === 401) {
        clearBandCode();
        setCode("");
        setError(fresh ? "Wrong band code." : "The band code has changed. Enter it again.");
        return;
      }
      if (res.status === 429) { setError("Too many tries. Wait a few minutes."); setCode(fresh ? "" : c); return; }
      if (!res.ok) throw new Error(res.status);
      const { requests: rows } = await res.json();
      if (fresh) setBandCode(c);
      setRequests(rows);
      setCode(c);
      setError("");
    } catch {
      setError("Couldn't load requests. Check your connection.");
      setCode(c);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const stored = getBandCode();
    if (stored || dev) fetchRequests(stored, { fresh: false });
    else setCode("");
  }, []);

  // Pick up new requests when the app comes back to the foreground (e.g. from a notification).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && code && !dev) fetchRequests(code); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [code]);

  // Deleting is delayed 5 seconds so a stray swipe can be undone. Nothing is removed from the
  // database until the delay ends (or the app is closed or hidden, which commits it right away).
  const pending = useRef(null); // { item, index, timer }
  const [undo, setUndo] = useState(null); // request shown in the "Deleted. Undo" bar
  const [delError, setDelError] = useState("");

  const commitDelete = async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    setUndo(null);
    if (dev) return;
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Band-Code": code },
        body: JSON.stringify({ id: p.item.id }),
        keepalive: true,
      });
      if (!res.ok) throw new Error(res.status);
    } catch {
      // Put it back so nothing silently reappears later as "deleted".
      setRequests((rs) => (rs.some((r) => r.id === p.item.id) ? rs : [...rs, p.item]));
      setDelError("Couldn't delete that request. It's back in the list.");
      setTimeout(() => setDelError(""), 5000);
    }
  };

  const startDelete = (item) => {
    if (pending.current) commitDelete(); // a second delete finalizes the first
    const index = requests.findIndex((r) => r.id === item.id);
    setRequests((rs) => rs.filter((r) => r.id !== item.id));
    pending.current = { item, index, timer: setTimeout(commitDelete, 5000) };
    setUndo(item);
  };

  const undoDelete = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setUndo(null);
    setRequests((rs) => [...rs, p.item]);
  };

  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") commitDelete(); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", commitDelete);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", commitDelete); };
  }, [code]);

  const markContacted = async (id) => {
    if (dev) {
      setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, contacted: true, contacted_at: new Date().toISOString() } : r)));
      return;
    }
    const res = await fetch("/api/contacted", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Band-Code": code },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(res.status);
    const { request } = await res.json();
    setRequests((rs) => rs.map((r) => (r.id === id ? request : r)));
  };

  if (code === null) return null;

  const needsCode = code === "";
  const todo = (requests || []).filter((r) => !r.contacted).length;

  return (
    <>
      <header>
        <a class="back" href="/" aria-label="Back to booking form">←</a>
        <span class="brand">Recess requests</span>
        {!needsCode && (
          <button class="back refresh" type="button" aria-label="Refresh" onClick={() => fetchRequests(code)}>↻</button>
        )}
      </header>

      {needsCode ? (
        <main><CodeForm busy={busy} error={error} onSubmit={(c) => fetchRequests(c, { fresh: true })} /></main>
      ) : (
        <main class="rqmain">
          <div class="sortbar">
            <button type="button" class={"tile c0" + (sort === "new" ? " picked" : "")} onClick={() => setSort("new")}>Newest</button>
            <button type="button" class={"tile c1" + (sort === "date" ? " picked" : "")} onClick={() => setSort("date")}>By date</button>
          </div>

          {requests === null && !error && <p class="rqmsg">Loading…</p>}
          {error && <p class="err rqmsg">{error}</p>}
          {requests && requests.length === 0 && <p class="rqmsg">No requests yet.</p>}
          {requests && requests.length > 0 && (
            <>
              <p class="rqcount">{requests.length} request{requests.length === 1 ? "" : "s"} · {todo} not contacted yet</p>
              <div class="rqlist">
                {arrange(requests, sort).map((it, i) =>
                  it.divider
                    ? <h3 key={"d" + i} class="rqdivider">{it.divider}</h3>
                    : <Card key={it.r.id} r={it.r} onContacted={markContacted} onDelete={startDelete} />
                )}
              </div>
            </>
          )}
        </main>
      )}

      {(undo || delError) && (
        <div class="toast" role="status">
          <span>{undo ? "Request deleted" : delError}</span>
          {undo && <button type="button" onClick={undoDelete}>Undo</button>}
        </div>
      )}
    </>
  );
}
