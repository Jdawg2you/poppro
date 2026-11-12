/* MyPopPro access - Google Apps Script web app, bound to the "MyPopPro access" Sheet in Jesse's Drive (Jesse, 11 Nov 2026).
   Only MyPopPro's Cloudflare Worker (edge/worker.js) calls doPost, with the shared secret in Script Properties (ACCESS_SECRET).
   Tabs (made on first use):
     Codes     Code | Team / note | Active (TRUE/FALSE) | Uses | Created
               Any active code lets a new agent straight in. Change or switch off a code any time: members stay members.
     Members   Email | Name | Phone | NPN | Team | How they got in | Joined | Status | Last sign-in
               Status "Active" can sign in. Change it to "Removed" (or delete the row) to take access away;
               they then need a current code, or a request you approve.
     Requests  Timestamp | Email | Name | Phone | NPN | Team | Note | Status | Key
               Someone without a code. Jesse gets an email with an Approve link; approving adds them to Members.
   Returning members sign in with a 6-digit code emailed to them (kept 10 minutes in CacheService, never in the Sheet).
   This file is the source of truth: paste it into the script editor when it changes, then Deploy > Manage deployments >
   edit > New version (same URL). Deploy as: Execute as Me, Who has access: Anyone. */

var T = { codes: 'Codes', members: 'Members', requests: 'Requests' };
var HEAD = {
  Codes: ['Code', 'Team / note', 'Active', 'Uses', 'Created'],
  Members: ['Email', 'Name', 'Phone', 'NPN', 'Team', 'How they got in', 'Joined', 'Status', 'Last sign-in'],
  Requests: ['Timestamp', 'Email', 'Name', 'Phone', 'NPN', 'Team', 'Note', 'Status', 'Key']
};
var SITE = 'https://mypoppro.com/';

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function tab(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(HEAD[name]); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEAD[name].length).setFontWeight('bold'); }
  return sh;
}
function rows(name) { var v = tab(name).getDataRange().getValues(); return v.slice(1); }
function low(s) { return String(s || '').trim().toLowerCase(); }
function memberRow(email) {   /* 1-based sheet row of an Active member, or 0 */
  var v = rows(T.members);
  for (var i = 0; i < v.length; i++) if (low(v[i][0]) === email && String(v[i][7] || 'Active') !== 'Removed') return i + 2;
  return 0;
}
function addMember(d, how) {
  var r = memberRow(d.email);
  if (r) return r;
  tab(T.members).appendRow([d.email, d.name || '', d.phone || '', d.npn || '', d.team || '', how, new Date(), 'Active', '']);
  return memberRow(d.email);
}
function owner() { return Session.getEffectiveUser().getEmail(); }

