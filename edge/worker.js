/* MyPopPro's front door (Jesse, 11 Nov 2026). A Cloudflare Worker in front of the static site.
   - Public: the landing page, its assets, the sign-in page, and the two pages clients open from our emails
     (the care card /tool/card/ and the CareGuide contact /tool/careguide.vcf).
   - Everything else needs a signed session cookie. No session: HTML requests get the sign-in page, the rest a 401.
   - Who is a member, the access codes and the requests live in the "MyPopPro access" Google Sheet. The Apps Script
     bound to it (tools/access-apps-script.gs) is the only thing that reads or writes it; this Worker calls it with a
     shared secret. Client information never comes through here: it stays in the agent's browser.
   Secrets (wrangler secret put): SESSION_KEY, ACCESS_SECRET, AUDIT_KEY. Var: ACCESS_URL (the Apps Script /exec URL). */

const COOKIE = 'pp_s';
const SESSION_DAYS = 60;          /* signed in this long on one device */
const RECHECK_HOURS = 12;         /* how often a session asks the Sheet whether the member is still active */

const PUBLIC = [
  /^\/$/, /^\/index\.html$/, /^\/favicon\.ico$/, /^\/assets\//, /^\/robots\.txt$/,
  /^\/signin\/?/, /^\/auth\//,
  /^\/tool\/card\//, /^\/tool\/card$/, /^\/tool\/careguide\.vcf$/,
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p.startsWith('/auth/')) return auth(req, env, url);
    if (PUBLIC.some(r => r.test(p))) return env.ASSETS.fetch(req);

    /* our own audit scripts */
    if (env.AUDIT_KEY && req.headers.get('x-pp-key') === env.AUDIT_KEY) return env.ASSETS.fetch(req);

    const s = await readSession(req, env);
    if (s) {
      if (Date.now() - s.chk > RECHECK_HOURS * 3600e3) {
        const r = await sheet(env, { a: 'check', email: s.e }).catch(() => null);
        if (r && r.ok && r.member === false) return signinPage(req, env, url, true);
        if (r && r.ok) { const res = await env.ASSETS.fetch(req); return withCookie(res, await makeCookie(env, url, { e: s.e, n: s.n, chk: Date.now() })); }
        /* the Sheet could not be reached: let them in, ask again next time */
      }
      return env.ASSETS.fetch(req);
    }
    return signinPage(req, env, url, false);
  },
};

/* ---------- sign-in endpoints ---------- */
async function auth(req, env, url) {
  const p = url.pathname;
  if (p === '/auth/signout') return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': clearCookie(url) } });
  if (p === '/auth/me') { const s = await readSession(req, env); return json(s ? { ok: true, email: s.e, name: s.n } : { ok: false }); }
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  if (!sameOrigin(req, url)) return json({ ok: false, error: 'origin' }, 403);
  let b = {}; try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'bad request' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Please enter a valid email address.' });
  const who = { email, name: clip(b.name, 80), phone: clip(b.phone, 30), npn: clip(b.npn, 20), team: clip(b.team, 120) };
  const ip = req.headers.get('cf-connecting-ip') || '';

  if (p === '/auth/start') {                    /* returning member: email them a 6-digit code */
    const r = await sheet(env, { a: 'pin', email, ip });
    return json(r);
  }
  if (p === '/auth/verify') {                   /* the code they typed */
    const r = await sheet(env, { a: 'verify', email, pin: String(b.pin || '').replace(/\D/g, '') });
    if (!r.ok) return json(r);
    return json({ ok: true }, 200, await makeCookie(env, url, { e: email, n: r.name || '', chk: Date.now() }));
  }
  if (p === '/auth/signup') {                   /* new: an access code gets them straight in */
    if (!who.name) return json({ ok: false, error: 'Please enter your name.' });
    const r = await sheet(env, Object.assign({ a: 'signup', code: clip(b.code, 40), ip }, who));
    if (!r.ok) return json(r);
    return json({ ok: true }, 200, await makeCookie(env, url, { e: email, n: who.name, chk: Date.now() }));
  }
  if (p === '/auth/request') {                  /* no code: ask Jesse */
    if (!who.name) return json({ ok: false, error: 'Please enter your name.' });
    const r = await sheet(env, Object.assign({ a: 'request', note: clip(b.note, 500), ip }, who));
    return json(r);
  }
  return json({ ok: false, error: 'not found' }, 404);
}

async function sheet(env, body) {
  if (!env.ACCESS_URL) return { ok: false, error: 'Sign-in is not set up yet.' };
  const r = await fetch(env.ACCESS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(Object.assign({ secret: env.ACCESS_SECRET }, body)), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'Sign-in is having trouble. Please try again in a minute.' }; }
}

/* ---------- the sign-in page ---------- */
async function signinPage(req, env, url, removed) {
  const accept = req.headers.get('accept') || '';
  if (!/text\/html/.test(accept) && req.method === 'GET' && !/\.html?$|\/$/.test(url.pathname)) return new Response('Sign in required', { status: 401 });
  const page = await env.ASSETS.fetch(new Request(new URL('/signin/', url), req));
  const h = new Headers(page.headers); h.set('Cache-Control', 'no-store');
  const res = new Response(page.body, { status: 200, headers: h });
  return removed ? withCookie(res, clearCookie(url)) : res;
}

/* ---------- sessions: a signed cookie, nothing stored ---------- */
async function key(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_KEY || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function makeCookie(env, url, data) {
  data.exp = Date.now() + SESSION_DAYS * 864e5;
  const body = b64u(new TextEncoder().encode(JSON.stringify(data)));
  const sig = b64u(await crypto.subtle.sign('HMAC', await key(env), new TextEncoder().encode(body)));
  return `${COOKIE}=${body}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax${domainAttr(url)}`;
}
async function readSession(req, env) {
  if (!env.SESSION_KEY) return null;
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(env), unb64u(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!d.e || !(d.exp > Date.now())) return null;
    return d;
  } catch (e) { return null; }
}
function clearCookie(url) { return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax${domainAttr(url)}`; }
/* one sign-in covers mypoppro.com and sandbox.mypoppro.com */
function domainAttr(url) { return /(^|\.)mypoppro\.com$/.test(url.hostname) ? '; Domain=mypoppro.com' : ''; }
function withCookie(res, c) { const r = new Response(res.body, res); r.headers.append('Set-Cookie', c); return r; }

/* ---------- small things ---------- */
function json(o, status = 200, cookie) {
  const h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const r = new Response(JSON.stringify(o), { status, headers: h });
  if (cookie) r.headers.append('Set-Cookie', cookie);
  return r;
}
function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function sameOrigin(req, url) { const o = req.headers.get('origin'); return !o || o === url.origin; }
