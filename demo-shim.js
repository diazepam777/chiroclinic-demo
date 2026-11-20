/* ChiroClinic DEMO: browser-only. Answers /api/* from this device's storage. No server, no real patient data. */
(function(){
  var K='cc_demo_diary';
  function db(){try{return JSON.parse(localStorage.getItem(K))||{entries:[],patients:[]};}catch(e){return {entries:[],patients:[]};}}
  function save(d){localStorage.setItem(K,JSON.stringify(d));}
  function iso(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  function nid(){return Date.now().toString(36)+'-'+Math.random().toString(16).slice(2,10);}
  function J(o,s){return Promise.resolve(new Response(JSON.stringify(o),{status:s||200,headers:{'Content-Type':'application/json'}}));}
  var real=window.fetch.bind(window);
  window.fetch=function(input,opt){
    var url=typeof input==='string'?input:(input&&input.url)||''; var u; try{u=new URL(url,location.href);}catch(e){return real(input,opt);}
    var i=u.pathname.indexOf('/api/'); if(u.origin!==location.origin||i<0) return real(input,opt);
    var p=u.pathname.slice(i), m=((opt&&opt.method)||(input&&input.method)||'GET').toUpperCase(), body={};
    try{ if(opt&&opt.body) body=JSON.parse(opt.body);}catch(e){}
    if(p==='/api/health') return J({ok:true,authRequired:false,authenticated:false,intake:false,version:'4.5.4-demo',mode:'DEMO (browser only)',diary:true,visits:false,chart:false,diarySlots:'15min 07:30-19:00',bioflexLaserColumn:true,dermatomeImages:true,firebase:false});
    if(p==='/api/diary'&&m==='GET'){var d=db(),ws=u.searchParams.get('weekStart')||iso(new Date()),s=new Date(ws+'T00:00:00'),e=new Date(s);e.setDate(s.getDate()+7);var a=iso(s),b=iso(e);
      return J({ok:true,entries:d.entries.filter(function(x){return x.date>=a&&x.date<b;}).sort(function(x,y){return (x.date+x.time).localeCompare(y.date+y.time);}),patients:d.patients});}
    if(p==='/api/diary/entry'&&m==='POST'){var d2=db(),en=body;if(!en.date||!en.time)return J({ok:false,error:'date and time required'},400);if(!en.id)en.id=nid();en.updatedAt=new Date().toISOString();if(!en.createdAt)en.createdAt=en.updatedAt;
      var ix=d2.entries.findIndex(function(x){return x.id===en.id;});if(ix>=0)d2.entries[ix]=en;else d2.entries.push(en);
      if((en.type==='booking'||en.type==='bioflex')&&en.patient){var k=en.patient.toLowerCase().trim(),pi=d2.patients.findIndex(function(q){return (q.name||'').toLowerCase().trim()===k;}),pt={name:en.patient,phone:en.phone||'',lastSeen:en.date};if(pi>=0)d2.patients[pi]=Object.assign({},d2.patients[pi],pt);else d2.patients.push(Object.assign({id:nid()},pt));}
      save(d2);return J({ok:true,entry:en});}
    if(p.indexOf('/api/diary/entry/')===0&&m==='DELETE'){var d3=db(),idd=decodeURIComponent(p.split('/').pop());d3.entries=d3.entries.filter(function(x){return x.id!==idd;});save(d3);return J({ok:true});}
    if(p==='/api/diary/backup') return J({ok:true,file:'demo-only',sha256:''});
    return J({ok:false,error:'demo: not available'},404);
  };
  document.addEventListener('DOMContentLoaded',function(){var b=document.createElement('div');b.textContent='DEMO \u2013 sample data only';b.style.cssText='position:fixed;bottom:6px;left:6px;z-index:99999;background:#2B5F5C;color:#fff;font:12px -apple-system,sans-serif;padding:3px 8px;border-radius:6px;opacity:.85;pointer-events:none';document.body.appendChild(b);});
})();
