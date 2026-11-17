/* Prelude for running the AstroSky engine outside a browser (JavaScriptCore on iOS):
   the engine expects window and atob. */
var window = globalThis;
if (typeof atob === 'undefined') {
  globalThis.atob = function (s) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = '', buf = 0, bits = 0;
    s = String(s).replace(/[^A-Za-z0-9+/]/g, '');
    for (var i = 0; i < s.length; i++) {
      buf = (buf << 6) | A.indexOf(s.charAt(i)); bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 255); }
    }
    return out;
  };
}
