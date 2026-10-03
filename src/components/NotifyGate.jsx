import { useEffect, useState } from "preact/hooks";
import { setBandCode } from "../lib/band.js";

const VAPID_PUBLIC_KEY = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Only the band installs the app, so the installed (standalone) app is where we ask for notifications.
// Regular visitors in a browser tab never see this.
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true ||
  (import.meta.env.DEV && new URLSearchParams(location.search).has("standalone")); // dev-only preview

const urlBase64ToUint8Array = (b64) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export default function NotifyGate() {
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Register for everyone: it's what makes the site installable.
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("sw", e));

    // Dev only (stripped from production builds): ?standalone=show always shows the prompt for design work.
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("standalone") === "show") return setShow(true);

    if (!isInstalled() || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (!sub || Notification.permission !== "granted") setShow(true); })
      .catch(() => setShow(true));
  }, []);

  if (!show) return null;

  const enable = async () => {
    if (!VAPID_PUBLIC_KEY) return setErr("Notifications aren't set up on this site yet.");
    if (!code.trim()) return setErr("Enter the band code.");
    setErr("");
    setBusy(true);
    try {
      // Must run from a tap: iOS only shows the permission prompt for a user gesture.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setErr("Notifications are blocked. Turn them on for this app in your device settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), code: code.trim() }),
      });
      if (res.status === 401) return setErr("Wrong band code.");
      if (!res.ok) return setErr("Couldn't turn notifications on. Try again.");
      setBandCode(code.trim()); // lets this device open the /requests page without asking again
      setDone(true);
      setTimeout(() => setShow(false), 1500);
    } catch (e) {
      console.error(e);
      setErr("Couldn't turn notifications on. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="gate" role="dialog" aria-modal="true" aria-label="Turn on notifications">
      <h1>{done ? "You're set!" : "Get alerted for new requests"}</h1>
      {!done && (
        <>
          <p class="sub">Turn on notifications so this phone buzzes whenever someone sends a booking request.</p>
          <div class="fields">
            <div>
              <label for="bandcode">Band code</label>
              <input id="bandcode" type="password" autocomplete="off" placeholder="Ask whoever set this up"
                value={code} onInput={(e) => setCode(e.currentTarget.value)} />
            </div>
          </div>
          <p class="err">{err}</p>
          <button class="go" type="button" disabled={busy} onClick={enable}>
            {busy ? "Working…" : "Turn on notifications"}
          </button>
          <button class="link" type="button" onClick={() => setShow(false)}>Not now</button>
        </>
      )}
    </div>
  );
}
