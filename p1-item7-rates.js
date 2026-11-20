/* P1 item 7 v5: import a scheme's own chiropractic rate file (user-approved 2026-10-16).
 * CSV or XLSX: the GEMS TRF003 layout (Tariff Code / Tariff Description / <year> Tariff Value) or the template code,description,rand_amount.
 * Codes must exist in the GEMS discipline 004 code list. Scheme, version and effective date are entered by the user (required, no defaults).
 * Stored offline in localStorage with file name, SHA-256, import date, and a history of imports / replacements / deletions. No network.
 */
(function () {
  'use strict';
  var KEY = 'chiroclinic_p7_scheme_rates';
  function B() { return window.P1Billing; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() { try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.tables) return d; } catch (e) {} return { tables: {}, history: [] }; }
  function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function get(id) { return load().tables[id] || null; }
  function gemsCodes() { return B().TARIFFS.gems2026.codes; }

  // ---------- parsing ----------
  function parseCsv(text) {
    text = String(text).replace(/^\uFEFF/, ''); var rows = [], row = [], f = '', q = false, i, c, sep = ',';
    var first = text.split(/\r?\n/)[0] || ''; if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) sep = ';';
    for (i = 0; i < text.length; i++) { c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  async function inflateRaw(u8) { var ds = new DecompressionStream('deflate-raw'); var s = new Blob([u8]).stream().pipeThrough(ds); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf) { // minimal ZIP reader (central directory), stored + deflate
    var u8 = new Uint8Array(buf), dv = new DataView(buf), eocd = -1, i;
    for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a valid XLSX (zip) file');
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), files = {}, td = new TextDecoder();
    for (i = 0; i < n; i++) { var meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = td.decode(u8.subarray(p + 46, p + 46 + nl)); var lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), start = off + 30 + lnl + lel;
      files[name] = { meth: meth, data: u8.subarray(start, start + csz) }; p += 46 + nl + el + cl; }
    return { names: Object.keys(files), read: async function (nm) { var f = files[nm]; if (!f) return null; var d = f.meth === 0 ? f.data : await inflateRaw(f.data); return new TextDecoder().decode(d); } };
  }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref || ''), n = 0; if (!m) return 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }
  async function parseXlsx(buf) {
    var z = await unzip(buf), dp = new DOMParser(), ss = [];
    var sst = await z.read('xl/sharedStrings.xml'); if (sst) { var sd = dp.parseFromString(sst, 'application/xml'); [].forEach.call(sd.getElementsByTagName('si'), function (si) { ss.push([].map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join('')); }); }
    var sheet = 'xl/worksheets/sheet1.xml';
    try { var wb = dp.parseFromString(await z.read('xl/workbook.xml'), 'application/xml'), rels = dp.parseFromString(await z.read('xl/_rels/workbook.xml.rels'), 'application/xml'), s0 = wb.getElementsByTagName('sheet')[0];
      var rid = s0.getAttribute('r:id') || s0.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      [].forEach.call(rels.getElementsByTagName('Relationship'), function (r) { if (r.getAttribute('Id') === rid) { var t = r.getAttribute('Target'); sheet = t.charAt(0) === '/' ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); } }); } catch (e) {}
    var xml = await z.read(sheet); if (!xml) { var cand = z.names.filter(function (x) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(x); }).sort(); if (!cand.length) throw new Error('No worksheet in XLSX'); xml = await z.read(cand[0]); }
    var d = dp.parseFromString(xml, 'application/xml'), rows = [];
    [].forEach.call(d.getElementsByTagName('row'), function (r) { var out = []; [].forEach.call(r.getElementsByTagName('c'), function (c) { var t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
        if (t === 's') val = ss[+(v ? v.textContent : 0)] || ''; else if (t === 'inlineStr') val = [].map.call(c.getElementsByTagName('t'), function (x) { return x.textContent; }).join(''); else val = v ? v.textContent : '';
        out[colIdx(c.getAttribute('r'))] = val; }); for (var i = 0; i < out.length; i++) if (out[i] == null) out[i] = ''; rows.push(out); });
    return rows;
  }
  async function sha256(buf) { return window.ccSha256(buf); } // v7: works on the iPad over http:// too (p1-sha256.js)
  function normCode(v) { var s = String(v == null ? '' : v).trim().replace(/\.0+$/, ''); if (/^\d{1,3}$/.test(s)) s = ('000' + s).slice(-3); return s; }
  function parseRand(v) { var s = String(v == null ? '' : v).trim().replace(/^R\s*/i, '').replace(/\s/g, ''); if (s === '') return { blank: true };
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.'); else s = s.replace(/,/g, ''); if (!/^\d+(\.\d+)?$/.test(s)) return { bad: true }; return { n: Math.round(parseFloat(s) * 100) / 100 }; }
  // detect header row and columns
  function detect(rows) { for (var i = 0; i < Math.min(rows.length, 30); i++) { var r = rows[i].map(function (x) { return String(x || '').toLowerCase().trim(); });
      var c = r.findIndex(function (x) { return x === 'code' || /tariff code/.test(x); }), d = r.findIndex(function (x) { return x === 'description' || /tariff description/.test(x); }), a = r.findIndex(function (x) { return x === 'rand_amount' || /tariff value|amount|rate/.test(x); });
      if (c >= 0 && a >= 0) return { header: i, code: c, desc: d, amount: a }; }
    return { header: -1, code: 0, desc: 1, amount: 2 }; }
  // rows -> validated table
  function validate(rows, map) {
    var G = gemsCodes(), out = {}, items = [], errors = [], unknown = [], seen = {};
    for (var i = map.header + 1; i < rows.length; i++) { var r = rows[i] || [], code = normCode(r[map.code]), desc = map.desc >= 0 ? String(r[map.desc] || '').trim() : '', amt = parseRand(r[map.amount]);
      if (!code) continue;
      var rule = /^0\d\d$/.test(code) && amt.blank && !G[code]; if (rule) continue; // GEMS file general-rule rows (001–006) carry no value
      if (!/^\d{3,5}$/.test(code)) { if (amt.blank) continue; errors.push({ row: i + 1, code: code, msg: 'code is not a tariff code' }); items.push({ row: i + 1, code: code, desc: desc, status: 'error: not a code' }); continue; }
      if (!G[code]) { unknown.push(code); items.push({ row: i + 1, code: code, desc: desc, amount: amt.n, status: 'unknown code (not in GEMS 004 list) — not imported' }); continue; }
      if (seen[code]) { errors.push({ row: i + 1, code: code, msg: 'duplicate code' }); items.push({ row: i + 1, code: code, desc: desc, status: 'error: duplicate' }); continue; }
      seen[code] = 1;
      if (amt.bad) { errors.push({ row: i + 1, code: code, msg: 'rand amount is not numeric: "' + r[map.amount] + '"' }); items.push({ row: i + 1, code: code, desc: desc, status: 'error: amount not numeric' }); continue; }
      if (amt.blank && G[code][1] != null) { errors.push({ row: i + 1, code: code, msg: 'rand amount missing' }); items.push({ row: i + 1, code: code, desc: desc, status: 'error: amount missing' }); continue; }
      out[code] = [desc || G[code][0], amt.blank ? null : amt.n]; items.push({ row: i + 1, code: code, desc: desc || G[code][0], amount: amt.blank ? null : amt.n, status: 'ok' }); }
    var missing = Object.keys(G).filter(function (k) { return !out[k] && G[k][1] != null; });
    return { codes: out, items: items, errors: errors, unknown: unknown, missing: missing, count: Object.keys(out).length };
  }
  async function parseFile(name, buf) { var rows = /\.xlsx$/i.test(name) ? await parseXlsx(buf) : parseCsv(new TextDecoder().decode(buf)); var map = detect(rows); return { name: name, rows: rows, map: map, hash: await sha256(buf), check: validate(rows, map) }; }
  // commit: meta = {scheme, version, effective}; returns {ok, reason}
  function commit(parsed, meta, opt) { opt = opt || {};
    var sc = (B().SCHEMES || []).filter(function (x) { return x.id === (meta || {}).scheme; })[0];
    var miss = []; if (!sc || sc.id === 'gems') miss.push('scheme'); if (!String((meta || {}).version || '').trim()) miss.push('version'); if (!/^\d{4}-\d{2}-\d{2}$/.test(String((meta || {}).effective || ''))) miss.push('effective date (YYYY-MM-DD)');
    if (miss.length) return { ok: false, reason: 'required: ' + miss.join(', ') };
    var chk = validate(parsed.rows, parsed.map); if (chk.errors.length) return { ok: false, reason: chk.errors.length + ' validation error(s)', errors: chk.errors }; if (!chk.count) return { ok: false, reason: 'no valid rate rows' };
    var d = load(), prev = d.tables[sc.id];
    var ask = opt.confirm || function (m) { return window.confirm(m); };
    if (prev && !ask('Replace the imported ' + sc.name + ' table (' + prev.version + ', effective ' + prev.effective + ') with ' + meta.version + '?')) return { ok: false, reason: 'cancelled' };
    var t = { scheme: sc.id, schemeName: sc.name, version: String(meta.version).trim(), effective: meta.effective, file: parsed.name, sha256: parsed.hash, importedAt: new Date().toISOString(), codes: chk.codes, unknown: chk.unknown, missing: chk.missing, layout: parsed.map };
    d.tables[sc.id] = t; d.history.push({ action: prev ? 'replaced' : 'imported', scheme: sc.id, version: t.version, effective: t.effective, file: t.file, sha256: t.sha256, at: t.importedAt, previous: prev ? { version: prev.version, sha256: prev.sha256, file: prev.file } : null }); save(d);
    try { B().render(); } catch (e) {} renderUi(); return { ok: true, table: t };
  }
  function remove(id, opt) { opt = opt || {}; var d = load(), t = d.tables[id]; if (!t) return false;
    var ask = opt.confirm || function (m) { return window.confirm(m); };
    if (!ask('Delete the imported ' + t.schemeName + ' rate table (' + t.version + ')? The account will fall back to GEMS reference rates.')) return false;
    delete d.tables[id]; d.history.push({ action: 'deleted', scheme: id, version: t.version, effective: t.effective, file: t.file, sha256: t.sha256, at: new Date().toISOString() }); save(d); try { B().render(); } catch (e) {} renderUi(); return true; }
  function templateCsv() { var G = gemsCodes(); return 'code,description,rand_amount\r\n' + Object.keys(G).map(function (k) { return k + ',"' + String(G[k][0]).replace(/"/g, '""') + '",'; }).join('\r\n') + '\r\n'; }
  function downloadTemplate() { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' })); a.download = 'scheme_rates_template_004.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true; }

  // ---------- UI ----------
  var pending = null;
  function previewHtml(p) { var c = p.check, cols = Math.max.apply(null, p.rows.slice(0, 40).map(function (r) { return r.length; }).concat([3]));
    function sel(id, v) { var o = '<option value="-1">—</option>'; for (var i = 0; i < cols; i++) o += '<option value="' + i + '"' + (i === v ? ' selected' : '') + '>Column ' + String.fromCharCode(65 + i) + (p.map.header >= 0 ? ' (' + esc(String((p.rows[p.map.header] || [])[i] || '').trim().slice(0, 20)) + ')' : '') + '</option>'; return '<select id="' + id + '">' + o + '</select>'; }
    return '<div class="p7-src">File: ' + esc(p.name) + ' · SHA-256 ' + p.hash.slice(0, 16) + '…</div>' +
      '<div class="grid2"><div><label>Header row</label><input id="p7ImHdr" type="number" min="0" value="' + (p.map.header + 1) + '"></div><div><label>Code column</label>' + sel('p7ImCode', p.map.code) + '</div><div><label>Description column</label>' + sel('p7ImDesc', p.map.desc) + '</div><div><label>Rand amount column</label>' + sel('p7ImAmt', p.map.amount) + '</div></div>' +
      '<div class="p7-iss ' + (c.errors.length ? 'p7-e' : 'p7-ok') + '" id="p7ImSummary">' + c.count + ' rate(s) valid · ' + c.errors.length + ' error(s) · unknown codes: ' + (c.unknown.join(', ') || 'none') + ' · GEMS codes missing from file: ' + (c.missing.join(', ') || 'none') + '</div>' +
      '<table><tr><th>Row</th><th>Code</th><th>Description</th><th>R</th><th>Status</th></tr>' + c.items.slice(0, 60).map(function (x) { return '<tr' + (/^error/.test(x.status) ? ' style="background:#fdecea"' : /unknown/.test(x.status) ? ' style="background:#fff4e0"' : '') + '><td>' + x.row + '</td><td>' + esc(x.code) + '</td><td>' + esc(String(x.desc || '').slice(0, 60)) + '</td><td>' + (x.amount == null ? '' : x.amount.toFixed(2)) + '</td><td>' + esc(x.status) + '</td></tr>'; }).join('') + '</table>' +
      '<div class="grid2"><div><label>Scheme (required)</label><select id="p7ImScheme"><option value="">— choose —</option>' + B().SCHEMES.filter(function (x) { return x.id !== 'gems'; }).map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Version (required)</label><input id="p7ImVer" placeholder="as printed on the scheme file"></div><div><label>Effective date (required)</label><input id="p7ImEff" type="date"></div></div>' +
      '<button type="button" class="btn btn-primary" id="p7ImSave"' + (c.errors.length ? ' disabled' : '') + '>Save imported table</button> <span id="p7ImMsg" style="font-size:12px"></span>'; }
  function remap() { if (!pending) return; pending.map = { header: (+$('p7ImHdr').value || 0) - 1, code: +$('p7ImCode').value, desc: +$('p7ImDesc').value, amount: +$('p7ImAmt').value }; pending.check = validate(pending.rows, pending.map); showPreview(); }
  function showPreview() { var box = $('p7ImPreview'); if (!box) return; box.innerHTML = pending ? previewHtml(pending) : ''; if (!pending) return;
    ['p7ImHdr', 'p7ImCode', 'p7ImDesc', 'p7ImAmt'].forEach(function (id) { $(id).onchange = remap; });
    $('p7ImSave').onclick = function () { var r = commit(pending, { scheme: $('p7ImScheme').value, version: $('p7ImVer').value, effective: $('p7ImEff').value }); $('p7ImMsg') && ($('p7ImMsg').textContent = r.ok ? 'Saved.' : 'Not saved: ' + r.reason); if (r.ok) { pending = null; showPreview(); } }; }
  function listHtml() { var d = load(), ids = Object.keys(d.tables);
    return (ids.length ? '<table><tr><th>Scheme</th><th>Version</th><th>Effective</th><th>File</th><th>SHA-256</th><th>Imported</th><th></th></tr>' + ids.map(function (id) { var t = d.tables[id]; return '<tr><td>' + esc(t.schemeName) + '</td><td>' + esc(t.version) + '</td><td>' + esc(t.effective) + '</td><td>' + esc(t.file) + '</td><td title="' + t.sha256 + '">' + t.sha256.slice(0, 12) + '…</td><td>' + esc(localISODate(new Date(t.importedAt))) + '</td><td><button type="button" class="btn btn-secondary p7-imdel" data-id="' + id + '">Delete</button></td></tr>'; }).join('') + '</table>' : '<em style="font-size:12px">No imported scheme tables.</em>') +
      (d.history.length ? '<details><summary style="font-size:12px">History (' + d.history.length + ')</summary><ul style="font-size:11px">' + d.history.map(function (h) { return '<li>' + esc(localStamp(h.at)) + ' ' + esc(h.action) + ' ' + esc(h.scheme) + ' ' + esc(h.version) + ' (' + esc(h.file) + ', ' + h.sha256.slice(0, 10) + '…)</li>'; }).join('') + '</ul></details>' : ''); }
  function renderUi() { var l = $('p7ImList'); if (!l) return; l.innerHTML = listHtml(); [].forEach.call(l.querySelectorAll('.p7-imdel'), function (b) { b.onclick = function () { remove(b.dataset.id); }; }); }
  function inject() { var card = $('p7Card'); if (!card || $('p7Import')) return;
    var w = document.createElement('details'); w.id = 'p7Import'; w.style.marginTop = '8px';
    w.innerHTML = '<summary style="font-weight:600;font-size:13px">Import scheme rates (CSV / XLSX)</summary><div class="p7-src">Layout: the GEMS TRF003 file (Tariff Code / Tariff Description / Tariff Value) or the template code,description,rand_amount. Codes must be in the GEMS 004 code list. Stored on this device only.</div>' +
      '<div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap"><input type="file" id="p7ImFile" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="width:auto"><button type="button" class="btn btn-secondary" id="p7ImTpl">Download blank template</button></div>' +
      '<div id="p7ImPreview"></div><h4 style="margin:8px 0 4px">Imported tables</h4><div id="p7ImList"></div>';
    card.appendChild(w);
    $('p7ImTpl').onclick = downloadTemplate;
    $('p7ImFile').onchange = async function () { var f = this.files && this.files[0]; if (!f) return; try { pending = await parseFile(f.name, await f.arrayBuffer()); } catch (e) { pending = null; $('p7ImPreview').innerHTML = '<div class="p7-iss p7-e">Could not read the file: ' + esc(e.message) + '</div>'; return; } showPreview(); };
    renderUi(); }
  function hook() { inject(); var t = setInterval(function () { if ($('p7Card')) { inject(); if ($('p7Import')) clearInterval(t); } }, 500); setTimeout(function () { clearInterval(t); }, 30000);
    document.addEventListener('click', function () { setTimeout(inject, 80); }, true); }
  window.P1SchemeRates = { KEY: KEY, get: get, load: load, parseCsv: parseCsv, parseXlsx: parseXlsx, parseFile: parseFile, validate: validate, detect: detect, commit: commit, remove: remove, templateCsv: templateCsv, downloadTemplate: downloadTemplate, inject: inject };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
})();
