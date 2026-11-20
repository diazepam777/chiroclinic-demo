(function(){
  var I = window.P1Intake, K = I.kiosk(), $ = function(id){ return document.getElementById(id); };
  var steps = Array.prototype.slice.call(document.querySelectorAll('section.step')), cur = 0, S;
  var FLOW = ['consent','demo','complaint','history','redflags','questionnaire','review'];
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  history.pushState(null,'',location.href); window.addEventListener('popstate',function(){ history.pushState(null,'',location.href); });
  document.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  function fresh(){ return { consent:null, demo:{}, complaint:{}, vas:null, history:{conditions:[],meds:[]}, redFlags:{}, hyper5pq:null, questionnaire:null }; }
  function show(name){ steps.forEach(function(s){ s.classList.toggle('on', s.dataset.step===name); }); var i = FLOW.indexOf(name); $('progress').firstChild.style.width = (i<0?100:Math.round(i/(FLOW.length-1)*100))+'%'; window.scrollTo(0,0); window.__step = name; }
  function opts(el, list, multi, onPick){ el.innerHTML = list.map(function(o){ var v = Array.isArray(o)?o[1]:o, t = Array.isArray(o)?o[0]:o; return '<button type="button" class="opt" data-v="'+esc(v)+'">'+esc(t)+'</button>'; }).join('');
    el.querySelectorAll('.opt').forEach(function(b){ b.onclick = function(){ if (!multi) el.querySelectorAll('.opt').forEach(function(x){ if (x!==b) x.classList.remove('on'); }); b.classList.toggle('on'); onPick && onPick(); }; }); }
  function picked(el){ return Array.prototype.map.call(el.querySelectorAll('.opt.on'), function(b){ return b.dataset.v; }); }
  function sel(el, list, blank){ el.innerHTML = (blank?'<option value="">Choose…</option>':'') + list.map(function(v){ return '<option>'+esc(v)+'</option>'; }).join(''); }
  function medRow(){ var d = document.createElement('div'); d.className='medrow'; d.innerHTML = '<input type="text" placeholder="Name" class="mN"><input type="text" placeholder="Dose" class="mD"><input type="text" placeholder="How often" class="mF"><button type="button">✕</button>'; d.querySelector('button').onclick=function(){ d.remove(); }; $('hMeds').appendChild(d); }
  function reset(){
    S = fresh(); document.querySelectorAll('input[type=text],input[type=tel],input[type=email],input[type=date],textarea').forEach(function(i){ i.value=''; });
    document.querySelectorAll('input[type=checkbox]').forEach(function(i){ i.checked=false; }); document.querySelectorAll('.opt.on').forEach(function(b){ b.classList.remove('on'); });
    $('hMeds').innerHTML=''; $('cVas').value=0; $('vasVal').textContent='—'; $('guardian').style.display='none';
    sel($('dGender'), I.GENDER, true); sel($('hSmoke'), I.SMOKING, true); sel($('hAlc'), I.ALCOHOL, true); sel($('hEx'), I.EXERCISE, true);
    document.querySelectorAll('.err').forEach(function(e){ e.textContent=''; }); show('consent');
  }
  // v2: never keep a staff session on a kiosk device
  window.addEventListener('load', function(){ setTimeout(function(){ try { fetch('./api/health',{cache:'no-store'}).then(function(r){ if (r.ok) return fetch('./api/auth/logout', { method:'POST', credentials:'same-origin' }); }).catch(function(){}); } catch(e) {} }, 2500); });
  if (!K || !K.active) { $('noKiosk').classList.add('on'); $('staffBtn').style.display='none'; window.__step='nokiosk'; return; }
  $('consentText').innerHTML = I.consentHTML(K);
  opts($('cRegion'), I.REGIONS.map(function(r){ return [r[0], r[1]]; }));
  opts($('cSide'), I.SIDES); opts($('cFreq'), I.FREQ); opts($('cResp'), I.RESPONSE);
  opts($('hCond'), I.CONDITIONS.map(function(c){ return [c[1], c[0]]; }), true);
  $('rfList').innerHTML = I.RF.map(function(r){ return '<div class="rf" data-rf="'+r[0]+'"><div class="q">'+esc(r[1])+'</div><div class="opts">'+I.RF_ANS.map(function(a){ return '<button type="button" class="opt" data-v="'+a[0]+'">'+a[1]+'</button>'; }).join('')+'</div></div>'; }).join('');
  $('h5List').innerHTML = (I.HYPER_5PQ||[]).map(function(q,i){ return '<div class="rf h5" data-h5="'+i+'"><div class="q">'+esc(q)+'</div><div class="opts">'+I.RF_ANS.map(function(a){ return '<button type="button" class="opt" data-v="'+a[0]+'">'+a[1]+'</button>'; }).join('')+'</div></div>'; }).join('');
  $('h5List').querySelectorAll('.h5').forEach(function(row){ row.querySelectorAll('.opt').forEach(function(b){ b.onclick=function(){ var on = b.classList.contains('on'); row.querySelectorAll('.opt').forEach(function(x){ x.classList.remove('on'); }); if (!on) b.classList.add('on'); }; }); });
  $('rfList').querySelectorAll('.rf').forEach(function(row){ row.querySelectorAll('.opt').forEach(function(b){ b.onclick=function(){ row.querySelectorAll('.opt').forEach(function(x){ x.classList.toggle('on', x===b); }); }; }); });
  $('cVas').oninput = $('cVas').onchange = function(){ S.vas = +this.value; $('vasVal').textContent = S.vas + ' / 10'; };
  $('hAddMed').onclick = medRow;
  $('dDob').onchange = function(){ $('guardian').style.display = I.isChild(this.value) ? 'block' : 'none'; };
  function qKey(){ var r = I.REGIONS.filter(function(x){ return x[1]===S.complaint.region; })[0]; var k = r && r[2]; return k && window.P1Outcomes && P1Outcomes.Q[k] && P1Outcomes.Q[k].enabled ? k : ''; }
  function buildQ(){ var k = qKey(), Q = P1Outcomes.Q[k]; $('qTitle').textContent = Q.name.replace(/\s*\(.*\)/,'') === 'NDI' ? 'Neck Disability Index' : 'Oswestry Disability Index v2.1a';
    $('qIntro').textContent = I.Q_INTRO[k]; var prev = (S.questionnaire && S.questionnaire.key===k) ? S.questionnaire.answers : [];
    $('qList').innerHTML = Q.text.map(function(sec,i){ return '<div class="sec" data-qi="'+i+'"><div class="t">Section '+(i+1)+': '+esc(sec[0])+'</div>'+sec[1].map(function(o,j){ return '<button type="button" class="opt'+(prev[i]===j?' on':'')+'" data-v="'+j+'">'+esc(o)+'</button>'; }).join('')+'</div>'; }).join('');
    $('qList').querySelectorAll('.sec').forEach(function(s){ s.querySelectorAll('.opt').forEach(function(b){ b.onclick=function(){ s.querySelectorAll('.opt').forEach(function(x){ x.classList.toggle('on', x===b); }); }; }); }); }
  function collect(step){
    var e = '';
    if (step==='consent'){ if (!$('cConsent').checked) e = 'Please tick the box to consent, or choose “I do not consent”.'; else S.consent = { at:new Date().toISOString(), noticeVersion:I.VERSION, practice:K.practice.name }; }
    if (step==='demo'){ S.demo = { firstName:$('dFirst').value.trim(), lastName:$('dLast').value.trim(), dob:$('dDob').value, idNo:$('dId').value.trim(), gender:$('dGender').value, phone:$('dPhone').value.trim(), email:$('dEmail').value.trim(), medAid:$('dMedAid').value.trim(), medAidNo:$('dMedAidNo').value.trim() };
      if (!S.demo.firstName || !S.demo.lastName || !S.demo.dob) e = 'Please fill in your first name, surname and date of birth.';
      else if (I.ageOn(S.demo.dob) == null || I.ageOn(S.demo.dob) < 0 || I.ageOn(S.demo.dob) > 120) e = 'Please check the date of birth.';
      else if (I.isChild(S.demo.dob)) { if (!$('gName').value.trim() || !$('gRel').value.trim() || !$('gConsent').checked) e = 'A parent or guardian must give their name, relationship and consent.'; else S.consent.guardian = { name:$('gName').value.trim(), relationship:$('gRel').value.trim() }; }
      else if (S.consent) delete S.consent.guardian; }
    if (step==='complaint'){ S.complaint = { region:picked($('cRegion'))[0]||'', side:picked($('cSide'))[0]||'', onset:$('cOnset').value, duration:$('cDuration').value.trim(), frequency:picked($('cFreq'))[0]||'', prevTx:$('cPrevTx').value.trim(), prevResponse:picked($('cResp'))[0]||'' };
      if (!S.complaint.region) e = 'Please choose where the main problem is.'; }
    if (step==='history'){ S.history = { conditions:picked($('hCond')), condOther:$('hCondOther').value.trim(), allergies:$('hAllergies').value.trim(), surgHx:$('hSurg').value.trim(), famHx:$('hFam').value.trim(), smoking:$('hSmoke').value, alcohol:$('hAlc').value, exercise:$('hEx').value, occupation:$('hOcc').value.trim(),
      meds:Array.prototype.map.call($('hMeds').querySelectorAll('.medrow'), function(r){ return { name:r.querySelector('.mN').value.trim(), dose:r.querySelector('.mD').value.trim(), frequency:r.querySelector('.mF').value.trim() }; }).filter(function(m){ return m.name; }) }; }
    if (step==='redflags'){ var miss = 0; S.redFlags = {}; $('rfList').querySelectorAll('.rf').forEach(function(r){ var b = r.querySelector('.opt.on'); if (b) S.redFlags[r.dataset.rf] = b.dataset.v; else miss++; }); if (miss) e = 'Please answer every question (' + miss + ' left). “Not sure” is fine.';
      var h5 = Array.prototype.map.call($('h5List').querySelectorAll('.h5'), function(r){ var b = r.querySelector('.opt.on'); return b ? b.dataset.v : null; }); S.hyper5pq = h5.some(function(v){ return v; }) ? h5 : null; }
    if (step==='questionnaire'){ var k = qKey(), a = []; $('qList').querySelectorAll('.sec').forEach(function(s,i){ var b = s.querySelector('.opt.on'); a[i] = b ? +b.dataset.v : null; }); S.questionnaire = { key:k, answers:a };
      var n = a.filter(function(x){ return x!=null; }).length; if (n < 9) e = 'Please answer every section (' + (10-n) + ' left). Pick the one that is closest.'; }
    var box = document.querySelector('section[data-step="'+step+'"] .err'); if (box) box.textContent = e; return !e;
  }
  function nextOf(step){ var i = FLOW.indexOf(step), n = FLOW[i+1]; if (n==='questionnaire' && !qKey()) { S.questionnaire = null; n = 'review'; } return n; }
  function prevOf(step){ var i = FLOW.indexOf(step), p = FLOW[i-1]; if (p==='questionnaire' && !qKey()) p = 'redflags'; return p; }
  document.querySelectorAll('[data-next]').forEach(function(b){ b.onclick = function(){ var st = window.__step; if (!collect(st)) return; var n = nextOf(st); if (n==='questionnaire') buildQ(); if (n==='review') summary(); show(n); }; });
  document.querySelectorAll('[data-back]').forEach(function(b){ b.onclick = function(){ var st = window.__step; if (st==='questionnaire' || st==='redflags') collect(st); show(prevOf(st)); }; });
  function summary(){ var y = Object.keys(S.redFlags).filter(function(k){ return S.redFlags[k]==='yes'; }).length;
    $('sumBox').innerHTML = esc(S.demo.firstName+' '+S.demo.lastName)+' · born '+esc(S.demo.dob)+'<br>Main problem: '+esc((I.REGIONS.filter(function(r){ return r[1]===S.complaint.region; })[0]||[''])[0])+(S.vas!=null?' · pain '+S.vas+'/10':'')+'<br>Safety questions answered: '+Object.keys(S.redFlags).length+(y?' ('+y+' “yes” — your practitioner will discuss these with you)':'')+(S.questionnaire?'<br>Questionnaire completed':''); }
  $('cDecline').onclick = function(){ S = fresh(); show('declined'); };
  $('restart1').onclick = reset;
  $('sendBtn').onclick = function(){ var b = this; b.disabled = true; var data = JSON.parse(JSON.stringify(S)); I.submit(data).then(function(){ S = fresh(); show('done'); setTimeout(function(){ b.disabled=false; reset(); }, 8000); }); };
  // idle reset: nothing a previous patient typed stays on screen
  var idle; function poke(){ clearTimeout(idle); idle = setTimeout(reset, I.IDLE_MS); } ['touchstart','pointerdown','keydown','input'].forEach(function(ev){ document.addEventListener(ev, poke, true); }); poke();
  $('staffBtn').onclick = function(){ $('pinIn').value=''; $('pinErr').textContent=''; $('pinBox').style.display='flex'; $('pinIn').focus(); };
  $('pinCancel').onclick = function(){ $('pinBox').style.display='none'; };
  $('pinOk').onclick = function(){ var r = I.endKiosk($('pinIn').value); if (r.ok) { location.replace('./index.html'); return; } $('pinErr').textContent = r.reason==='locked' ? 'Too many tries. Wait '+r.wait+' s.' : 'Wrong PIN.'; $('pinIn').value=''; };
  reset();
})();
