import { useState } from "preact/hooks";

const fmt = (d) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function Calendar({ onPick }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(null);

  const y = month.getFullYear();
  const m = month.getMonth();
  const atStart = y === today.getFullYear() && m === today.getMonth();
  const blanks = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  const pick = (d) => {
    setPicked(d);
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    setTimeout(() => onPick(fmt(new Date(y, m, d)), iso), 140);
  };

  return (
    <div class="cal">
      <div class="calhead">
        <button class="nav" type="button" aria-label="Previous month" disabled={atStart}
          onClick={() => setMonth(new Date(y, m - 1, 1))}>‹</button>
        <span>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button class="nav" type="button" aria-label="Next month"
          onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div class="calgrid">
        {"SMTWTFS".split("").map((d, i) => <span key={i} class="dow">{d}</span>)}
        {Array.from({ length: blanks }, (_, i) => <span key={"b" + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          return (
            <button key={d} type="button" class={"day" + (picked === d ? " picked" : "")}
              disabled={new Date(y, m, d) < today} onClick={() => pick(d)}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}
