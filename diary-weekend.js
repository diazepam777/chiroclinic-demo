/* P1 latest v2 (user decision 2026-10-17, Theunis: no weekend patients): booking on a Saturday/Sunday shows a warning; saving is still allowed. */
(function(){
  var DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function weekendDay(iso){var d=new Date(String(iso||'')+'T00:00:00');if(isNaN(d))return null;var w=d.getDay();return (w===0||w===6)?DAYS[w]:null;}
  function isPatientEntry(){var t=document.getElementById('eType');return !t||t.value==='booking'||t.value==='bioflex';}
  function weekendCheck(){var de=document.getElementById('eDate');if(!de)return null;var el=document.getElementById('eWeekendWarn');
    if(!el){el=document.createElement('div');el.id='eWeekendWarn';el.setAttribute('role','alert');el.style.cssText='display:none;margin:4px 0 6px;padding:6px 8px;border-radius:6px;background:#fff4e0;color:#7a4b00;font-size:13px';de.insertAdjacentElement('afterend',el);}
    var day=isPatientEntry()?weekendDay(de.value):null;el.style.display=day?'':'none';
    el.textContent=day?'\u26a0 '+day+' — the clinic does not see patients on weekends. Check the date (you can still save this booking).':'';return day;}
  window.diaryWeekendDay=weekendDay;window.diaryWeekendCheck=weekendCheck;
  document.addEventListener('input',function(e){if(e.target&&(e.target.id==='eDate'||e.target.id==='eType'))weekendCheck();},true);
  document.addEventListener('change',function(e){if(e.target&&(e.target.id==='eDate'||e.target.id==='eType'))weekendCheck();},true);
  if(typeof openEntry==='function'){var oe=openEntry;window.openEntry=openEntry=function(){var r=oe.apply(this,arguments);try{weekendCheck();}catch(x){}return r;};}
  if(typeof saveEntry==='function'){var se=saveEntry;window.saveEntry=saveEntry=async function(){var day=null;try{day=weekendCheck();}catch(x){}var r=await se.apply(this,arguments);if(day&&typeof toast==='function')setTimeout(function(){toast('Saved on a '+day+' — the clinic does not see patients on weekends');},50);return r;};}
})();
