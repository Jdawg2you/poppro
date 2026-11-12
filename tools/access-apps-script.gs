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
    if (d.a === 'profile') return out(profile(d));
    return out({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out({ ok: false, error: 'Sign-in is having trouble. Please try again in a minute.', detail: String(err) });
  } finally { lock.releaseLock(); }
}

/* Every sign-in confirms the email with a 6-digit code (Jesse, 11 Nov: one person per login, no sharing).
   kind: 'welcome' (an early user's first time), 'confirm' (a new sign-up), 'signin' (everyone else). */
function mintPin(email, kind) {
  var c = CacheService.getScriptCache(), sentKey = 'sent:' + email, sent = +(c.get(sentKey) || 0);
  if (sent >= 5) return { ok: false, error: 'Too many codes sent. Please wait an hour, or use the last code we emailed you.' };
  var pin = String(Math.floor(100000 + Math.random() * 900000));
  c.put('pin:' + email, JSON.stringify({ h: hash(pin), tries: 0 }), 600);
  c.put(sentKey, String(sent + 1), 3600);
  var intro = kind === 'welcome' ? 'Welcome back, and thank you for being one of the first agents on MyPopPro.\n\nMyPopPro now has a sign-in. '
    : kind === 'confirm' ? 'Welcome to MyPopPro. One step left: confirm this is your email. ' : '';
  MailApp.sendEmail({ to: email, name: 'MyPopPro', subject: 'Your MyPopPro code: ' + pin,
    body: intro + 'Your code is ' + pin + '\n\nEnter it on the MyPopPro page to stay signed in for 30 days on this device. It works for 10 minutes.' +
      '\n\nIf you did not ask for it, you can ignore this email.\n\n' + SITE });
  return { ok: true };
}

/* ---- returning member ---- */
function sendPin(d) {
  var r = memberRow(d.email);
  if (!r) return { ok: true, member: false };
  var row = tab(T.members).getRange(r, 1, 1, 9).getValues()[0];
  var early = /^Early user/.test(String(row[5])) && !row[8];   /* never signed in under the new sign-in */
  var m = mintPin(d.email, early ? 'welcome' : 'signin');
  if (!m.ok) return m;
  return { ok: true, member: true, early: early, name: String(row[1] || '').split(' ')[0] };
}
function verify(d) {
  var c = CacheService.getScriptCache(), k = 'pin:' + d.email, s = c.get(k);
  if (!s) return { ok: false, error: 'That code has expired. Ask for a new one.' };
  s = JSON.parse(s);
  if (s.tries >= 5) { c.remove(k); return { ok: false, error: 'Too many tries. Ask for a new code.' }; }
  if (hash(String(d.pin || '')) !== s.h) { s.tries++; c.put(k, JSON.stringify(s), 600); return { ok: false, error: 'That code is not right. Check the email and try again.' }; }
  c.remove(k);
  var r = memberRow(d.email);
  if (!r) {                                     /* a new sign-up: the code proved the email, so they join now */
    var p = c.get('signup:' + d.email);
    if (!p) return { ok: false, error: 'Your access has been removed. Sign up again with a current invite code.' };
    p = JSON.parse(p); c.remove('signup:' + d.email);
    var cs = tab(T.codes), cv = rows(T.codes);
    for (var i = 0; i < cv.length; i++) if (low(cv[i][0]).replace(/\s+/g, '') === p.code) cs.getRange(i + 2, 4).setValue((+cv[i][3] || 0) + 1);
    r = addMember(p, p.how);
  }
  var sh = tab(T.members); sh.getRange(r, 9).setValue(new Date());
  var row = sh.getRange(r, 1, 1, 9).getValues()[0], needs = [];
  if (!String(row[3]).replace(/\D/g, '')) needs.push('npn');
  if (String(row[2]).replace(/\D/g, '').length < 10) needs.push('phone');
  return { ok: true, name: row[1], needs: needs };
}

/* ---- new agent with an invite code: check the code, then confirm the email ---- */
function signup(d) {
  var code = low(d.code).replace(/\s+/g, '');
  if (!code) return { ok: false, needCode: true, error: 'Enter your invite code, or ask us for one below.' };
  if (memberRow(d.email)) { var m0 = mintPin(d.email, 'signin'); return m0.ok ? { ok: true, sent: true, already: true } : m0; }
  var v = rows(T.codes);
  for (var i = 0; i < v.length; i++) {
    var active = v[i][2] === true || /^(true|yes|y|1)$/i.test(String(v[i][2]));
    if (low(v[i][0]).replace(/\s+/g, '') === code && active) {
      CacheService.getScriptCache().put('signup:' + d.email, JSON.stringify({ email: d.email, name: d.name, phone: d.phone, npn: d.npn, team: d.team,
        code: code, how: 'Code ' + v[i][0] + (v[i][1] ? ' (' + v[i][1] + ')' : '') }), 1800);
      var m = mintPin(d.email, 'confirm');
      return m.ok ? { ok: true, sent: true } : m;
    }
  }
  return { ok: false, badCode: true, error: 'That invite code isn’t working. Check it, or ask us for access below.' };
}

/* ---- a signed-in member fills in what we didn't have (NPN, phone). The Worker only sends the session's own email. ---- */
function profile(d) {
  var r = memberRow(d.email); if (!r) return { ok: false, error: 'Please sign in again.' };
  var sh = tab(T.members), npn = String(d.npn || '').replace(/\D/g, ''), ph = String(d.phone || '').trim();
  if (npn) sh.getRange(r, 4).setValue(npn);
  if (ph.replace(/\D/g, '').length >= 10) sh.getRange(r, 3).setValue(ph);
  return { ok: true };
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
  Logger.log('Setup done.');   /* the secret stays in Script Properties; never log it */
}

/* Run once from the editor at launch: everyone in the old "POP Pro Registrations" Sheet becomes a member tagged
   "Early user" (one row per email, the latest registration wins). They sign in with their email and a 6-digit code,
   then add their NPN. Safe to run again: existing members are skipped. */
var REGISTRATIONS_ID = '1muwX6d7ju4gK4tgl1XJES8O6bCIQ4u0-vVMG0akYBpY';
function importEarlyUsers() {
  var v = SpreadsheetApp.openById(REGISTRATIONS_ID).getSheets()[0].getDataRange().getValues().slice(1), seen = {}, added = 0;
  v.sort(function (a, b) { return new Date(b[0]) - new Date(a[0]); });
  v.forEach(function (x) {
    var email = low(x[2]); if (!/@/.test(email) || seen[email]) return; seen[email] = 1;
    if (memberRow(email)) return;
    tab(T.members).appendRow([email, String(x[1] || '').trim(), x[3] || '', '', String(x[4] || '').trim(), 'Early user (registered ' +
      Utilities.formatDate(new Date(x[0]), Session.getScriptTimeZone(), 'd MMM yyyy') + ')', new Date(), 'Active', '']);
    added++;
  });
  Logger.log('Early users added: ' + added + ' of ' + Object.keys(seen).length + ' emails');
}
