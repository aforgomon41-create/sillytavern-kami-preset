/* Static decoration assets: one pool in the skin manager, shared by same-origin frames.
   No observers, timers, animation loops or per-frame scripts. Shapes and placement are CSS. */
export function createSkinAssetPool(host) {
  var images = new Map(), sheets = new WeakMap(), closed = false;
  function resolve(data) {
    if (closed || typeof data !== 'string' || data.length > 360000 || !/^data:image\/(png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)) { return null; }
    if (images.has(data)) { return images.get(data).url; }
    var url = data, owned = false;
    if (host && host.Blob && host.URL && typeof host.URL.createObjectURL === 'function' && typeof host.atob === 'function') {
      try {
        var comma = data.indexOf(','), binary = host.atob(data.slice(comma + 1)), bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
        url = host.URL.createObjectURL(new host.Blob([bytes], {type: data.slice(5, data.indexOf(';'))}));
        owned = true;
      } catch (e) { return null; }
    }
    images.set(data, {url: url, owned: owned});
    return url;
  }
  return {
    css: function (skin) {
      if (closed || !skin || !/^[a-z][a-z0-9-]*$/.test(skin.id || '')) { return ''; }
      if (sheets.has(skin)) { return sheets.get(skin); }
      var declarations = [], assets = skin.assets || {};
      Object.keys(assets).forEach(function (key) {
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(key)) { return; }
        var url = resolve(assets[key]);
        if (url && !/["\\\r\n]/.test(url)) { declarations.push('--kami-asset-' + key + ':url("' + url + '");'); }
      });
      var selector = 'html[data-kami-skin="' + skin.id + '"]';
      var css = declarations.length ? selector + ',' + selector + ' .kami-root{' + declarations.join('') + '}' : '';
      sheets.set(skin, css);
      return css;
    },
    stats: function () { return {images: images.size, shared: !!(host && host.URL && host.URL.createObjectURL), disposed: closed}; },
    dispose: function () {
      if (closed) { return; }
      closed = true;
      images.forEach(function (item) { if (item.owned) { try { host.URL.revokeObjectURL(item.url); } catch (e) { } } });
      images.clear(); sheets = new WeakMap();
    }
  };
}
