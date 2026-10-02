// MatwebParser çıktılarını ANSYS Workbench Engineering Data kütüphane XML'ine (MatML 3.1 tabanlı) çevirir.
// Biçim, ANSYS 2023 R1 Engineering Data dışa aktarımı örnek alınarak hazırlanmıştır
// (github.com/ansys/pymaterials-manager, tests/data/steel_eglass_air.xml, MIT lisansı).
(function (root) {
  'use strict';

  // ANSYS'in "sıcaklığa bağlı değil" anlamında kullandığı sabit sıcaklık değeri.
  var NO_TEMPERATURE = '7.88860905221012e-31';
  var DEFAULT_REF_TEMPERATURE = 22;
  var ENGINEERING_DATA_VERSION = '23.1.0.209';

  // --- Birimler -------------------------------------------------------------
  // ANSYS'e yazılan parametrelerin birim tanımları (Metadata/ParameterDetails).
  var UNITS = {
    density: { name: 'Density', units: [['kg', 1], ['m', -3]] },
    stress: { name: 'Stress', units: [['Pa', 1]] },
    temperature: { name: 'Temperature', units: [['C', 1]] },
    invTemp: { name: 'InvTemp1', units: [['C', -1]] },
    specificHeat: { name: 'Specific Heat Capacity', units: [['J', 1], ['kg', -1], ['C', -1]] },
    conductivity: { name: 'Thermal Conductivity', units: [['W', 1], ['m', -1], ['C', -1]] },
    resistivity: { name: 'Electrical Resistivity', units: [['ohm', 1], ['m', 1]] },
    unitless: null
  };

  // MatWeb "Metric" sütunundaki birim -> ANSYS SI çarpanı.
  var CONVERSIONS = {
    density: { 'g/cc': 1000, 'g/cm³': 1000, 'kg/m³': 1 },
    stress: { 'Pa': 1, 'kPa': 1e3, 'MPa': 1e6, 'GPa': 1e9 },
    invTemp: { 'µm/m-°C': 1e-6, '1/°C': 1 },
    specificHeat: { 'J/g-°C': 1000, 'J/kg-°C': 1, 'J/kg-K': 1, 'J/g-K': 1000 },
    conductivity: { 'W/m-K': 1, 'W/m-°C': 1 },
    resistivity: { 'ohm-cm': 0.01, 'ohm-m': 1 },
    unitless: { '': 1 }
  };

  // --- Alan adı eşlemesi ("hafıza") -----------------------------------------
  // MatWeb özellik adı -> kullanılacak büyüklük. Yeni bir MatWeb alanını ANSYS'e taşımak için buraya eklenir.
  var FIELD_MAP = {
    'Density': { key: 'density', kind: 'density' },
    'Modulus of Elasticity': { key: 'youngs', kind: 'stress' },
    'Poissons Ratio': { key: 'poisson', kind: 'unitless' },
    'Shear Modulus': { key: 'shear', kind: 'stress' },
    'Tensile Strength, Yield': { key: 'tensileYield', kind: 'stress' },
    'Tensile Strength, Ultimate': { key: 'tensileUltimate', kind: 'stress' },
    'Compressive Yield Strength': { key: 'compressiveYield', kind: 'stress' },
    'Compressive Strength': { key: 'compressiveUltimate', kind: 'stress' },
    'CTE, linear': { key: 'cte', kind: 'invTemp' },
    'Specific Heat Capacity': { key: 'specificHeat', kind: 'specificHeat' },
    'Thermal Conductivity': { key: 'conductivity', kind: 'conductivity' },
    'Electrical Resistivity': { key: 'resistivity', kind: 'resistivity' }
  };

  function normUnit(u) {
    return (u || '').replace(/μ/g, 'µ').replace(/\s+/g, '').replace('cm3', 'cm³').replace('m3', 'm³');
  }

  function factorFor(kind, unit) {
    var table = CONVERSIONS[kind];
    var u = normUnit(unit);
    for (var k in table) if (normUnit(k) === u) return table[k];
    return null;
  }

  function round(x) {
    return Number(x.toPrecision(12));
  }

  function averageFromComment(comment) {
    var m = /Average value:\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(comment || '');
    return m ? parseFloat(m[1]) : null;
  }

  // Bir MatWeb değerinden tek sayı üretir. Aralıklarda MatWeb ortalaması, yoksa orta nokta alınır.
  function pickNumber(v, comment, notes, label) {
    if (v.value !== undefined) return parseFloat(v.value);
    if (v.min !== undefined) {
      var avg = averageFromComment(comment);
      var lo = parseFloat(v.min), hi = parseFloat(v.max);
      if (lo === hi) return lo;
      var n = avg !== null && avg >= lo && avg <= hi ? avg : (lo + hi) / 2;
      notes.push(label + ': ' + (avg !== null ? 'MatWeb average' : 'midpoint') + ' of range ' + v.text + ' used');
      return n;
    }
    return null;
  }

  function temperatureCondition(conds) {
    if (!conds || conds.length !== 1) return null;
    var c = conds[0];
    if (!/^temperature$/i.test(c.name || '') || normUnit(c.unit) !== '°C') return null;
    if (c.value !== undefined) return { t: parseFloat(c.value) };
    if (c.min !== undefined) return { from: parseFloat(c.min), t: parseFloat(c.max) };
    return null;
  }

  // Bir MatWeb özelliğini { base, temps: [{t, from, v}] } serisine çevirir (SI birimde).
  function extractSeries(prop, kind, notes) {
    var series = { base: null, temps: [] };
    prop.points.forEach(function (pt) {
      var m = pt.metric;
      if (!m || (m.value === undefined && m.min === undefined)) return;
      var f = factorFor(kind, m.unit);
      if (f === null) {
        notes.push(prop.name + ': unit "' + (m.unit || '') + '" not recognized, skipped');
        return;
      }
      if (!m.conditions || !m.conditions.length) {
        if (series.base === null) {
          var n = pickNumber(m, pt.comment, notes, prop.name);
          if (n !== null) series.base = round(n * f);
        }
        return;
      }
      var tc = temperatureCondition(m.conditions);
      if (!tc) return; // kalınlık vb. koşullar ANSYS'te karşılıksız
      var val = pickNumber(m, pt.comment, notes, prop.name);
      if (val !== null) series.temps.push({ t: tc.t, from: tc.from, v: round(val * f) });
    });
    // Aynı sıcaklık tekrar ederse ilki kalır; sıcaklığa göre sırala.
    var seen = {};
    series.temps = series.temps.filter(function (p) {
      var k = String(p.t) + '|' + String(p.from);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).sort(function (a, b) { return a.t - b.t; });
    return series;
  }

  // ANSYS'e yazılacak tek sütunlu veri: tablo (>=2 sıcaklık) ya da sabit değer.
  function asTable(series) {
    if (!series) return null;
    var temps = series.temps.filter(function (p) { return p.from === undefined; });
    if (temps.length >= 2) return { temps: temps.map(function (p) { return p.t; }), values: temps.map(function (p) { return p.v; }) };
    if (series.base !== null) return { temps: null, values: [series.base] };
    if (temps.length === 1) return { temps: null, values: [temps[0].v] };
    return null;
  }

  // Sabit değer: koşulsuz (oda sıcaklığı/tipik) değer öncelikli.
  function constant(series) {
    if (series && series.base !== null) return series.base;
    var t = asTable(series);
    return t ? t.values[0] : null;
  }

  // Secant CTE: MatWeb "@Temperature 20.0 - 100 °C" aralıkları referans sıcaklığından ölçülen ortalama değerdir.
  function cteTable(series) {
    if (!series) return null;
    var ranged = series.temps.filter(function (p) { return p.from !== undefined; });
    if (ranged.length) {
      var counts = {};
      ranged.forEach(function (p) { counts[p.from] = (counts[p.from] || 0) + 1; });
      var ref = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a - b; })[0];
      var pts = ranged.filter(function (p) { return String(p.from) === ref; });
      var refT = parseFloat(ref);
      if (pts.length >= 2) return { ref: refT, temps: pts.map(function (p) { return p.t; }), values: pts.map(function (p) { return p.v; }) };
      if (series.base === null) return { ref: refT, temps: null, values: [pts[0].v] };
    }
    var t = asTable(series);
    return t ? { ref: DEFAULT_REF_TEMPERATURE, temps: t.temps, values: t.values } : null;
  }

  // --- Malzeme -> ANSYS özellik listesi ----------------------------------------
  function buildProperties(data) {
    var notes = [];
    var s = {};
    data.groups.forEach(function (g) {
      g.properties.forEach(function (p) {
        var map = FIELD_MAP[p.name];
        if (map && !s[map.key]) s[map.key] = extractSeries(p, map.kind, notes);
      });
    });

    var props = [];
    function simple(propName, paramName, unitKind, series) {
      var v = constant(series);
      if (v !== null) props.push({ name: propName, params: [{ name: paramName, unit: unitKind, values: [v] }] });
    }

    // Density
    var d = asTable(s.density);
    if (d) props.push({ name: 'Density', temperature: d.temps || 'none', interpolation: true,
      params: [{ name: 'Density', unit: 'density', values: d.values }] });

    // Elasticity: E ve ν birlikte gerekir; ν yoksa G'den türetilir.
    var e = asTable(s.youngs);
    var nu = constant(s.poisson);
    var g = constant(s.shear);
    if (e && nu === null && g) {
      nu = round(e.values[0] / (2 * g) - 1);
      notes.push("Poisson's ratio derived from E and G (ν = E/2G − 1)");
    }
    if (e && nu !== null) {
      props.push({
        name: 'Elasticity', temperature: e.temps || 'none', interpolation: true,
        qualifiers: [['Behavior', 'Isotropic'], ['Derive from', "Young's Modulus and Poisson's Ratio"]],
        params: [
          { name: "Young's Modulus", unit: 'stress', values: e.values },
          { name: "Poisson's Ratio", unit: 'unitless', values: e.values.map(function () { return nu; }) },
          { name: 'Bulk Modulus', unit: 'stress', values: e.values.map(function (E) { return round(E / (3 * (1 - 2 * nu))); }) },
          { name: 'Shear Modulus', unit: 'stress', values: e.values.map(function (E) { return round(E / (2 * (1 + nu))); }) }
        ]
      });
    } else if (e || nu !== null) {
      notes.push("Elasticity omitted: ANSYS needs both Young's modulus and Poisson's ratio");
    }

    simple('Tensile Yield Strength', 'Tensile Yield Strength', 'stress', s.tensileYield);
    simple('Tensile Ultimate Strength', 'Tensile Ultimate Strength', 'stress', s.tensileUltimate);
    simple('Compressive Yield Strength', 'Compressive Yield Strength', 'stress', s.compressiveYield);
    simple('Compressive Ultimate Strength', 'Compressive Ultimate Strength', 'stress', s.compressiveUltimate);

    // Isıl genleşme (secant) + sıfır ısıl gerinim referans sıcaklığı
    var cte = cteTable(s.cte);
    if (cte) {
      var cteQ = [['Definition', 'Secant'], ['Behavior', 'Isotropic']];
      props.push({ name: 'Coefficient of Thermal Expansion', temperature: cte.temps || 'none', interpolation: true,
        qualifiers: cteQ, params: [{ name: 'Coefficient of Thermal Expansion', unit: 'invTemp', values: cte.values }] });
      props.push({ name: 'Zero-Thermal-Strain Reference Temperature', qualifiers: cteQ,
        params: [{ name: 'Zero-Thermal-Strain Reference Temperature', unit: 'temperature', values: [cte.ref] }],
        materialProperty: 'Coefficient of Thermal Expansion' });
    }

    var cp = asTable(s.specificHeat);
    if (cp) props.push({ name: 'Specific Heat', temperature: cp.temps || 'none', interpolation: true,
      qualifiers: [['Definition', 'Constant Pressure']],
      params: [{ name: 'Specific Heat', unit: 'specificHeat', values: cp.values }] });

    var k = asTable(s.conductivity);
    if (k) props.push({ name: 'Thermal Conductivity', temperature: k.temps || 'none', interpolation: true,
      qualifiers: [['Behavior', 'Isotropic']],
      params: [{ name: 'Thermal Conductivity', unit: 'conductivity', values: k.values }] });

    var r = constant(s.resistivity);
    if (r !== null) props.push({ name: 'Resistivity', qualifiers: [['Behavior', 'Isotropic']], plainTemperature: true,
      params: [{ name: 'Resistivity', unit: 'resistivity', values: [r] }] });

    return { props: props, notes: notes };
  }

  // --- XML yazımı -----------------------------------------------------------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function Ids(prefix) {
    this.prefix = prefix;
    this.map = {};
    this.order = [];
  }
  Ids.prototype.get = function (name, extra) {
    if (!(name in this.map)) {
      this.map[name] = this.prefix + this.order.length;
      this.order.push({ name: name, id: this.map[name], extra: extra });
    }
    return this.map[name];
  };

  function repeat(word, n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(word);
    return a.join(',');
  }

  function fmt(n) {
    return String(round(n));
  }

  function materialDescription(entry, notes) {
    var parts = ['Source: MatWeb'];
    if (entry.sourceUrl) parts.push(entry.sourceUrl);
    if (entry.data.categories && entry.data.categories.length) parts.push('Category: ' + entry.data.categories.join('; '));
    notes.forEach(function (n) { parts.push(n); });
    return parts.join(' | ');
  }

  function toAnsysXml(entries, meta) {
    meta = meta || {};
    var props = new Ids('pr');
    var params = new Ids('pa');
    var L = [];
    function line(depth, text) { L.push(new Array(depth + 1).join('  ') + text); }
    function qualifier(depth, name, value) { line(depth, '<Qualifier name="' + esc(name) + '">' + esc(value) + '</Qualifier>'); }

    var optionsId = null;
    function interpolationOptions(depth) {
      optionsId = optionsId || params.get('Options Variable', 'unitless');
      line(depth, '<ParameterValue parameter="' + optionsId + '" format="string">');
      line(depth + 1, '<Data>Interpolation Options</Data>');
      qualifier(depth + 1, 'AlgorithmType', 'Linear Multivariate (Qhull)');
      qualifier(depth + 1, 'Normalized', 'True');
      qualifier(depth + 1, 'Cached', 'True');
      qualifier(depth + 1, 'ExtrapolationType', 'Projection to the Bounding Box');
      line(depth, '</ParameterValue>');
    }
    function temperatureParam(depth, temps, fieldVariable) {
      var id = params.get('Temperature', 'temperature');
      var n = temps ? temps.length : 1;
      line(depth, '<ParameterValue parameter="' + id + '" format="float">');
      line(depth + 1, '<Data>' + (temps ? temps.map(fmt).join(',') : NO_TEMPERATURE) + '</Data>');
      qualifier(depth + 1, 'Variable Type', repeat('Independent', n));
      if (fieldVariable) {
        qualifier(depth + 1, 'Field Variable', 'Temperature');
        qualifier(depth + 1, 'Default Data', String(DEFAULT_REF_TEMPERATURE));
        qualifier(depth + 1, 'Field Units', 'C');
        qualifier(depth + 1, 'Upper Limit', 'Program Controlled');
        qualifier(depth + 1, 'Lower Limit', 'Program Controlled');
      }
      line(depth, '</ParameterValue>');
    }

    var body = [];
    var transfer = [];
    entries.forEach(function (entry) {
      var built = buildProperties(entry.data);
      var start = L.length;
      line(3, '<Material>');
      line(4, '<BulkDetails>');
      line(5, '<Name>' + esc(entry.name) + '</Name>');
      line(5, '<Description>' + esc(materialDescription(entry, built.notes)) + '</Description>');
      built.props.forEach(function (p) {
        var tempDependent = p.temperature !== undefined;
        line(5, '<PropertyData property="' + props.get(p.name) + '">');
        line(6, '<Data format="string">-</Data>');
        (p.qualifiers || []).forEach(function (q) { qualifier(6, q[0], q[1]); });
        if (tempDependent) qualifier(6, 'Field Variable Compatible', 'Temperature');
        if (p.interpolation) interpolationOptions(6);
        p.params.forEach(function (pr) {
          line(6, '<ParameterValue parameter="' + params.get(pr.name, pr.unit) + '" format="float">');
          line(7, '<Data>' + pr.values.map(fmt).join(',') + '</Data>');
          qualifier(7, 'Variable Type', repeat('Dependent', pr.values.length));
          line(6, '</ParameterValue>');
        });
        if (p.materialProperty) {
          line(6, '<ParameterValue parameter="' + params.get('Material Property', 'unitless') + '" format="string">');
          line(7, '<Data>' + esc(p.materialProperty) + '</Data>');
          line(6, '</ParameterValue>');
        }
        if (tempDependent) temperatureParam(6, p.temperature === 'none' ? null : p.temperature, true);
        else if (p.plainTemperature) temperatureParam(6, null, false);
        line(5, '</PropertyData>');
      });
      if (entry.uid) {
        line(5, '<PropertyData property="' + props.get('Material Unique Id') + '">');
        line(6, '<Data format="string">-</Data>');
        qualifier(6, 'guid', entry.uid);
        qualifier(6, 'Display', 'False');
        line(5, '</PropertyData>');
        transfer.push(entry);
      }
      line(4, '</BulkDetails>');
      line(3, '</Material>');
      body = body.concat(L.splice(start));
    });

    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<EngineeringData version="' + ENGINEERING_DATA_VERSION + '" versiondate="' + esc(meta.versionDate || '') + '">');
    out.push('  <Notes>' + esc(meta.notes || '') + '</Notes>');
    out.push('  <Materials>');
    out.push('    <MatML_Doc>');
    out = out.concat(body);

    L = [];
    line(3, '<Metadata>');
    params.order.forEach(function (p) {
      line(4, '<ParameterDetails id="' + p.id + '">');
      line(5, '<Name>' + esc(p.name) + '</Name>');
      var u = UNITS[p.extra];
      if (!u) {
        line(5, '<Unitless />');
      } else {
        line(5, '<Units name="' + esc(u.name) + '">');
        u.units.forEach(function (unit) {
          line(6, unit[1] === 1 ? '<Unit>' : '<Unit power="' + unit[1] + '">');
          line(7, '<Name>' + esc(unit[0]) + '</Name>');
          line(6, '</Unit>');
        });
        line(5, '</Units>');
      }
      line(4, '</ParameterDetails>');
    });
    props.order.forEach(function (p) {
      line(4, '<PropertyDetails id="' + p.id + '">');
      line(5, '<Unitless />');
      line(5, '<Name>' + esc(p.name) + '</Name>');
      line(4, '</PropertyDetails>');
    });
    line(3, '</Metadata>');
    line(2, '</MatML_Doc>');
    line(1, '</Materials>');
    if (transfer.length) {
      line(1, '<ANSYSWBTransferData>');
      line(2, '<Materials>');
      transfer.forEach(function (entry) {
        line(3, '<Material>');
        line(4, '<Name>' + esc(entry.name) + '</Name>');
        line(4, '<DataTransferID>' + esc(entry.uid) + '</DataTransferID>');
        line(4, '<PreviousTransferIDs>');
        line(4, '</PreviousTransferIDs>');
        line(3, '</Material>');
      });
      line(2, '</Materials>');
      line(1, '</ANSYSWBTransferData>');
    }
    line(0, '</EngineeringData>');
    return out.concat(L).join('\n') + '\n';
  }

  // ANSYS'in kullandığı tarih biçimi: "11/7/2022 3:26:00 PM"
  function versionDate(d) {
    var h = d.getHours();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' ' +
      ((h % 12) || 12) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  root.MatwebAnsys = {
    toAnsysXml: toAnsysXml,
    buildProperties: buildProperties,
    versionDate: versionDate,
    FIELD_MAP: FIELD_MAP
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
