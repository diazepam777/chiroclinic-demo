/* P1 latest v3/v4 (2026-10-17): practice for printed documents.
 * User decision 2026-10-17 (Theunis): no weekend patients. Practice days: Wed/Fri Melkbosstrand Chiropractic, Mon/Tue/Thu Vredenburg Practice.
 * On a non-practice day no practice is assumed: every document that shows a practice address asks for a manual choice
 * (same wording as billing) and does not print until a practice is chosen or the date is corrected.
 * Every document also refuses to print while a printed letterhead field is empty, so no empty row is ever printed.
 * v4 (cache v487):
 *  - the manual choice is saved with the visit (gatherAllData key `docPractice`) with an audit log. It is reused on
 *    reload/reprint and by the account. After signing it stays editable as a logged administrative field (also listed
 *    in the signed visit's "Contact/admin changes after signing").
 *  - CCPractice.lineHtml(name): the "Seen at" text line printed under the TJG letterhead image.
 *  - the one-time "Set up practices" prompt in Profile (addresses read from the TJG letterhead footer image; the user
 *    must confirm them). */
(function () {
  'use strict';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // v5 (user decision 2026-10-17): first practice = "Melkbosstrand Chiropractic". Ids are fixed; old saved labels map to the same id.
  var PRACTICES = ['Melkbosstrand Chiropractic', 'Vredenburg Practice'];
  function canon(n) { try { return ccPracticeName(n); } catch (e) { return n || ''; } }
  function pid(n) { try { return ccPracticeId(n); } catch (e) { return ''; } }
  var SETUP_KEY = 'chiroclinic_practice_setup';
  // Exactly as printed in the TJG letterhead footer image (LH_TJG_PRESET.footerImg). Offered as suggestions only.
  var LETTERHEAD = {
    'Melkbosstrand Chiropractic': { addrKey: 'melkbosAddr', phoneKey: 'melkbosPhone', addr: '10 Dunker Street, Van Riebeeckstrand\nMelkbosstrand', phone: '021-556-4594', shown: '10 Dunker Street, Van Riebeeckstrand, Melkbosstrand | 021-556-4594', fAddr: 'prfMelkbosstrandAddr', fPhone: 'prfMelkbosstrandPhone' },
    'Vredenburg Practice': { addrKey: 'vredAddr', phoneKey: 'vredPhone', addr: '8 Voortrekker Rd\nVredenburg', phone: '022-713-2449', shown: '8 Voortrekker Rd, Vredenburg | 022-713-2449', fAddr: 'prfVredAddr', fPhone: 'prfVredPhone' }
  };
  var BTN = 'padding:8px 12px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;';
  var BTN_P = BTN + 'background:#2B5F5C;color:#fff;border:1px solid #2B5F5C', BTN_S = BTN + 'background:#fff;color:#2B5F5C;border:1px solid #2B5F5C', BTN_C = BTN + 'background:#fff;color:#555;border:1px solid #bbb';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function prof() { try { return loadProfile() || {}; } catch (e) { return {}; } }
  function block(name) { try { return profilePracticeBlock(name) || {}; } catch (e) { return {}; } }
  function stamp(iso) { try { return typeof localStamp === 'function' ? localStamp(iso) : new Date(iso).toLocaleString('en-ZA'); } catch (e) { return iso; } }
  function scheduled(iso) { var d = new Date(String(iso || '') + 'T00:00:00'); if (isNaN(d)) return { name: '', day: null }; var w = d.getDay();
    return { name: (w === 3 || w === 5) ? PRACTICES[0] : (w === 1 || w === 2 || w === 4) ? PRACTICES[1] : '', day: w }; }

  // ---------- per-visit store: APP.docPractice = { date, name, at, by, byDate: {iso: {name, at, by}}, log: [...] } ----------
  function store() { if (typeof APP === 'undefined' || !APP) return null; var d = APP.docPractice; if (!d || typeof d !== 'object') return null;
    if (!d.byDate || typeof d.byDate !== 'object') { d.byDate = {}; if (d.date && d.name) d.byDate[d.date] = { name: d.name, at: d.at || '' }; }
    if (!Array.isArray(d.log)) d.log = []; return d; }
  function manualFor(iso) { var d = store(), e = d && d.byDate[iso], n = e ? canon(e.name) : ''; return PRACTICES.indexOf(n) >= 0 ? n : ''; }
  // v5: bring a saved docPractice up to the current labels (state only; the audit log keeps what was recorded and is shown with current labels)
  function migrate(dp) { if (!dp || typeof dp !== 'object') return dp; if (dp.name) { dp.name = canon(dp.name); dp.id = pid(dp.name); }
    if (dp.byDate && typeof dp.byDate === 'object') Object.keys(dp.byDate).forEach(function (k) { var e = dp.byDate[k]; if (e && e.name) { var c = canon(e.name); if (c !== e.name) e.migratedFrom = e.name; e.name = c; e.id = pid(c); } });
    return dp; }
  function forDate(iso) { var s = scheduled(iso); if (s.name) return { name: s.name, needsChoice: false, manual: false, day: s.day };
    var m = manualFor(iso); return m ? { name: m, needsChoice: false, manual: true, day: s.day } : { name: '', needsChoice: true, manual: false, day: s.day }; }
  function prompt(day) { return 'No practice day on ' + (day == null ? 'this visit date' : DAYS[day]) + ' — the clinic does not see patients on weekends. Check the visit date or choose a practice.'; }
  function locked() { try { return !!(APP.p8 && APP.p8.signed); } catch (e) { return false; } }
  // Save with the visit record (same path as the post-sign contact edits in p1-item8.js).
  function persist() { try { if (window.EHR && EHR.currentPatientId && EHR.currentVisitId && typeof EHR_upsertVisit === 'function' && typeof gatherAllData === 'function') {
      var d = gatherAllData(); if (locked()) d.status = 'signed'; EHR_upsertVisit(d); return true; } } catch (e) {} return false; }
  function choose(iso, name, doc) { name = canon(name); if (PRACTICES.indexOf(name) < 0 || typeof APP === 'undefined') return false;
    var d = store() || (APP.docPractice = { byDate: {}, log: [] }); var prev = canon((d.byDate[iso] || {}).name || ''); if (prev === name) return true;
    var pf = prof(), at = new Date().toISOString(), after = locked();
    var e = { at: at, by: pf.name || '', prNo: pf.prNo || '', date: iso || '', from: prev, to: name, fromId: pid(prev), toId: pid(name), doc: doc || '', afterSign: after };
    d.byDate[iso] = { name: name, id: pid(name), at: at, by: e.by }; d.date = iso; d.name = name; d.id = pid(name); d.at = at; d.by = e.by; d.log.push(e);
    if (after) { try { APP.p8.contactLog = (APP.p8.contactLog || []).concat([{ at: at, by: e.by, prNo: e.prNo, field: 'practice for documents (' + (iso || 'no date') + ')', from: prev, to: name }]); } catch (x) {} }
    persist(); refresh(); return true; }
  function clear() { try { delete APP.docPractice; } catch (e) {} refresh(); }
  function log() { var d = store(); return d ? d.log.slice() : []; }
  function refresh() { try { renderCtl(); } catch (e) {} try { if (window.P1FollowUp && locked()) P1FollowUp.render(); } catch (e) {} try { if (window.P1Billing && document.getElementById('p7Card')) P1Billing.render(); } catch (e) {} }

  // ---------- required printed fields ----------
  function missingPractitioner() { var p = prof(), m = []; if (!String(p.name || '').trim()) m.push('practitioner name'); if (!String(p.quals || '').trim()) m.push('qualifications'); if (!String(p.prNo || '').trim()) m.push('practice number'); return m; }
  function missing(name) { var m = missingPractitioner(); if (name && !String(block(name).addr || '').trim()) m.push(name + ' address'); return m; }
  function missingAll() { var m = missingPractitioner(); PRACTICES.forEach(function (n) { if (!String(block(n).addr || '').trim()) m.push(n + ' address'); }); return m; }
  function missingMsg(title, m) { return title + ' not printed — the Profile is missing: ' + m.join(', ') + '. Fill these in under Profile, then print again.'; }

  // ---------- "Seen at" line under an image letterhead ----------
  function lineText(name) { var b = block(name); if (!name || !String(b.addr || '').trim()) return '';
    return 'Seen at ' + name + ' · ' + String(b.addr).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).join(', ') + (b.phone ? ' · Tel ' + b.phone : ''); }
  function lineHtml(name) { var t = lineText(name); if (!t) return ''; var b = block(name);
    return '<div class="lh-prac" style="font-size:8.5pt;color:#444;text-align:right;margin:-2mm 0 4mm;line-height:1.35">Seen at <b>' + esc(name) + '</b> · ' + esc(String(b.addr).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).join(', ')) + (b.phone ? ' · Tel ' + esc(b.phone) : '') + '</div>'; }

  // ---------- dialogs ----------
  function close() { var x = document.getElementById('ccDocPrac'); if (x) x.remove(); }
  function modal(html) { close(); var m = document.createElement('div'); m.id = 'ccDocPrac'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:12px';
    m.innerHTML = '<div style="background:#fff;color:#222;max-width:520px;width:100%;border-radius:10px;padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,.25);font-size:14px">' + html + '</div>';
    document.body.appendChild(m); return m; }
  function ask(iso, title, retry) { var r = forDate(iso);
    var m = modal('<h3 style="margin:0 0 8px;font-size:16px">' + esc(title) + ': choose a practice</h3>' +
      '<div class="cc-dp-msg" style="background:#fdecea;color:#8a1c12;border-radius:6px;padding:8px 10px;margin-bottom:10px">⚠ ' + esc(prompt(r.day)) + '</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:10px">Visit date: ' + esc(iso || '(none)') + '. Nothing is printed until you choose. The choice is saved with this visit (logged) and used for its other documents and the account.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + PRACTICES.map(function (p) { return '<button type="button" class="btn btn-primary cc-dp-pick" style="' + BTN_P + '" data-p="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') +
      '<button type="button" class="btn btn-secondary cc-dp-date" style="' + BTN_S + '">Check the visit date</button><button type="button" class="btn btn-secondary cc-dp-cancel" style="' + BTN_C + '">Cancel</button></div>');
    [].forEach.call(m.querySelectorAll('.cc-dp-pick'), function (b) { b.onclick = function () { choose(iso, b.getAttribute('data-p'), title); close(); if (typeof retry === 'function') retry(b.getAttribute('data-p')); }; });
    m.querySelector('.cc-dp-cancel').onclick = close;
    m.querySelector('.cc-dp-date').onclick = function () { close(); try { var nb = document.querySelector('.nav button[data-tab="patient"]'); if (nb) nb.click(); var v = document.getElementById('visitDate'); if (v) { v.scrollIntoView({ block: 'center' }); v.focus(); } } catch (e) {} };
    return m; }
  function showMissing(title, m) { var md = modal('<h3 style="margin:0 0 8px;font-size:16px">' + esc(title) + '</h3><div class="cc-dp-msg" style="background:#fdecea;color:#8a1c12;border-radius:6px;padding:8px 10px;margin-bottom:10px">⚠ ' + esc(missingMsg(title, m)) + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (typeof showProfileModal === 'function' ? '<button type="button" class="btn btn-primary cc-dp-profile" style="' + BTN_P + '">Open Profile</button>' : '') + '<button type="button" class="btn btn-secondary cc-dp-cancel" style="' + BTN_C + '">OK</button></div>');
    md.querySelector('.cc-dp-cancel').onclick = close; var op = md.querySelector('.cc-dp-profile'); if (op) op.onclick = function () { close(); showProfileModal(); }; return md; }
  // Use a known practice name (e.g. picked in a form): check required fields only.
  function require(name, title) { name = canon(name); var m = missing(name); if (m.length) { showMissing(title, m); return null; } return name; }
  // Resolve the practice for a document dated `iso`; returns the name, or null (prompt shown, nothing printed).
  function gate(iso, title, retry) { var r = forDate(iso); if (r.needsChoice) { ask(iso, title, retry); return null; } return require(r.name, title); }
  // Documents that print both practices and the practitioner (exercise letters, exam PDF). `needAddr` = addresses are printed as text.
  function requireAll(title, needAddr) { var m = needAddr ? missingAll() : missingPractitioner(); if (m.length) { showMissing(title, m); return false; } return true; }

  // ---------- visit control (Patient tab, under the visit date): shown on a non-practice day or when a choice exists ----------
  function renderCtl() { var v = document.getElementById('visitDate'); if (!v) return; var iso = v.value, r = forDate(iso), d = store(), lg = d ? d.log : [];
    var el = document.getElementById('ccDocPracCtl'); var show = r.needsChoice || r.manual || lg.length;
    if (!el) { if (!show) return; el = document.createElement('div'); el.id = 'ccDocPracCtl'; el.style.cssText = 'grid-column:1/-1;font-size:12px;margin:4px 0 6px;padding:6px 8px;border:1px solid #d6e4e3;border-radius:6px;background:#f4f9f8';
      var host = v.closest('div'); (host && host.parentNode ? host.parentNode : v.parentNode).insertBefore(el, host ? host.nextSibling : v.nextSibling); }
    el.style.display = show ? '' : 'none'; if (!show) return;
    var sched = scheduled(iso).name;
    el.innerHTML = '<label style="margin:0 6px 0 0;display:inline">Practice for documents</label>' +
      (sched ? '<b>' + esc(sched) + '</b> <span style="color:#555">(practice day)</span>' :
        '<select id="ccDocPracSel" style="width:auto;display:inline-block;padding:3px 6px"><option value="">— choose —</option>' + PRACTICES.map(function (p) { return '<option' + (r.name === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select> ' +
        (r.needsChoice ? '<span class="cc-dp-ctlmsg" style="color:#8a1c12">⚠ ' + esc(prompt(r.day)) + '</span>' : '<span style="color:#555">chosen ' + esc(stamp(d.byDate[iso].at)) + (d.byDate[iso].by ? ' by ' + esc(d.byDate[iso].by) : '') + (locked() ? ' · visit signed: a change is logged' : '') + '</span>')) +
      (lg.length ? '<details style="margin-top:4px"><summary>Change log (' + lg.length + ')</summary><div id="ccDocPracLog">' + lg.map(function (l) { return esc(stamp(l.at)) + ' · ' + esc(l.by) + ' · ' + esc(l.date) + ': ' + esc(canon(l.from) || '—') + ' → ' + esc(canon(l.to)) + (l.doc ? ' (' + esc(l.doc) + ')' : '') + (l.afterSign ? ' · after signing' : ''); }).join('<br>') + '</div></details>' : '');
    var s = document.getElementById('ccDocPracSel'); if (s) s.onchange = function () { if (s.value) choose(iso, s.value, 'Patient tab'); else renderCtl(); }; }

  // ---------- Profile: one-time "Set up practices" (suggestions from the TJG letterhead, confirmed by the user) ----------
  function setupState() { try { return JSON.parse(localStorage.getItem(SETUP_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setupSave(s) { try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch (e) {} }
  function setupPending() { var p = prof(), s = setupState(); if (s.dismissed) return []; var tjg = false; try { tjg = lhIsTJG(); } catch (e) {} if (!tjg) return [];
    return PRACTICES.filter(function (n) { return !String(p[LETTERHEAD[n].addrKey] || '').trim(); }); }
  function confirmSuggestion(name) { name = canon(name); var L = LETTERHEAD[name]; if (!L) return false; var raw = {}; try { raw = JSON.parse(localStorage.getItem('chiroclinic_profile') || '{}') || {}; } catch (e) {}
    var p = Object.assign({}, prof(), raw); if (String(p[L.addrKey] || '').trim()) return false;
    p[L.addrKey] = L.addr; if (!String(p[L.phoneKey] || '').trim()) p[L.phoneKey] = L.phone;
    try { localStorage.setItem('chiroclinic_profile', JSON.stringify(p)); } catch (e) { return false; }
    var a = document.getElementById(L.fAddr), ph = document.getElementById(L.fPhone); if (a && !a.value.trim()) a.value = L.addr; if (ph && !ph.value.trim()) ph.value = L.phone;
    var s = setupState(); s.confirmed = s.confirmed || {}; s.confirmed[name] = { at: new Date().toISOString(), by: p.name || '', source: 'TJG letterhead footer image', addr: L.addr, phone: L.phone }; setupSave(s); return true; }
  function renderSetup() { var modalEl = document.getElementById('profileModal'); if (!modalEl) return; var old = document.getElementById('ccPracSetup'); if (old) old.remove();
    var pend = setupPending(); if (!pend.length) return;
    var anchor = [].filter.call(modalEl.querySelectorAll('.section-label'), function (x) { return /Melkbosstrand Chiropractic/.test(x.textContent); })[0]; if (!anchor) return;
    var box = document.createElement('div'); box.id = 'ccPracSetup'; box.style.cssText = 'border:1px solid #2B5F5C;border-radius:8px;padding:10px;margin:6px 0 12px;background:#f4f9f8;font-size:12.5px;color:#222';
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Set up practices</div><div style="color:#555;margin-bottom:6px">Your documents need each practice\'s address. These are the addresses printed on your letterhead. Nothing is saved until you confirm.</div>' +
      pend.map(function (n) { return '<div class="cc-ps-row" data-p="' + esc(n) + '" style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin:4px 0;flex-wrap:wrap"><div><b>' + esc(n) + '</b>: ' + esc(LETTERHEAD[n].shown) + ' <span style="color:#2B5F5C;font-style:italic">from your letterhead — confirm</span></div><button type="button" class="cc-ps-ok" style="' + BTN_P + '">Confirm</button></div>'; }).join('') +
      '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">' + (pend.length > 1 ? '<button type="button" class="cc-ps-all" style="' + BTN_P + '">Confirm both</button>' : '') + '<button type="button" class="cc-ps-later" style="' + BTN_C + '">Not now</button><button type="button" class="cc-ps-never" style="' + BTN_C + '">I will type them myself</button></div>';
    anchor.parentNode.insertBefore(box, anchor);
    [].forEach.call(box.querySelectorAll('.cc-ps-ok'), function (b) { b.onclick = function () { confirmSuggestion(b.closest('.cc-ps-row').getAttribute('data-p')); try { showToast('Practice address confirmed'); } catch (e) {} renderSetup(); }; });
    var all = box.querySelector('.cc-ps-all'); if (all) all.onclick = function () { pend.forEach(confirmSuggestion); try { showToast('Practice addresses confirmed'); } catch (e) {} renderSetup(); };
    box.querySelector('.cc-ps-later').onclick = function () { box.remove(); };
    box.querySelector('.cc-ps-never').onclick = function () { var s = setupState(); s.dismissed = new Date().toISOString(); setupSave(s); box.remove(); }; }

  // ---------- hooks ----------
  function hook() {
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._ccdp) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (d && typeof d === 'object' && store()) d.docPractice = JSON.parse(JSON.stringify(APP.docPractice)); } catch (e) {} return d; }; window.gatherAllData._ccdp = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._ccdp) { var rd = window.restoreData; window.restoreData = function (data) { var r = rd.apply(this, arguments); try { if (data && data.docPractice) APP.docPractice = migrate(JSON.parse(JSON.stringify(data.docPractice))); else delete APP.docPractice; } catch (e) {} setTimeout(renderCtl, 0); return r; }; window.restoreData._ccdp = 1; }
    if (typeof window.showProfileModal === 'function' && !window.showProfileModal._ccdp) { var sp = window.showProfileModal; window.showProfileModal = function () { var r = sp.apply(this, arguments); try { renderSetup(); } catch (e) {} return r; }; window.showProfileModal._ccdp = 1; }
    var v = document.getElementById('visitDate'); if (v) { v.addEventListener('input', renderCtl); v.addEventListener('change', renderCtl); }
    renderCtl(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else setTimeout(hook, 0);
  window.CCPractice = { DAYS: DAYS, PRACTICES: PRACTICES, LETTERHEAD: LETTERHEAD, SETUP_KEY: SETUP_KEY, scheduled: scheduled, canon: canon, id: pid, migrate: migrate, forDate: forDate, manualFor: manualFor, prompt: prompt, choose: choose, clear: clear, log: log, persist: persist,
    missing: missing, missingAll: missingAll, missingPractitioner: missingPractitioner, missingMsg: missingMsg, ask: ask, require: require, requireAll: requireAll, gate: gate, close: close,
    lineText: lineText, lineHtml: lineHtml, renderCtl: renderCtl, renderSetup: renderSetup, setupPending: setupPending, confirmSuggestion: confirmSuggestion, setupState: setupState };
})();
