/* MyPopPro Suggestions - Google Apps Script web app, bound to the "MyPopPro suggestions" Sheet in Jesse's Drive.
   (Jesse, 11 Nov 2026.) MyPopPro's Suggestions pop-up POSTs JSON here (Content-Type text/plain, so no CORS preflight):
     {type:'idea'|'fix', name, email, phone, npn, page, text, shots:[{name, data:'<base64 jpeg>'}...up to 5]}
   - One row per suggestion on the "Suggestions" tab (made on first use).
   - Screenshots are saved to the private Drive folder "MyPopPro suggestions - screenshots"; the row gets their links.
   - A "Quick fix needed" emails the Sheet's owner straight away. Ideas wait for the Friday digest.
   Deploy: Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone. The /exec URL goes in SG_URL in
   tool/index.html. This file is the source of truth; paste it into the script editor when it changes. */
var TAB = 'Suggestions';
var HEAD = ['Timestamp', 'Type', 'Name', 'Email', 'Phone', 'NPN', 'Page', 'Suggestion', 'Screenshots', 'Status'];
var FOLDER = 'MyPopPro suggestions - screenshots';

function doPost(e) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TAB);
    if (!sh) { sh = ss.insertSheet(TAB, 0); sh.appendRow(HEAD); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold'); }
    var s = function (v, n) { return String(v == null ? '' : v).slice(0, n || 500); };
    var type = d.type === 'fix' ? 'Quick fix needed' : 'Idea';
    var when = new Date();
    var links = [];
    var shots = Array.isArray(d.shots) ? d.shots.slice(0, 5) : [];
    if (shots.length) {
      var it = DriveApp.getFoldersByName(FOLDER);
      var folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
      var stamp = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
      shots.forEach(function (sh0, i) {
        var raw = String(sh0 && sh0.data || '').replace(/^data:image\/\w+;base64,/, '');
        if (!raw || raw.length > 8000000) return;
        var blob = Utilities.newBlob(Utilities.base64Decode(raw), 'image/jpeg', stamp + ' ' + s(d.name, 40) + ' ' + (i + 1) + '.jpg');
        links.push(folder.createFile(blob).getUrl());
      });
    }
    var row = [when, type, s(d.name, 80), s(d.email, 120), s(d.phone, 40), s(d.npn, 30), s(d.page, 300), s(d.text, 5000), links.join('\n'), 'New'];
    sh.appendRow(row);
    if (d.type === 'fix') {
      var to = Session.getEffectiveUser().getEmail();
      var body = 'Quick fix needed in MyPopPro\n\nFrom: ' + row[2] + ' (' + row[3] + ', ' + row[4] + ', NPN ' + row[5] + ')\n'
        + 'Page: ' + row[6] + '\n\n' + row[7] + '\n\n' + (links.length ? 'Screenshots:\n' + links.join('\n') + '\n\n' : '')
        + 'Sheet: ' + ss.getUrl();
      MailApp.sendEmail({ to: to, subject: 'MyPopPro quick fix needed: ' + s(d.text, 60).replace(/\s+/g, ' '), body: body });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, shots: links.length })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

function doGet() { return ContentService.createTextOutput('MyPopPro suggestions endpoint is running.'); }
