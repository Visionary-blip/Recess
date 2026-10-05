import { useEffect, useMemo, useState } from "preact/hooks";
import Calendar from "./Calendar.jsx";
import { getBandCode } from "../lib/band.js";
import { WM_CHAPTERS, US_CHAPTERS } from "../data/greek.js";

const WM = "WILLIAM & MARY";
const OFF = "OFF CAMPUS";

// Steps depend on earlier answers: Greek gigs ask which chapter is hosting (off campus also asks the school);
// off-campus venue gigs ask for the venue's address.
const stepsFor = (a) => {
  const steps = ["venue", "eventType"];
  if (a.venue === OFF) steps.push("gigType");
  const offGreek = a.venue === OFF && a.gigType === "Greek";
  if (offGreek) steps.push("school");
  if ((a.venue === WM && a.eventType === "Greek") || offGreek) steps.push("chapter");
  if (a.venue === OFF && a.gigType === "Venue") steps.push("address");
  return [...steps, "date", "time", "contact"];
};

const venueOptions = [
  { label: WM, color: "#0b5d2e" },
  { label: OFF, color: "#10307a" },
];

const typeOptions = (venue) =>
  venue === WM
    ? ["Student Org", "Greek", "House Show"]
    : ["Under 2 Hours Away", "2-6 Hours Away", "6+ Hours"];

