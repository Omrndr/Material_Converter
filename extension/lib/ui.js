// Panel ve kütüphane sayfası için küçük arayüz yardımcıları: çeviri (i18n), satır içi SVG simgeler,
// bildirim, tarih biçimi. Arayüz dili tarayıcının diline göre İngilizce veya Türkçe olur (_locales).
(function (root) {
  'use strict';

  var api = root.browser || root.chrome;
  var lang = (api && api.i18n && api.i18n.getUILanguage && api.i18n.getUILanguage()) ||
    (root.navigator && root.navigator.language) || 'en';

  // Çeviri: _locales/<dil>/messages.json; $1, $2… yerine subs yazılır. Bulunamazsa fallback ya da anahtar döner.
  function t(key, subs, fallback) {
    var msg = '';
    try {
      if (api && api.i18n) {
        msg = subs === undefined ? api.i18n.getMessage(key) : api.i18n.getMessage(key, [].concat(subs).map(String));
      }
    } catch (e) {
      msg = '';
    }
    return msg || fallback || key;
  }

  // Sayıya bağlı metin: n === 1 ise "<key>_one" (sayı içermez; diğer değerler $1'den başlar),
  // aksi hâlde "<key>" ($1 = n, diğer değerler $2'den başlar).
  function tn(key, n, rest) {
    var others = [].concat(rest === undefined ? [] : rest);
    if (n === 1) {
      var one = t(key + '_one', others.length ? others : undefined, '');
      if (one && one !== key + '_one') return one;
    }
    return t(key, [n].concat(others));
  }

  // data-i18n (metin), data-i18n-html (biçimli metin; yalnızca eklentinin kendi dil dosyalarından),
  // data-i18n-placeholder ve data-i18n-title özniteliklerini çevirir.
  function localize(scope) {
    var doc = scope || document;
    doc.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    doc.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.dataset.i18nHtml); });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPlaceholder); });
    doc.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.title = t(el.dataset.i18nTitle); });
    if (!scope) document.documentElement.lang = lang.slice(0, 2);
  }

  var NS = 'http://www.w3.org/2000/svg';
  var PATHS = {
    plus: 'M12 5v14M5 12h14',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
    external: 'M14 4h6v6M10 14L20 4M19 14v6H4V5h6',
    file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    trash: 'M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7',
    check: 'M20 6L9 17l-5-5',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    library: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    x: 'M18 6L6 18M6 6l12 12',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'folder-minus': 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 13h6',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'
  };

  function icon(name) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', PATHS[name] || '');
    svg.appendChild(path);
    return svg;
  }

  // data-icon="ad" özniteliği olan öğelerin başına simge ekler.
  function hydrate(scope) {
    (scope || document).querySelectorAll('[data-icon]').forEach(function (el) {
      if (!el.querySelector(':scope > svg.icon')) el.prepend(icon(el.dataset.icon));
    });
  }

  var timer = null;
  function toast(message, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { el.hidden = true; }, kind === 'err' ? 8000 : 4000);
  }

  function formatDate(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var opts = withTime === false ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' };
    return d.toLocaleString(lang, opts);
  }

  root.UI = { t: t, tn: tn, localize: localize, lang: lang, icon: icon, hydrate: hydrate, toast: toast, formatDate: formatDate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
