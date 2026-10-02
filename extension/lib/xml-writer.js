// MatwebParser çıktısını XML metnine çevirir.
(function (root) {
  'use strict';

  var FORMAT_VERSION = '1';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function attrs(obj, keys) {
    var out = '';
    keys.forEach(function (k) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out += ' ' + k + '="' + esc(obj[k]) + '"';
    });
    return out;
  }

  function Writer() {
    this.lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    this.depth = 0;
  }
  Writer.prototype.pad = function () { return new Array(this.depth + 1).join('  '); };
  Writer.prototype.open = function (tag, a) { this.lines.push(this.pad() + '<' + tag + (a || '') + '>'); this.depth++; };
  Writer.prototype.close = function (tag) { this.depth--; this.lines.push(this.pad() + '</' + tag + '>'); };
  Writer.prototype.empty = function (tag, a) { this.lines.push(this.pad() + '<' + tag + (a || '') + '/>'); };
  Writer.prototype.text = function (tag, text, a) {
    this.lines.push(this.pad() + '<' + tag + (a || '') + '>' + esc(text) + '</' + tag + '>');
  };

  var VALUE_KEYS = ['qualifier', 'value', 'min', 'max', 'unit', 'text'];
  var CONDITION_KEYS = ['name', 'qualifier', 'value', 'min', 'max', 'unit', 'text'];

  function writeValue(w, tag, v) {
    if (!v) return;
    var a = attrs(v, VALUE_KEYS);
    if (!v.conditions || !v.conditions.length) {
      w.empty(tag, a);
      return;
    }
    w.open(tag, a);
    v.conditions.forEach(function (c) { w.empty('Condition', attrs(c, CONDITION_KEYS)); });
    w.close(tag);
  }

  function toXml(data, meta) {
    meta = meta || {};
    var w = new Writer();
    w.open('Material', attrs({
      source: 'MatWeb',
      sourceUrl: meta.sourceUrl,
      exportedAt: meta.exportedAt,
      formatVersion: FORMAT_VERSION
    }, ['source', 'sourceUrl', 'exportedAt', 'formatVersion']));

    w.text('Name', data.name);

    if (data.categories.length) {
      w.open('Categories');
      data.categories.forEach(function (c) { w.text('Category', c); });
      w.close('Categories');
    }
    if (data.notes) w.text('Notes', data.notes);
    if (data.keywords.length) {
      w.open('KeyWords');
      data.keywords.forEach(function (k) { w.text('KeyWord', k); });
      w.close('KeyWords');
    }
    data.info.forEach(function (i) { w.text('Info', i.text, attrs(i, ['name'])); });

    w.open('PropertyGroups');
    data.groups.forEach(function (g) {
      w.open('PropertyGroup', attrs(g, ['name']));
      g.properties.forEach(function (p) {
        w.open('Property', attrs(p, ['name']));
        p.points.forEach(function (pt) {
          w.open('DataPoint');
          writeValue(w, 'Metric', pt.metric);
          writeValue(w, 'English', pt.english);
          if (pt.comment) w.text('Comment', pt.comment);
          w.close('DataPoint');
        });
        w.close('Property');
      });
      w.close('PropertyGroup');
    });
    w.close('PropertyGroups');

    w.close('Material');
    return w.lines.join('\n') + '\n';
  }

  function fileNameFor(name) {
    var base = (name || 'matweb')
      .replace(/^Overview of materials for\s+/i, '')
      .replace(/[\\/:*?"<>|;,]+/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 120);
    return (base || 'matweb') + '.xml';
  }

  root.MatwebXml = { toXml: toXml, fileNameFor: fileNameFor, FORMAT_VERSION: FORMAT_VERSION };
})(typeof globalThis !== 'undefined' ? globalThis : this);