function Tiles({ options, hero, oneCol, onPick }) {
  const [picked, setPicked] = useState(null);
  return (
    <div class={"tiles" + (oneCol ? " one-col" : "") + (hero ? " hero" : "")}>
      {options.map((o, n) => (
        <button key={o.label} type="button"
          class={"tile c" + n + (picked === o.label ? " picked" : "")}
          style={o.color ? { background: o.color } : undefined}
          onClick={() => { setPicked(o.label); setTimeout(() => onPick(o.label), 140); }}>
          {o.label}
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

// Dashes a US phone number as it's typed; anything with letters or "@" is an email, left alone.
function formatContact(v) {
  if (/[a-z@]/i.test(v)) return v;
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

const SET_LENGTHS = [
  { label: "1 Hour Set", short: "1 hr" },
  { label: "1.5 Hour Set", short: "1.5 hrs" },
  { label: "2 Hour Set", short: "2 hrs" },
];

// Lowercased letters and digits only, so "Tri-Delta", "tri delta" and "TRIDELTA" all match.
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9α-ω]/g, "");

function ChapterPicker({ chapters, onPick }) {
  const [q, setQ] = useState("");
  const query = norm(q);

  // Matches Greek letters, the English name, or a nickname/abbreviation (e.g. "SAE", "Tri-Delta").
  // Names that start with what was typed come before names that merely contain it.
  const results = query
    ? chapters
        .map((c) => {
          const names = [c.g, c.n, ...c.a].map(norm);
          return { c, rank: names.some((x) => x.startsWith(query)) ? 0 : names.some((x) => x.includes(query)) ? 1 : 2 };
        })
        .filter((x) => x.rank < 2)
        .sort((x, y) => x.rank - y.rank)
        .map((x) => x.c)
    : chapters;

  return (
    <div class="chapters">
      <input type="search" class="chsearch" placeholder="Search for your chapter" autocomplete="off"
        autocapitalize="off" spellcheck={false} enterkeyhint="done" value={q}
        onInput={(e) => setQ(e.currentTarget.value)} />
      <div class="chlist" role="listbox" aria-label="Chapters">
        {results.map((c, n) => (
          <button key={c.g} type="button" role="option" class={"chopt c" + (n % 4)} onClick={() => onPick(c.g)}>
            {c.g}
          </button>
        ))}
        {results.length === 0 && <p class="rqmsg">No match.</p>}
        {q.trim() && !results.some((c) => norm(c.g) === query) && (
          <button type="button" class="link" onClick={() => onPick(q.trim())}>
            Not listed? Use "{q.trim()}"
          </button>
        )}
      </div>
    </div>
  );
}

// Search-as-you-type school picker. The ~3,300-school list is loaded only when this step is reached.
const MAX_SUGGESTIONS = 8;

function SchoolPicker({ onPick }) {
  const [schools, setSchools] = useState(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1); // highlighted suggestion (keyboard / hover)
  const [open, setOpen] = useState(true);

  useEffect(() => {
    import("../data/schools.js").then((m) => setSchools(m.SCHOOLS)).catch(() => setSchools([]));
  }, []);

  // Precompute searchable text once per school so typing stays fast.
  const index = useMemo(
    () => (schools || []).map(([name, loc, alias]) => ({
      label: name, loc,
      full: norm(name),
      words: `${name} ${alias}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
      alias: norm(alias),
    })),
    [schools]
  );

  const query = norm(q);
  const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const results = useMemo(() => {
    if (query.length < 2) return [];
    const scored = [];
    for (const s of index) {
      // best match wins: nickname/abbreviation, name prefix, word prefix, then anywhere in the name
      const rank = s.alias === query ? 0 : s.full.startsWith(query) ? 1
        : tokens.every((t) => s.words.some((w) => w.startsWith(t))) ? 2 : s.full.includes(query) ? 3 : 9;
      if (rank < 9) scored.push([rank, s]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length);
    return scored.slice(0, MAX_SUGGESTIONS).map((x) => x[1]);
  }, [index, query, tokens.join(" ")]);

  const choose = (s) => onPick(`${s.label} (${s.loc})`);
  const submit = () => {
    if (open && active >= 0 && results[active]) return choose(results[active]);
    if (q.trim()) onPick(q.trim());
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div class="schoolpick">
      <div class="combo">
        <input type="search" class="chsearch" placeholder="Search for a school" autocomplete="off" autocapitalize="off"
          spellcheck={false} autofocus role="combobox" aria-expanded={open && results.length > 0} aria-controls="schoollist"
          value={q} onKeyDown={onKeyDown}
          onInput={(e) => { setQ(e.currentTarget.value); setActive(-1); setOpen(true); }} />
        {open && results.length > 0 && (
          <ul class="suggest" id="schoollist" role="listbox">
            {results.map((s, n) => (
              <li key={s.label + s.loc} role="option" aria-selected={n === active}
                class={n === active ? "on" : ""} onMouseEnter={() => setActive(n)}
                onMouseDown={(e) => { e.preventDefault(); choose(s); }}>
                <b>{s.label}</b>
                <span>{s.loc}</span>
              </li>
            ))}
          </ul>
        )}
        {schools === null && <p class="rqmsg">Loading schools…</p>}
        {query.length >= 2 && schools && results.length === 0 && <p class="rqmsg">No match. You can still use what you typed.</p>}
      </div>
      <button class="go" type="button" disabled={!q.trim()} onClick={submit}>Next →</button>
    </div>
  );
}

// Street address with autofill from our /api/address lookup. Always lets people type their own.
function AddressPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(true);
  const [state, setState] = useState("idle"); // idle | loading | done | failed

  // Look up suggestions shortly after typing stops; a newer keystroke cancels the older request.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) { setResults([]); setState("idle"); return; }
    const ctrl = new AbortController();
    setState("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(res.status);
        setResults((await res.json()).results || []);
        setActive(-1);
        setState("done");
      } catch (e) {
        if (e.name !== "AbortError") { setResults([]); setState("failed"); }
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const submit = () => {
    if (open && active >= 0 && results[active]) return onPick(results[active].label);
    if (q.trim()) onPick(q.trim());
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div class="schoolpick">
      <div class="combo">
        <input type="text" class="chsearch" placeholder="Start typing an address" autocomplete="off" autocapitalize="off"
          spellcheck={false} autofocus enterkeyhint="done" role="combobox" aria-expanded={open && results.length > 0}
          aria-controls="addresslist" value={q} onKeyDown={onKeyDown}
          onInput={(e) => { setQ(e.currentTarget.value); setOpen(true); }} />
        {open && results.length > 0 && (
          <ul class="suggest" id="addresslist" role="listbox">
            {results.map((r, n) => (
              <li key={r.label} role="option" aria-selected={n === active} class={n === active ? "on" : ""}
                onMouseEnter={() => setActive(n)} onMouseDown={(e) => { e.preventDefault(); onPick(r.label); }}>
                <b>{r.label}</b>
              </li>
            ))}
          </ul>
        )}
        {state === "loading" && results.length === 0 && <p class="rqmsg">Searching…</p>}
        {state === "done" && results.length === 0 && <p class="rqmsg">No match. You can still use what you typed.</p>}
        {state === "failed" && <p class="rqmsg">Autofill isn't available right now. Type the full address and tap Next.</p>}
      </div>
      <button class="go" type="button" disabled={!q.trim()} onClick={submit}>Next →</button>
    </div>
  );
}

function TimeInput({ onSubmit }) {
  const [time, setTime] = useState("");
  const [stop, setStop] = useState(0); // index into SET_LENGTHS
  const [err, setErr] = useState("");
  const next = (e) => {
    e.preventDefault();
    if (!time.trim()) return setErr("Type the time you'd like us to play.");
    onSubmit(time.trim(), SET_LENGTHS[stop].label);
  };
  return (
    <form class="timeform" onSubmit={next}>
      <div class="fields">
        <div>
          <label for="time">Start time</label>
          <input id="time" type="text" placeholder="e.g. 9:00 PM" autofocus
            value={time} onInput={(e) => setTime(e.currentTarget.value)} />
        </div>
        <div>
          <label>Set length</label>
          <div class="setvalue">{SET_LENGTHS[stop].label}</div>
          <input class="slider" type="range" min="0" max={SET_LENGTHS.length - 1} step="1" value={stop}
            aria-label="Set length" aria-valuetext={SET_LENGTHS[stop].label}
            onInput={(e) => setStop(Number(e.currentTarget.value))} />
          <div class="ticks" aria-hidden="true">
            {SET_LENGTHS.map((l) => <span key={l.short}>{l.short}</span>)}
          </div>
        </div>
      </div>
      <p class="err">{err}</p>
      <button class="go" type="submit">Next →</button>
    </form>
  );
}

function Contact({ onSubmit }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, bots fill it
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!name.trim() || !contact.trim()) return setErr("Add your name and a way to reach you.");
    setErr("");
    setSending(true);
    try {
      await onSubmit(name.trim(), contact.trim(), notes.trim(), website);
    } catch {
      setErr("Couldn't send. Check your connection and try again.");
      setSending(false);
    }
  };

  return (
    <>
      <div class="fields">
        <div>
          <label for="name">Your name</label>
          <input id="name" type="text" autocomplete="name" placeholder="Jimi Hendrix"
            value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div>
          <label for="contact">Best way to reach you (phone # or email)</label>
          <input id="contact" type="text" autocomplete="email" placeholder="555-123-4567 or you@email.com"
            value={contact} onInput={(e) => {
              // Write back directly: if formatting yields the same state, Preact wouldn't re-render.
              const f = formatContact(e.currentTarget.value);
              e.currentTarget.value = f;
              setContact(f);
            }} />
        </div>
        <div>
          <label for="notes">Notes (optional)</label>
          <textarea id="notes" rows={3} maxLength={1000} placeholder="Anything we should know?"
            value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
        </div>
        <input class="hp" type="text" name="website" tabindex={-1} autocomplete="off" aria-hidden="true"
          value={website} onInput={(e) => setWebsite(e.currentTarget.value)} />
      </div>
      <p class="err">{err}</p>
      <button class="go" type="button" disabled={sending} onClick={send}>
        {sending ? "Sending…" : "Send it"}
      </button>
    </>
  );
}

export default function BookingForm({ bandName, formUrl }) {
  const [i, setI] = useState(0);
  const [a, setA] = useState({});
  const [done, setDone] = useState(null);
  const [isBand, setIsBand] = useState(false);
  useEffect(() => setIsBand(Boolean(getBandCode())), []);

  const set = (patch) => setA((prev) => ({ ...prev, ...patch }));
  // Picking a venue can change which steps follow, so recompute from the new value.
  const go = (patch) => {
    set(patch);
    const steps = stepsFor({ ...a, ...patch });
    setI((n) => Math.min(n + 1, steps.length - 1));
  };
  const STEPS = stepsFor(a);
  const step = STEPS[i];

  const submit = async (name, contact, notes, website) => {
    const payload = {
      Venue: a.venue,
      [a.venue === WM ? "Event type" : "Distance"]: a.eventType,
      ...(a.venue === OFF && { "Venue type": a.gigType }),
      ...(a.venue === OFF && a.gigType === "Greek" && { School: a.school }),
      ...(a.venue === OFF && a.gigType === "Venue" && { "Venue address": a.address }),
      ...(stepsFor(a).includes("chapter") && { Chapter: a.chapter }),
      Date: a.date,
      "Date ISO": a.dateISO || "",
      "Time of day": a.time,
      "Set length": a.setLength,
      Name: name,
      Contact: contact,
      Notes: notes,
      website, // honeypot, see Contact
    };
    if (formUrl) {
      // The server (see server/index.js) emails every field to the band's inbox.
      const res = await fetch(formUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Form submit failed: " + res.status);
    } else {
      console.log("PUBLIC_FORM_URL not set. Submission:", payload);
    }
    setDone(name.split(" ")[0]);
  };

  const title = {
    venue: "Where's the gig?",
    eventType: a.venue === WM ? "What kind of event?" : "How far away?",
    school: "Which school?",
    address: "Where's the venue?",
    gigType: "What kind of gig?",
    chapter: "Which chapter?",
    date: "When is it?",
    time: "What time should we play?",
    contact: "Who are we talking to?",
  }[step];

  return (
    <>
      <header>
        {!done && i > 0 && (
          <button class="back" type="button" aria-label="Back" onClick={() => setI(i - 1)}>←</button>
        )}
        {done || i === 0
          ? <span class="brand">Book {bandName}</span>
          : <div class="bar"><i style={{ width: (i / (STEPS.length - 1)) * 100 + "%" }} /></div>}
        {isBand && !done && <a class="stafflink" href="/requests">Requests →</a>}
      </header>
      <main aria-live="polite">
        {done ? (
          <div class="done">
            <h1>You're in!</h1>
            <p>Thanks {done}! We'll be in contact with you soon.</p>
            <p class="sub">You can close this and head back to Instagram.</p>
          </div>
        ) : (
          <>
            <h1>{title}</h1>
            {step === "venue" && <Tiles hero oneCol options={venueOptions} onPick={(v) => go({ venue: v })} />}
            {step === "eventType" && (
              <Tiles oneCol key={a.venue} options={typeOptions(a.venue).map((label) => ({ label }))}
                onPick={(t) => go({ eventType: t })} />
            )}
            {step === "address" && <AddressPicker onPick={(ad) => go({ address: ad })} />}
            {step === "school" && <SchoolPicker onPick={(sc) => go({ school: sc })} />}
            {step === "gigType" && (
              <Tiles oneCol key={a.eventType} options={[{ label: "Venue" }, { label: "Greek" }]}
                onPick={(t) => go({ gigType: t })} />
            )}
            {step === "chapter" && (
              <ChapterPicker key={a.venue} chapters={a.venue === WM ? WM_CHAPTERS : US_CHAPTERS}
                onPick={(c) => go({ chapter: c })} />
            )}
            {step === "date" && (
              <>
                <Calendar onPick={(d, iso) => go({ date: d, dateISO: iso })} />
                <button class="link" type="button" onClick={() => go({ date: "Flexible", dateISO: "" })}>
                  Not sure yet / flexible
                </button>
              </>
            )}
            {step === "time" && <TimeInput onSubmit={(t, l) => go({ time: t, setLength: l })} />}
            {step === "contact" && <Contact onSubmit={submit} />}
          </>
        )}
      </main>
    </>
  );
}
