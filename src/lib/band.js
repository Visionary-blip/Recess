// The band code, remembered on this device after it's been entered once.
// localStorage can throw (private mode, blocked storage), so every access is guarded.
const KEY = "recess_band_code";

export const getBandCode = () => {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
};
export const setBandCode = (code) => {
  try { localStorage.setItem(KEY, code); } catch { /* page still works for this visit */ }
};
export const clearBandCode = () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};
