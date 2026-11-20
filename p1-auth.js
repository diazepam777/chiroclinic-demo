/* P1 item 9 v2 — staff login screen for the Node server. Static / offline mode: does nothing (status endpoint absent).
 * Logged out on the server: overlay with login (or first-run setup on the Mac); "Continue offline" keeps the local-data app working as before. */
(function () {
  'use strict';
  if (window.P1_INTAKE_KIOSK) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tfetch(url, opt, ms) { var ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(function () { if (ac) ac.abort(); }, ms || 4000);
    return fetch(url, Object.assign({ cache: 'no-store', credentials: 'same-origin' }, opt || {}, ac ? { signal: ac.signal } : {})).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; }); }
  function post(url, body) { return tfetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); }); }
  // health first (static server: 404 on health only), then status
  function status() { return tfetch('./api/health').then(function (r) { var ct = (r.headers.get('content-type') || ''); if (!r.ok || ct.indexOf('json') < 0) return null; return r.json(); }).then(function (h) { if (!h || !h.authRequired) return null; return tfetch('./api/auth/status').then(function (r) { var ct = (r.headers.get('content-type') || ''); if (!r.ok || ct.indexOf('json') < 0) return null; return r.json(); }); }).catch(function () { return null; }); }
  var S = null;
  function overlay(st) {
    var old = document.getElementById('p9AuthOverlay'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'p9AuthOverlay';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(20,40,40,.82);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';
    var inp = 'style="width:100%;padding:11px;border:1px solid #ccd;border-radius:8px;font-size:16px;margin:4px 0 10px;box-sizing:border-box"';
    var btn = 'style="width:100%;padding:12px;border:0;border-radius:8px;font-size:16px;background:#2B5F5C;color:#fff"';
    var body;
    if (st.setupRequired && st.setupAllowedHere) body = '<h2 style="margin:0 0 6px">Set up the staff login</h2><p style="font-size:13px;color:#555">First run on this Mac. There is no default password. Choose a username and a password of at least ' + st.minPassword + ' characters. Only a salted scrypt hash is stored.</p>' +
      '<label>Username</label><input id="p9aUser" autocomplete="username" ' + inp + '><label>Password</label><input id="p9aPass" type="password" autocomplete="new-password" ' + inp + '><label>Repeat password</label><input id="p9aPass2" type="password" autocomplete="new-password" ' + inp + '>' +
      '<button type="button" id="p9aGo" ' + btn + '>Create staff login</button>';
    else if (st.setupRequired) body = '<h2 style="margin:0 0 6px">Staff login not set up yet</h2><p style="font-size:14px">Open the app on the Mac that runs the server (http://localhost) to create the staff login. Until then this device works from its own local data only.</p>';
    else body = '<h2 style="margin:0 0 6px">Staff login</h2><p style="font-size:13px;color:#555">The clinic server needs a staff login before charts, diary and intake are shared.</p>' +
      '<label>Username</label><input id="p9aUser" autocomplete="username" ' + inp + '><label>Password</label><input id="p9aPass" type="password" autocomplete="current-password" ' + inp + '>' +
      '<button type="button" id="p9aGo" ' + btn + '>Log in</button>';
    m.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:20px">' + body + '<div id="p9aMsg" style="color:#a00;font-size:13px;min-height:1.2em;margin-top:8px"></div>' +
      '<button type="button" id="p9aOffline" style="width:100%;margin-top:6px;padding:10px;border:1px solid #ccd;border-radius:8px;background:#fff;font-size:14px">Continue offline (this device\'s local data only)</button></div>';
    document.body.appendChild(m);
    var go = document.getElementById('p9aGo'), msg = document.getElementById('p9aMsg');
    document.getElementById('p9aOffline').onclick = function () { m.remove(); };
    if (!go) return;
    function submit() {
      var u = document.getElementById('p9aUser').value.trim(), p = document.getElementById('p9aPass').value, p2 = document.getElementById('p9aPass2');
      if (p2 && p2.value !== p) { msg.textContent = 'Passwords differ'; return; }
      go.disabled = true; post(st.setupRequired ? './api/auth/setup' : './api/auth/login', { username: u, password: p }).then(function (j) {
        if (j.ok) { location.reload(); return; } go.disabled = false; msg.textContent = j.error || 'Login failed'; document.getElementById('p9aPass').value = ''; }).catch(function () { go.disabled = false; msg.textContent = 'Server not reachable'; });
    }
    go.onclick = submit; m.querySelectorAll('input').forEach(function (i) { i.onkeydown = function (e) { if (e.key === 'Enter') submit(); }; });
    var f = document.getElementById('p9aUser'); if (f) f.focus();
  }
  function logoutBtn(st) {
    if (document.getElementById('p9Logout')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'p9Logout'; b.textContent = '🔓 Log out (' + st.user + ')';
    b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9000;background:#fff;border:1px solid #2B5F5C;color:#2B5F5C;border-radius:16px;padding:6px 12px;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.15)';
    b.onclick = function () { logout().then(function () { location.reload(); }); }; document.body.appendChild(b);
  }
  function logout() { return post('./api/auth/logout', {}).catch(function () {}); }
  function init() { status().then(function (st) { S = st; window.P1Auth.state = st; if (!st) return; if (st.authenticated) logoutBtn(st); else overlay(st); }); }
  window.P1Auth = { state: null, status: status, logout: logout, init: init };
  // wait until the service worker has settled: a fetch issued while it claims the page can stay pending in Chrome
  function settled(cb) { var done = false, go = function () { if (!done) { done = true; cb(); } }; try { if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function () { setTimeout(go, 300); }); } catch (e) {} setTimeout(go, 2500); }
  if (document.readyState === 'complete') settled(init); else window.addEventListener('load', function () { settled(init); });
})();
