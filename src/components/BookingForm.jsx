import { useState } from "preact/hooks";
import Calendar from "./Calendar.jsx";

const WM = "WILLIAM & MARY";
const OFF = "OFF CAMPUS";

const stepsFor = (venue) =>
  venue === OFF
    ? ["venue", "eventType", "gigType", "date", "time", "contact"]
    : ["venue", "eventType", "date", "time", "contact"];

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

function TimeInput({ onSubmit }) {
  const [time, setTime] = useState("");
  const [length, setLength] = useState(null);
  const [err, setErr] = useState("");
  const next = (e) => {
    e.preventDefault();
    if (!time.trim()) return setErr("Type the time you'd like us to play.");
    if (!length) return setErr("Pick a 1 hour or 2 hour set.");
    onSubmit(time.trim(), length);
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
          <div class="setpick">
            {["1 Hour Set", "2 Hour Set"].map((label, n) => (
              <button key={label} type="button"
                class={"tile c" + n + (length === label ? " picked" : "")}
                onClick={() => { setLength(label); setErr(""); }}>
                {label}
              </button>
            ))}
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
          <input id="name" type="text" autocomplete="name" placeholder="Jane Doe"
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

  const set = (patch) => setA((prev) => ({ ...prev, ...patch }));
  // Picking a venue can change which steps follow, so recompute from the new value.
  const go = (patch) => {
    set(patch);
    const steps = stepsFor(patch.venue ?? a.venue);
    setI((n) => Math.min(n + 1, steps.length - 1));
  };
  const STEPS = stepsFor(a.venue);
  const step = STEPS[i];

  const submit = async (name, contact, notes, website) => {
    const payload = {
      Venue: a.venue,
      [a.venue === WM ? "Event type" : "Distance"]: a.eventType,
      ...(a.venue === OFF && { "Venue type": a.gigType }),
      Date: a.date,
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
    gigType: "What kind of gig?",
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
            {step === "gigType" && (
              <Tiles oneCol key={a.eventType} options={[{ label: "Venue" }, { label: "Greek" }]}
                onPick={(t) => go({ gigType: t })} />
            )}
            {step === "date" && (
              <>
                <Calendar onPick={(d) => go({ date: d })} />
                <button class="link" type="button" onClick={() => go({ date: "Flexible" })}>
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
