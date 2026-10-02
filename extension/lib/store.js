// Kütüphane ve ayarlar: panel (popup) ile kütüphane sayfasının ortak kullandığı yardımcılar.
// MatwebAnsys (ansys-writer.js) bu dosyadan önce yüklenmelidir.
(function (root) {
  'use strict';

  var api = root.browser || root.chrome;

  // Çeviri (ui.js yüklüyse); yoksa (ör. birim testleri) İngilizce yedek metin kullanılır.
  function t(key, subs, fallback) {
    return root.UI && root.UI.t ? root.UI.t(key, subs, fallback) : (fallback || key);
  }
  var LANG = (root.UI && root.UI.lang) || 'en';

  var DEFAULTS = {
    library: [],
    autoUpdate: true,
    folder: '',
    fileName: t('default_file_name', undefined, 'MatWeb_ANSYS_Library.xml'),
    sort: { key: 'addedAt', dir: 'desc' },
    lastWrittenAt: '',
    // Kullanıcının kendi kategorileri: { id, name, createdAt, members: [uid], changedAt, lastWrittenAt }
    groups: []
  };

  // ANSYS özellik adlarının kullanıcıya gösterilen Türkçe karşılıkları.
  var PROPERTY_LABELS = {
    'Density': ['prop_density', 'Density'],
    'Elasticity': ['prop_elasticity', 'Elasticity (E, ν)'],
    'Tensile Yield Strength': ['prop_tensile_yield', 'Tensile yield strength'],
    'Tensile Ultimate Strength': ['prop_tensile_ultimate', 'Ultimate tensile strength'],
    'Compressive Yield Strength': ['prop_compressive_yield', 'Compressive yield strength'],
    'Compressive Ultimate Strength': ['prop_compressive_ultimate', 'Compressive strength'],
    'Coefficient of Thermal Expansion': ['prop_cte', 'Thermal expansion'],
    'Specific Heat': ['prop_specific_heat', 'Specific heat'],
    'Thermal Conductivity': ['prop_conductivity', 'Thermal conductivity'],
    'Resistivity': ['prop_resistivity', 'Electrical resistivity']
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
      warnings.push(t('warn_overview', undefined, 'Series overview page: the values are averages of the whole series, not of a specific grade.'));
    }
    var names = root.MatwebAnsys.buildProperties(data).props.map(function (p) { return p.name; });
    if (names.indexOf('Elasticity') < 0) {
      warnings.push(t('warn_no_elasticity', undefined, 'No elasticity (E and ν): cannot be used for stress analysis in ANSYS.'));
    }
    if (names.indexOf('Density') < 0) {
      warnings.push(t('warn_no_density', undefined, 'No density.'));
    }
    return warnings;
  }

  // ANSYS'e aktarılacak özelliklerin Türkçe adları.
  function ansysProperties(data) {
    return root.MatwebAnsys.buildProperties(data).props
      .filter(function (p) { return PROPERTY_LABELS[p.name]; })
      .map(function (p) { return t(PROPERTY_LABELS[p.name][0], undefined, PROPERTY_LABELS[p.name][1]); });
  }

  function toAnsysXml(entries, notes) {
    var cleaned = entries.map(function (e) {
      return Object.assign({}, e, { sourceUrl: cleanSourceUrl(e.sourceUrl) });
    });
    return root.MatwebAnsys.toAnsysXml(cleaned, { versionDate: root.MatwebAnsys.versionDate(new Date()), notes: notes });
  }

  // İndirme arka planda yapılır: panel kapanınca panelde oluşturulan blob adresi geçersiz olur.
  function download(xml, filename, overwrite) {
    return api.runtime.sendMessage({ type: 'download', xml: xml, filename: filename, overwrite: overwrite })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || t('download_failed', undefined, 'The download could not be started'));
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

  // --- Kategoriler (her biri ayrı bir ANSYS kütüphane dosyası) ---

  function normalizeGroupName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function findGroupByName(settings, name, exceptId) {
    var n = normalizeGroupName(name).toLocaleLowerCase(LANG);
    return settings.groups.find(function (g) {
      return g.id !== exceptId && g.name.toLocaleLowerCase(LANG) === n;
    });
  }

  // Kategori dosyası kategorinin adını taşır; ana kütüphane dosyasıyla çakışırsa önek alır.
  function groupFileName(settings, group) {
    var name = sanitizeFileName(group.name);
    if (name.toLowerCase() === sanitizeFileName(settings.fileName).toLowerCase()) name = 'Kategori_' + name;
    return name;
  }

  function groupPath(settings, group) {
    var folder = sanitizeFolder(settings.folder);
    return (folder ? folder + '/' : '') + groupFileName(settings, group);
  }

  function groupEntries(settings, group) {
    var members = new Set(group.members);
    return sortEntries(settings.library.filter(function (m) { return members.has(m.uid); }), { key: 'name', dir: 'asc' });
  }

  // Kategoriyi kendi adını taşıyan dosyaya yazar (yalnızca kullanıcı istediğinde çağrılır).
  function writeGroup(settings, group) {
    var entries = groupEntries(settings, group);
    var path = groupPath(settings, group);
    return download(toAnsysXml(entries, 'Category: ' + group.name), path, true).then(function () {
      // Sayfa storage.onChanged ile kategori dizisini yenilemiş olabilir; kaydı kimliğiyle bul.
      var now = new Date().toISOString();
      group.lastWrittenAt = now;
      var stored = settings.groups.find(function (g) { return g.id === group.id; });
      if (stored) stored.lastWrittenAt = now;
      return save({ groups: settings.groups });
    }).then(function () { return path; });
  }

  // Bu malzemeleri içeren kategorileri "değişti" olarak işaretler (dosyaları otomatik yazılmaz).
  function markGroupsChanged(settings, uids) {
    var touched = new Set(uids);
    var now = new Date().toISOString();
    settings.groups.forEach(function (g) {
      if (g.members.some(function (u) { return touched.has(u); })) g.changedAt = now;
    });
  }

  // İndirilen kategori dosyası, kategorideki son değişiklikten eski mi?
  function isGroupStale(group) {
    return !!group.lastWrittenAt && !!group.changedAt && group.changedAt > group.lastWrittenAt;
  }

  var collator = new Intl.Collator(LANG, { sensitivity: 'base', numeric: true });

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

  // Kullanıcıya gösterilen yol: "Downloads/…" veya "İndirilenler/…".
  function displayPath(path) {
    return t('downloads_folder', undefined, 'Downloads') + '/' + path;
  }

  // Seçili malzemeler için ayrı dosyanın yolu (ana kütüphaneyle aynı klasörde).
  function selectionPath(settings, date) {
    var folder = sanitizeFolder(settings.folder);
    return (folder ? folder + '/' : '') + t('selection_file_prefix', undefined, 'MatWeb_Selection_') + stamp(date) + '.xml';
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
    normalizeGroupName: normalizeGroupName,
    findGroupByName: findGroupByName,
    groupPath: groupPath,
    groupEntries: groupEntries,
    writeGroup: writeGroup,
    markGroupsChanged: markGroupsChanged,
    isGroupStale: isGroupStale,
    sortEntries: sortEntries,
    category: category,
    stamp: stamp,
    displayPath: displayPath,
    selectionPath: selectionPath
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
