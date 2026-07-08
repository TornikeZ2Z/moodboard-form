/**
 * ESPACIO mail relay — Google Apps Script
 * ---------------------------------------
 * 1. Log into script.google.com AS info@espacio.ge
 * 2. New project → paste this file → replace PASTE_A_LONG_RANDOM_SECRET_HERE
 *    (invent any long random string, e.g. 40 letters/digits)
 * 3. Deploy → New deployment → type "Web app"
 *      Execute as: Me (info@espacio.ge)
 *      Who has access: Anyone
 * 4. Authorize when asked, copy the Web app URL (ends with /exec)
 * 5. Put the same secret + this URL into setup3-email-google.sql and run it.
 */
const SECRET = "PASTE_A_LONG_RANDOM_SECRET_HERE";

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return out({ ok:false, error:"bad secret" });
    let sent = 0;
    (req.messages || []).forEach(m => {
      if (!m.to) return;
      GmailApp.sendEmail(m.to, m.subject || "(no subject)", "", {
        htmlBody: m.html || "",
        name: "Espacio Studio",
        replyTo: m.replyTo || "info@espacio.ge"
      });
      sent++;
    });
    return out({ ok:true, sent });
  } catch (err) {
    return out({ ok:false, error:String(err) });
  }
}
function out(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
