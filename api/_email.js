// Builds the inquiry email. Colors and type mirror src/styles/global.css so the email
// looks like the form: dark purple page, chunky colored blocks, heavy uppercase type.
// Email clients ignore most CSS, so this is table layout with inline styles only.

const T = {
  bg: "#1a1033",
  panel: "#2a1d4d",
  ink: "#ffffff",
  muted: "#b9aedc",
  yellow: "#f2b01e",
  green: "#1fa855",
  wm: "#0b5d2e",   // William & Mary tile
  off: "#10307a",  // Off Campus tile
  font: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const label = (s) =>
  `<div style="font:800 12px ${T.font};letter-spacing:.12em;text-transform:uppercase;color:${T.muted};margin-bottom:4px">${esc(s)}</div>`;

const row = (name, value) =>
  value
    ? `<tr><td style="padding:0 0 12px"><div style="background:${T.panel};border-radius:14px;padding:14px 16px">${label(name)}<div style="font:900 20px ${T.font};color:${T.ink}">${esc(value)}</div></div></td></tr>`
    : "";

export function buildEmail(d) {
  const isWM = d.Venue === "WILLIAM & MARY";
  const sub = isWM ? d["Event type"] : [d.Distance, d["Venue type"]].filter(Boolean).join(" · ");

  const isEmail = d.Contact.includes("@");
  const href = isEmail ? `mailto:${encodeURIComponent(d.Contact)}` : `tel:${d.Contact.replace(/[^\d+]/g, "")}`;

  const notes = d.Notes
    ? `<tr><td style="padding:0 0 12px"><div style="background:${T.panel};border-radius:14px;padding:14px 16px">${label("Notes")}<div style="font:600 16px/1.5 ${T.font};color:${T.ink};white-space:pre-wrap">${esc(d.Notes)}</div></div></td></tr>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${T.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="padding:0 0 14px;font:800 14px ${T.font};letter-spacing:.12em;text-transform:uppercase;color:${T.muted}">New booking request</td></tr>
  <tr><td style="padding:0 0 18px;font:900 34px/1.1 ${T.font};color:${T.ink}">${esc(d.Name)}</td></tr>
  ${d.Venue ? `<tr><td style="padding:0 0 12px"><div style="background:${isWM ? T.wm : T.off};border-radius:18px;padding:22px 16px;text-align:center"><div style="font:900 28px ${T.font};letter-spacing:.02em;text-transform:uppercase;color:${T.ink}">${esc(d.Venue)}</div>${sub ? `<div style="font:600 14px ${T.font};color:${T.ink};opacity:.85;margin-top:6px">${esc(sub)}</div>` : ""}</div></td></tr>` : ""}
  ${row("Date", d.Date)}${row("Start time", d["Time of day"])}${row("Set length", d["Set length"])}
  <tr><td style="padding:0 0 12px"><a href="${esc(href)}" style="display:block;background:${T.green};border-radius:18px;padding:20px 16px;text-align:center;text-decoration:none;font:900 24px ${T.font};color:${T.ink}"><span style="display:block;font:800 12px ${T.font};letter-spacing:.12em;text-transform:uppercase;color:${T.ink};opacity:.85;margin-bottom:4px">${isEmail ? "Email" : "Call or text"}</span>${esc(d.Contact)}</a></td></tr>
  ${notes}
</table>
</td></tr></table>
</body></html>`;

  return html;
}
