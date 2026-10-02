// MatWeb veri sayfasını (DataSheet.aspx) DOM üzerinden okuyup sade bir JS nesnesine çevirir.
// Tarayıcıdan bağımsızdır; yalnızca standart DOM API'si kullanır.
// Eklenti aynı sekmede birden çok kez çalıştırılabildiği için global'e atama yapılır (const yerine).
(function (root) {
  'use strict';

  var NUM = '[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?';
  // ">= 462 MPa", "7.85 - 7.86 g/cc", "0.29", "-196 - -28.0 °C"
  var VALUE_RE = new RegExp('^(>=|<=|>|<|~|≥|≤)?\\s*(' + NUM + ')(?:\\s*-\\s*(' + NUM + '))?\\s*(.*)$');
  // "Temperature 371 °C", "Thickness 88.93 - 102 mm"
  var CONDITION_RE = new RegExp('^(.+?)\\s+(>=|<=|>|<|~|≥|≤)?\\s*(' + NUM + ')(?:\\s*-\\s*(' + NUM + '))?\\s*(.*)$');

  function clean(s) {
    return (s || '').replace(/ /g, ' ').replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim();
  }

  // textContent <br> ve <p> sınırlarını yutar; satır sonlarını koruyarak metin çıkarır.
  function textWithBreaks(el) {
    var out = '';
    (function walk(node) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          out += n.nodeValue.replace(/\s+/g, ' ');
        } else if (n.nodeType === 1) {
          var tag = n.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style') continue;
          if (tag === 'br') { out += '\n'; continue; }
          var block = tag === 'p' || tag === 'div' || tag === 'li';
          if (block) out += '\n';
          walk(n);
          if (block) out += '\n';
        }
      }
    })(el);
    return clean(out).replace(/\n{3,}/g, '\n\n');
  }

  function parseValue(text) {
    var t = clean(text).replace(/\n/g, ' ');
    if (!t) return null;
    var v = { text: t };
    var m = VALUE_RE.exec(t);
    if (!m) return v; // sayısal değil ("Yes", "Good" vb.)
    if (m[1]) v.qualifier = m[1].replace('≥', '>=').replace('≤', '<=');
    if (m[3] !== undefined) {
      v.min = m[2];
      v.max = m[3];
    } else {
      v.value = m[2];
    }
    if (m[4]) v.unit = m[4].trim();
    return v;
  }

  function parseConditions(text) {
    var t = clean(text);
    if (!t) return [];
    return t.split('@').map(function (part) {
      return part.replace(/\s+/g, ' ').replace(/[,;]\s*$/, '').trim();
    }).filter(Boolean).map(function (part) {
      var m = CONDITION_RE.exec(part);
      if (!m) return { text: part };
      var c = { name: m[1].trim() };
      if (m[2]) c.qualifier = m[2].replace('≥', '>=').replace('≤', '<=');
      if (m[4] !== undefined) {
        c.min = m[3];
        c.max = m[4];
      } else {
        c.value = m[3];
      }
      if (m[5]) c.unit = m[5].trim();
      return c;
    });
  }

  // Metric/English hücresi: değer + (varsa) span.dataCondition içinde koşullar.
  function parseCell(td) {
    if (!td) return null;
    var copy = td.cloneNode(true);
    var conditions = [];
    var conds = copy.querySelectorAll('.dataCondition');
    for (var i = 0; i < conds.length; i++) {
      conditions = conditions.concat(parseConditions(textWithBreaks(conds[i])));
      conds[i].parentNode.removeChild(conds[i]);
    }
    var v = parseValue(textWithBreaks(copy));
    if (!v && !conditions.length) return null;
    v = v || {};
    if (conditions.length) v.conditions = conditions;
    return v;
  }

  function stripColon(s) {
    return clean(s).replace(/:\s*$/, '');
  }

  function splitList(td) {
    var links = td.querySelectorAll('a');
    var items = [];
    if (links.length) {
      for (var i = 0; i < links.length; i++) items.push(clean(links[i].textContent));
    } else {
      items = clean(td.textContent).split(';');
    }
    return items.map(clean).filter(Boolean);
  }

  function parseHeader(panel, data) {
    var heads = panel.querySelectorAll('th.rowHeaders');
    for (var i = 0; i < heads.length; i++) {
      var label = stripColon(heads[i].textContent);
      var td = heads[i].nextElementSibling;
      if (!td) continue;
      var key = label.toLowerCase();
      if (key === 'categories') {
        data.categories = splitList(td);
      } else if (key === 'key words') {
        data.keywords = clean(td.textContent).split(';').map(clean).filter(Boolean);
      } else if (key === 'material notes') {
        data.notes = textWithBreaks(td);
      } else if (key === 'vendors') {
        // Satıcı listesi reklam/bağlantı içeriği; aktarılmaz.
      } else {
        var text = textWithBreaks(td);
        if (text) data.info.push({ name: label, text: text });
      }
    }
  }

  function isGroupHeaderRow(tr) {
    var ths = tr.querySelectorAll(':scope > th');
    return ths.length >= 2 && ths[1].classList.contains('dataCell');
  }

  function isDataRow(tr) {
    var tds = tr.querySelectorAll(':scope > td');
    return tds.length >= 3 && tds[1].classList.contains('dataCell');
  }

  function parseProperties(panel, data) {
    var group = null;
    var prop = null;
    var rows = panel.querySelectorAll('table.tabledataformat tr');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (isGroupHeaderRow(tr)) {
        group = { name: clean(tr.querySelector('th').textContent), properties: [] };
        data.groups.push(group);
        prop = null;
        continue;
      }
      if (!group || !isDataRow(tr)) continue;

      var tds = tr.querySelectorAll(':scope > td');
      var name = clean(tds[0].textContent);
      // Koşullu ek değer satırlarında ilk hücre boştur (yalnızca grafik ikonu olabilir):
      // bunlar bir önceki özelliğe aittir.
      if (name || !prop) {
        prop = { name: name || '(unnamed)', points: [] };
        group.properties.push(prop);
      }
      var point = {
        metric: parseCell(tds[1]),
        english: parseCell(tds[2]),
        comment: tds[3] ? textWithBreaks(tds[3]) : ''
      };
      if (point.metric || point.english || point.comment) prop.points.push(point);
    }
    data.groups = data.groups.filter(function (g) { return g.properties.length; });
  }

  // Malzemenin MatWeb kimliği: adres çubuğunda ya da sayfadaki PDF/yazdır bağlantılarında bulunur.
  function findMatGuid(doc) {
    var re = /MatGUID=([0-9a-f]{32})/i;
    var m = re.exec((doc.location && doc.location.href) || '');
    if (m) return m[1].toLowerCase();
    var link = doc.querySelector('a[href*="MatGUID="], a[href*="matguid="]');
    m = link && re.exec(link.getAttribute('href'));
    return m ? m[1].toLowerCase() : '';
  }

  function parseDatasheet(doc) {
    var panel = doc.getElementById('ctl00_ContentMain_ucDataSheet1_pnlMaterialData') || doc.body;
    var data = { name: '', matGuid: findMatGuid(doc), categories: [], keywords: [], notes: '', info: [], groups: [] };

    var title = panel.querySelector('table th[colspan]');
    data.name = title ? clean(title.textContent) : clean(doc.title);

    parseHeader(panel, data);
    parseProperties(panel, data);
    return data;
  }

  root.MatwebParser = {
    parseDatasheet: parseDatasheet,
    parseValue: parseValue,
    parseConditions: parseConditions
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
