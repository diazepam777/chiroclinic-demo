/* P1 v7: SHA-256 that works everywhere.
 * The iPad opens the app over the clinic Wi-Fi as plain http://<Mac>:3000. Browsers treat that as an "insecure context" and remove
 * crypto.subtle, so in v6 signing a note, making a practice backup and checking a rates file failed on the iPad (they worked on the Mac,
 * where http://localhost counts as secure). This file gives the same SHA-256 (FIPS 180-4) in plain JavaScript, so the hashes are
 * identical to crypto.subtle's and every earlier signature still verifies.
 *   ccSha256Hex(input)  -> hex string, synchronous. input: string (UTF-8 encoded) | ArrayBuffer | Uint8Array/typed array view
 *   ccSha256(input)     -> Promise<hex>; uses crypto.subtle when the page has it, otherwise ccSha256Hex.            */
(function () {
  'use strict';
  var K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [], i, c; for (i = 0; i < s.length; i++) { c = s.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } else c = 0xfffd; }
      else if (c >= 0xd800 && c < 0xe000) c = 0xfffd;
      if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63); else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63); }
    return new Uint8Array(out);
  }
  function bytes(input) {
    if (typeof input === 'string') return utf8(input);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return utf8(String(input));
  }
  function hex(input) {
    var m = bytes(input), len = m.length, nBlocks = ((len + 9 + 63) >> 6), w = new Uint32Array(64), i, j, t;
    var buf = new Uint8Array(nBlocks * 64); buf.set(m); buf[len] = 0x80;
    var bits = len * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0, e = buf.length;
    buf[e - 8] = hi >>> 24; buf[e - 7] = hi >>> 16 & 255; buf[e - 6] = hi >>> 8 & 255; buf[e - 5] = hi & 255;
    buf[e - 4] = lo >>> 24; buf[e - 3] = lo >>> 16 & 255; buf[e - 2] = lo >>> 8 & 255; buf[e - 1] = lo & 255;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    for (j = 0; j < buf.length; j += 64) {
      for (i = 0; i < 16; i++) w[i] = (buf[j + 4 * i] << 24) | (buf[j + 4 * i + 1] << 16) | (buf[j + 4 * i + 2] << 8) | buf[j + 4 * i + 3];
      for (i = 16; i < 64; i++) { var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      var a = h0, b = h1, c = h2, d = h3, f = h4, g = h5, h = h6, k = h7;
      for (i = 0; i < 64; i++) {
        var S1 = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7)), ch = (f & g) ^ (~f & h);
        var t1 = (k + S1 + ch + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        k = h; h = g; g = f; f = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + f) | 0; h5 = (h5 + g) | 0; h6 = (h6 + h) | 0; h7 = (h7 + k) | 0;
    }
    var out = ''; [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (v) { out += ('00000000' + (v >>> 0).toString(16)).slice(-8); }); return out;
  }
  function subtleOK() { try { return !!(window.isSecureContext !== false && window.crypto && crypto.subtle && crypto.subtle.digest); } catch (e) { return false; } }
  function async_(input) {
    if (subtleOK()) {
      return crypto.subtle.digest('SHA-256', bytes(input)).then(function (h) { return [].map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); },
        function () { return hex(input); });
    }
    return Promise.resolve(hex(input));
  }
  window.ccSha256Hex = hex; window.ccSha256 = async_;
  window.ccSha256Info = function () { return { subtle: subtleOK(), secureContext: window.isSecureContext !== false }; };
})();
