/* P1 v6 audit — accessible names for form controls (WCAG 2.2 SC 1.3.1, 3.3.2, 4.1.2; VoiceOver reads them).
   Many forms put a <label> next to the control without linking it. This links each unnamed control to its visible label
   (label "for", else aria-label from the label / placeholder / row text). It never changes values or clinical text.
   Runs at start and again (debounced) whenever the app renders new controls. */
(function () {
  'use strict';
  function hasName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title) return true;
    if (el.labels && el.labels.length && [].some.call(el.labels, function (l) { return l.textContent.trim(); })) return true;
    return false;
  }
  function txt(n) { return String((n && n.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function isCtl(n) { return n && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName); }
  function freeLabel(l) { return l && l.tagName === 'LABEL' && !l.htmlFor && !l.querySelector('input,select,textarea') && txt(l); }
  function nearLabel(el) {
    var n = el.previousElementSibling, hops = 0;
    while (n && hops < 3) { if (freeLabel(n)) return n; if (isCtl(n) || (n.querySelector && n.querySelector('input,select,textarea'))) return null; n = n.previousElementSibling; hops++; }
    var p = el.parentElement; if (p && p.children.length <= 3) { var f = p.firstElementChild; if (f !== el && freeLabel(f)) return f; }
    return null;
  }
  function rowText(el) {
    var c = el.parentElement, hops = 0, t = '';
    while (c && c !== document.body && hops < 4 && !t) { var clone = c.cloneNode(true); [].forEach.call(clone.querySelectorAll('select,option,input,textarea,button,script,style'), function (x) { x.remove(); }); t = txt(clone); c = c.parentElement; hops++; }
    return t.length > 140 ? t.slice(0, 137) + '…' : t;
  }
  function fix(root) {
    var list = (root || document).querySelectorAll('input:not([type=hidden]),select,textarea');
    for (var i = 0; i < list.length; i++) { var el = list[i]; if (hasName(el)) continue;
      var l = nearLabel(el);
      if (l) { if (el.id && !document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]')) { l.htmlFor = el.id; continue; } el.setAttribute('aria-label', txt(l)); continue; }
      var ph = el.getAttribute('placeholder'); if (ph) { el.setAttribute('aria-label', ph); continue; }
      var r = rowText(el); if (r) el.setAttribute('aria-label', r);
    }
  }
  var t = null; function soon() { if (t) return; t = setTimeout(function () { t = null; try { fix(document); } catch (e) {} }, 150); }
  function start() { try { fix(document); } catch (e) {} try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); } catch (e) {} }
  window.P1A11y = { fix: fix };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
