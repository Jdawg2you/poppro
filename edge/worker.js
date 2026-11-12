/* MyPopPro's front door (Jesse, 11 Nov 2026). A Cloudflare Worker in front of the static site.
   - Public: the landing page, its assets, the sign-in page, and the two pages clients open from our emails
     (the care card /tool/card/ and the CareGuide contact /tool/careguide.vcf).
   - Everything else needs a signed session cookie. No session: HTML requests get the sign-in page, the rest a 401.
   - Who is a member, the access codes and the requests live in the "MyPopPro access" Google Sheet. The Apps Script
     bound to it (tools/access-apps-script.gs) is the only thing that reads or writes it; this Worker calls it with a
     shared secret. Client information never comes through here: it stays in the agent's browser.
   Secrets (wrangler secret put): SESSION_KEY, ACCESS_SECRET, AUDIT_KEY. Var: ACCESS_URL (the Apps Script /exec URL). */

const COOKIE = 'pp_s';
const SESSION_DAYS = 30;          /* signed in this long on one device. Counted from when they signed in, so changing it
                                     (say to 30, or 5) applies to everyone at once, not just new sign-ins. */
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

    /* the sign-in cookie is Secure: plain http would sign people in and then forget them. www goes to the bare domain. */
    if (url.protocol === 'http:' && !env.LOCAL_DEV) { url.protocol = 'https:'; return Response.redirect(url.toString(), 301); }
    if (url.hostname === 'www.mypoppro.com') { url.hostname = 'mypoppro.com'; return Response.redirect(url.toString(), 301); }

    if (p.startsWith('/auth/')) return auth(req, env, url);
    if (PUBLIC.some(r => r.test(p))) return serve(req, env);

    /* our own audit scripts */
    if (env.AUDIT_KEY && req.headers.get('x-pp-key') === env.AUDIT_KEY) return serve(req, env);

    const s = await readSession(req, env);
    if (s) {
      if (Date.now() - s.chk > RECHECK_HOURS * 3600e3) {
        const r = await sheet(env, { a: 'check', email: s.e }).catch(() => null);
        if (r && r.ok && r.member === false) return signinPage(req, env, url, true);
        if (r && r.ok) { const res = await serve(req, env); return withCookie(res, await makeCookie(env, url, { e: s.e, n: s.n, iat: s.iat, chk: Date.now() })); }
        /* the Sheet could not be reached: let them in, ask again next time */
      }
      return serve(req, env);
    }
    return signinPage(req, env, url, false);
  },
};

/* Cloudflare's static files carry no Last-Modified. MyPopPro's "new version" check (ppUpdateCheck in tool/index.html)
   compares that header with document.lastModified, so every response gets the deploy time (DEPLOYED_AT, set by
   tools/deploy-edge.sh). Each deploy is then a new version, as each GitHub Pages push was. */
async function serve(req, env) {
  const res = await env.ASSETS.fetch(req);
  if (!env.DEPLOYED_AT || res.headers.has('last-modified')) return res;
  const r = new Response(res.body, res);
  r.headers.set('Last-Modified', new Date(env.DEPLOYED_AT).toUTCString());
  return r;
}

/* ---------- sign-in endpoints ---------- */
async function auth(req, env, url) {
  const p = url.pathname;
  if (p === '/auth/signout') return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': clearCookie(url) } });
  if (p === '/auth/me') { const s = await readSession(req, env); return json(s ? { ok: true, email: s.e, name: s.n } : { ok: false }); }
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  if (!sameOrigin(req, url)) return json({ ok: false, error: 'origin' }, 403);
  if (p === '/auth/profile') {                  /* signed in: fill in the NPN / phone we didn't have. Only their own row. */
    const s = await readSession(req, env); if (!s) return json({ ok: false, error: 'Please sign in again.' }, 401);
    let b = {}; try { b = await req.json(); } catch (e) {}
    const npn = String(b.npn || '').replace(/\D/g, '');
    if (b.npn !== undefined && !/^\d{4,10}$/.test(npn)) return json({ ok: false, error: 'Please enter your NPN (National Producer Number).' });
    return json(await sheet(env, { a: 'profile', email: s.e, npn, phone: clip(b.phone, 30) }));
  }
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
    return json({ ok: true, needs: r.needs || [] }, 200, await makeCookie(env, url, { e: email, n: r.name || '', chk: Date.now() }));
  }
  /* Jesse, 12 Nov: someone already in who uses Get access or Ask for access (with or without a code) is just signed in
     as normal: no second row, no request to approve. They get the usual sign-in code. */
  if (p === '/auth/signup' || p === '/auth/request') {
    const c = await sheet(env, { a: 'check', email }).catch(() => null);
    if (c && c.ok && c.member) {
      const r = await sheet(env, { a: 'pin', email, ip });
      return json(r.ok ? { ok: true, sent: true, already: true, name: r.name || '' } : r);
    }
  }
  if (p === '/auth/signup') {                   /* new: invite code checked, then they confirm the email with a 6-digit code */
    if (!who.name) return json({ ok: false, error: 'Please enter your name.' });
    if (!/^\d{4,10}$/.test(who.npn.replace(/\D/g, ''))) return json({ ok: false, error: 'Please enter your NPN (National Producer Number).' });
    const r = await sheet(env, Object.assign({ a: 'signup', code: clip(b.code, 40), ip }, who));
    return json(r);
  }
  if (p === '/auth/request') {                  /* no code: ask Jesse */
    if (!who.name) return json({ ok: false, error: 'Please enter your name.' });
    if (!/^\d{4,10}$/.test(who.npn.replace(/\D/g, ''))) return json({ ok: false, error: 'Please enter your NPN (National Producer Number).' });
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
  const page = await serve(new Request(new URL('/signin/', url), req), env);
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
  data.iat = data.iat || Date.now();
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
    const from = d.iat || (d.exp ? d.exp - 60 * 864e5 : 0);   /* cookies made before iat existed */
    if (!d.e || !(from + SESSION_DAYS * 864e5 > Date.now())) return null;
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