function doPost(e) {
  var d = {}; try { d = JSON.parse(e.postData.contents || '{}'); } catch (x) { return out({ ok: false, error: 'bad request' }); }
  var secret = PropertiesService.getScriptProperties().getProperty('ACCESS_SECRET');
  if (!secret || d.secret !== secret) return out({ ok: false, error: 'not allowed' });
  d.email = low(d.email);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (d.a === 'check') return out({ ok: true, member: !!memberRow(d.email) });
    if (d.a === 'pin') return out(sendPin(d));
    if (d.a === 'verify') return out(verify(d));
    if (d.a === 'signup') return out(signup(d));
    if (d.a === 'request') return out(request(d));
    return out({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out({ ok: false, error: 'Sign-in is having trouble. Please try again in a minute.', detail: String(err) });
  } finally { lock.releaseLock(); }
}

/* ---- returning member: email a 6-digit code ---- */
function sendPin(d) {
  if (!memberRow(d.email)) return { ok: true, member: false };
  var c = CacheService.getScriptCache(), sentKey = 'sent:' + d.email, sent = +(c.get(sentKey) || 0);
  if (sent >= 5) return { ok: false, error: 'Too many codes sent. Please wait an hour, or use the last code we emailed you.' };
  var pin = String(Math.floor(100000 + Math.random() * 900000));
  c.put('pin:' + d.email, JSON.stringify({ h: hash(pin), tries: 0 }), 600);
  c.put(sentKey, String(sent + 1), 3600);
  MailApp.sendEmail({ to: d.email, name: 'MyPopPro', subject: 'Your MyPopPro sign-in code: ' + pin,
    body: 'Your MyPopPro sign-in code is ' + pin + '\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.\n\n' + SITE });
  return { ok: true, member: true };
}
function verify(d) {
  var c = CacheService.getScriptCache(), k = 'pin:' + d.email, s = c.get(k);
  if (!s) return { ok: false, error: 'That code has expired. Ask for a new one.' };
  s = JSON.parse(s);
  if (s.tries >= 5) { c.remove(k); return { ok: false, error: 'Too many tries. Ask for a new code.' }; }
  if (hash(String(d.pin || '')) !== s.h) { s.tries++; c.put(k, JSON.stringify(s), 600); return { ok: false, error: 'That code is not right. Check the email and try again.' }; }
  c.remove(k);
  var r = memberRow(d.email); if (!r) return { ok: false, error: 'Your access has been removed. Sign up again with a current access code.' };
  var sh = tab(T.members); sh.getRange(r, 9).setValue(new Date());
  return { ok: true, name: sh.getRange(r, 2).getValue() };
}

/* ---- new agent with an access code ---- */
function signup(d) {
  var code = low(d.code).replace(/\s+/g, '');
  if (!code) return { ok: false, needCode: true, error: 'Enter your invite code, or ask us for one below.' };
  var sh = tab(T.codes), v = rows(T.codes);
  for (var i = 0; i < v.length; i++) {
    var active = v[i][2] === true || /^(true|yes|y|1)$/i.test(String(v[i][2]));
    if (low(v[i][0]).replace(/\s+/g, '') === code && active) {
      sh.getRange(i + 2, 4).setValue((+v[i][3] || 0) + 1);
      var r = addMember(d, 'Code ' + v[i][0] + (v[i][1] ? ' (' + v[i][1] + ')' : ''));
      tab(T.members).getRange(r, 9).setValue(new Date());
      return { ok: true };
    }
  }
  return { ok: false, badCode: true, error: 'That invite code isn’t working. Check it, or ask us for access below.' };
}

/* ---- no code: ask Jesse ---- */
function request(d) {
  if (memberRow(d.email)) return { ok: true, already: true };
  var key = Utilities.getUuid().replace(/-/g, '');
  tab(T.requests).appendRow([new Date(), d.email, d.name || '', d.phone || '', d.npn || '', d.team || '', d.note || '', 'Pending', key]);
  var link = ScriptApp.getService().getUrl() + '?a=approve&k=' + key;
  MailApp.sendEmail({ to: owner(), name: 'MyPopPro', subject: 'MyPopPro access request: ' + (d.name || d.email),
    body: (d.name || '') + ' asked for access to MyPopPro.\n\nEmail: ' + d.email + '\nPhone: ' + (d.phone || '') + '\nNPN: ' + (d.npn || '') +
      '\nTeam: ' + (d.team || '') + (d.note ? '\nNote: ' + d.note : '') + '\n\nApprove (one click): ' + link +
      '\n\nTo say no, just leave it. Requests are on the Requests tab: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl() });
  return { ok: true };
}

/* Jesse's Approve link */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a !== 'approve' || !p.k) return HtmlService.createHtmlOutput('MyPopPro access endpoint is running.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = tab(T.requests), v = rows(T.requests);
    for (var i = 0; i < v.length; i++) if (String(v[i][8]) === String(p.k)) {
      var d = { email: low(v[i][1]), name: v[i][2], phone: v[i][3], npn: v[i][4], team: v[i][5] };
      if (v[i][7] !== 'Approved') {
        addMember(d, 'Approved by ' + owner().split('@')[0]);
        sh.getRange(i + 2, 8).setValue('Approved');
        MailApp.sendEmail({ to: d.email, name: 'MyPopPro', subject: 'You’re in: MyPopPro access approved',
          body: 'Hi ' + String(d.name || '').split(' ')[0] + ',\n\nYour MyPopPro access is approved. Go to ' + SITE +
            ', click Sign in, and enter this email address. We’ll email you a 6-digit code to finish signing in.\n\nMyPopPro' });
      }
      return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">Approved: <b>' + esc(d.name) + '</b> (' + esc(d.email) + ') can now sign in. They’ve been emailed.</p>');
    }
    return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">That approval link wasn’t found.</p>');
  } finally { lock.releaseLock(); }
}

function hash(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + '|pp')); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* Run once from the editor: makes the tabs, a first code, and adds Jesse as a member. */
function setup() {
  tab(T.codes); tab(T.members); tab(T.requests);
  if (!rows(T.codes).length) tab(T.codes).appendRow(['POPPRO', 'Launch code (everyone who had access)', true, 0, new Date()]);
  addMember({ email: low(owner()), name: 'Jesse Stamm', team: 'Optimum' }, 'Owner');
  if (!PropertiesService.getScriptProperties().getProperty('ACCESS_SECRET'))
    PropertiesService.getScriptProperties().setProperty('ACCESS_SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('Secret: ' + PropertiesService.getScriptProperties().getProperty('ACCESS_SECRET'));
}
