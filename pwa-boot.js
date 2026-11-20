(function(){
  if (!('serviceWorker' in navigator)) return;
  var updateWorker = null, banner = null, reloadRequested = false;
  var hadController = !!navigator.serviceWorker.controller;
  function showUpdateBanner(worker) {
    updateWorker = worker || updateWorker;
    if (banner) return;
    banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;display:flex;align-items:center;justify-content:center;gap:12px;padding:9px 12px;background:#123047;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)';
    banner.innerHTML = '<span>New version ready — tap to reload</span><button type="button" style="border:0;border-radius:999px;padding:6px 12px;background:#f4b942;color:#123047;font-weight:700;cursor:pointer">Reload</button>';
    banner.addEventListener('click', function(){
      reloadRequested = true;
      if (updateWorker) updateWorker.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });
    document.body.appendChild(banner);
  }
  function watchRegistration(reg) {
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', function(){
      var worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function(){
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
      });
    });
  }
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (reloadRequested) window.location.reload();
    else if (hadController) showUpdateBanner();
    hadController = true;
  });
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(watchRegistration).catch(function(err){
      console.warn('ChiroClinic PWA service worker registration failed', err);
    });
  });
})();
