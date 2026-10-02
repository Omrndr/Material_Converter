// Kütüphane ve ayarlar: panel (popup) ile kütüphane sayfasının ortak kullandığı yardımcılar.
// MatwebAnsys (ansys-writer.js) bu dosyadan önce yüklenmelidir.
(function (root) {
  'use strict';

  var api = root.browser || root.chrome;

  var DEFAULTS = {
    library: [],
    autoUpdate: true,
    folder: '',
    fileName: 'MatWeb_ANSYS_Kutuphanesi.xml',
    sort: { key: 'addedAt', dir: 'desc' },
    lastWrittenAt: ''
  };

  // ANSYS özellik adlarının kullanıcıya gösterilen Türkçe karşılıkları.
  var PROPERTY_LABELS = {
    'Density': 'Yoğunluk',
    'Elasticity': 'Elastisite (E, ν)',
    'Tensile Yield Strength': 'Akma dayanımı',
    'Tensile Ultimate Strength': 'Çekme dayanımı',
    'Compressive Yield Strength': 'Basma akma dayanımı',
    'Compressive Ultimate Strength': 'Basma dayanımı',
    'Coefficient of Thermal Expansion': 'Isıl genleşme',
    'Specific Heat': 'Özgül ısı',
    'Thermal Conductivity': 'Isıl iletkenlik',
    'Resistivity': 'Elektriksel direnç'
  };

  function load() {
    return api.storage.local.get(DEFAULTS);
  }

  function save(values) {
    return api.storage.local.set(values);
  }

  // Kaynak adresinden MatGUID dışındaki ekleri (ör. "&ckck=1") atar.
  function cleanSourceUrl(url) {
    try {
      var u = new URL(url);
      var guid = '';
      u.searchParams.forEach(function (v, k) {
        if (k.toLowerCase() === 'matguid') guid = v;
      });
      return u.origin + u.pathname + (guid ? '?MatGUID=' + guid : '');
    } catch (e) {
      return url || '';
    }
  }

  var ILLEGAL = /[<>:"|?*\u0000-\u001f]/g;

  // İndirilenler klasörüne göre alt klasör: "..", mutlak yol ve geçersiz karakterler temizlenir.
  function sanitizeFolder(folder) {
    return String(folder || '').replace(/\\/g, '/').split('/')
      .map(function (p) { return p.replace(ILLEGAL, '').trim(); })
      .filter(function (p) { return p && p !== '.' && p !== '..'; })
      .join('/');
  }

  function sanitizeFileName(name) {
    var n = String(name || '').replace(/[\\/]/g, '_').replace(ILLEGAL, '').trim();
    if (!n) n = DEFAULTS.fileName;
    if (!/\.xml$/i.test(n)) n += '.xml';
    return n;
  }

  function libraryPath(settings) {
    var folder = sanitizeFolder(settings.folder);
    return (folder ? folder + '/' : '') + sanitizeFileName(settings.fileName);
  }

  // ANSYS açısından eksik/riskli durumlar (kullanıcıya gösterilir).
  function warningsFor(data) {
    var warnings = [];
    if (/^Overview of materials for/i.test(data.name || '')) {
      warnings.push('Seri özeti (Overview) sayfası: değerler belirli bir kaliteye değil, serinin ortalamasına aittir.');
    }
    var names = root.MatwebAnsys.buildProperties(data).props.map(function (p) { return p.name; });
    if (names.indexOf('Elasticity') < 0) {
      warnings.push('Elastisite (E ve ν) yok: ANSYS’te gerilme analizi için kullanılamaz.');
    }
    if (names.indexOf('Density') < 0) {
      warnings.push('Yoğunluk yok.');
    }
    return warnings;
  }

  // ANSYS'e aktarılacak özelliklerin Türkçe adları.
  function ansysProperties(data) {
    return root.MatwebAnsys.buildProperties(data).props
      .map(function (p) { return PROPERTY_LABELS[p.name]; })
      .filter(Boolean);
  }

  function toAnsysXml(entries) {
    var cleaned = entries.map(function (e) {
      return Object.assign({}, e, { sourceUrl: cleanSourceUrl(e.sourceUrl) });
    });
    return root.MatwebAnsys.toAnsysXml(cleaned, { versionDate: root.MatwebAnsys.versionDate(new Date()) });
  }

  // İndirme arka planda yapılır: panel kapanınca panelde oluşturulan blob adresi geçersiz olur.
  function download(xml, filename, overwrite) {
    return api.runtime.sendMessage({ type: 'download', xml: xml, filename: filename, overwrite: overwrite })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'İndirme başlatılamadı');
      });
  }

  // Tüm kütüphaneyi ayarlardaki sabit yola yazar ve yazılan yolu döndürür.
  function writeLibrary(settings) {
    var path = libraryPath(settings);
    return download(toAnsysXml(settings.library), path, true).then(function () {
      settings.lastWrittenAt = new Date().toISOString();
      return save({ lastWrittenAt: settings.lastWrittenAt });
    }).then(function () { return path; });
  }

  var collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

  function category(entry) {
    var c = entry.data.categories || [];
    return c.length ? c[c.length - 1] : '';
  }

  var SORTERS = {
    name: function (a, b) { return collator.compare(a.name, b.name); },
    addedAt: function (a, b) { return String(a.addedAt).localeCompare(String(b.addedAt)); },
    category: function (a, b) { return collator.compare(category(a), category(b)) || collator.compare(a.name, b.name); }
  };

  function sortEntries(list, sort) {
    var cmp = SORTERS[sort && sort.key] || SORTERS.addedAt;
    var sign = sort && sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) { return sign * cmp(a, b); });
  }

  function stamp(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  root.MatStore = {
    DEFAULTS: DEFAULTS,
    load: load,
    save: save,
    cleanSourceUrl: cleanSourceUrl,
    sanitizeFolder: sanitizeFolder,
    sanitizeFileName: sanitizeFileName,
    libraryPath: libraryPath,
    warningsFor: warningsFor,
    ansysProperties: ansysProperties,
    toAnsysXml: toAnsysXml,
    download: download,
    writeLibrary: writeLibrary,
    sortEntries: sortEntries,
    category: category,
    stamp: stamp
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
