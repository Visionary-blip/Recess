/*
 * Sends booking form submissions to a Google Sheet.
 *
 * Setup (about 3 minutes):
 * 1. Create a Google Sheet. In row 1 type these headers, one per column (A to H):
 *      Timestamp | Venue | Event type | Distance | Date | Name | Contact | Venue type
 * 2. In the sheet: Extensions > Apps Script. Delete the starter code and paste this file in.
 * 3. Click Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    Click Deploy and approve the permissions prompt.
 * 4. Copy the Web app URL and paste it into CONFIG.sheetUrl in index.html.
 *
 * Each submission also emails NOTIFY_EMAIL (below). The first deploy asks for permission
 * to send email as you; approve it.
 *
 * If you change this script later, use Deploy > Manage deployments > edit > New version,
 * otherwise the live URL keeps running the old code.
 */
var NOTIFY_EMAIL = "fiend.alert@gmail.com";

function doPost(e) {
  var p = e.parameter;
  SpreadsheetApp.getActiveSheet().appendRow([
    new Date(),
    p["Venue"] || "",
    p["Event type"] || "",
    p["Distance"] || "",
    p["Date"] || "",
    p["Name"] || "",
    p["Contact"] || "",
    p["Venue type"] || ""
  ]);

  // The row is already saved; a mail failure must not lose the submission.
  try {
    var where = p["Venue"] === "WILLIAM & MARY"
      ? p["Event type"]
      : p["Distance"] + ", " + p["Venue type"];
    MailApp.sendEmail(
      NOTIFY_EMAIL,
      "New booking request: " + (p["Name"] || "unknown") + " (" + (p["Date"] || "no date") + ")",
      [
        "Name: " + p["Name"],
        "Contact: " + p["Contact"],
        "Date: " + p["Date"],
        "Venue: " + p["Venue"] + " (" + where + ")"
      ].join("\n")
    );
  } catch (err) {
    console.error(err);
  }
  return ContentService.createTextOutput("ok");
}
