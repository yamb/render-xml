import { Buffer } from 'node:buffer';

import { RendererInputError } from '#core/errors';
import { url } from '#core/url';

import { cleanXml, escapeXml } from './escape.js';

export function writer(bytes, format) {
  const parts = [];
  let size = 0;

  function check(length) {
    if (length > bytes - size) {
      throw new RendererInputError(`${format} output exceeds bytes`);
    }
  }

  return {
    get position() {
      return parts.length;
    },

    raw(value, position) {
      const length = Buffer.byteLength(value);
      check(length);
      size += length;

      if (position === undefined) {
        parts.push(value);
      } else {
        parts.splice(position, 0, value);
      }
    },

    text(value, attribute = false) {
      const clean = cleanXml(value);
      let length = Buffer.byteLength(clean);
      check(length);

      const pattern = attribute ? /[&<>"'\r\t\n]/g : /[&<>"'\r]/g;

      for (const [char] of clean.matchAll(pattern)) {
        if (char === '"' || char === "'") {
          length += 5;
        } else if (char === '<' || char === '>' || char === '\t') {
          length += 3;
        } else {
          length += 4;
        }

        check(length);
      }

      size += length;

      let escaped = escapeXml(clean).replaceAll('\r', '&#13;');

      if (attribute) {
        escaped = escaped.replaceAll('\t', '&#9;').replaceAll('\n', '&#10;');
      }

      parts.push(escaped);
    },

    end() {
      return parts.join('');
    }
  };
}

export function element(out, name, value, attributes = '') {
  out.raw(`<${name}${attributes}>`);
  out.text(value);
  out.raw(`</${name}>\n`);
}

export function link(out, rel, type, href) {
  out.raw(`<link rel="${rel}" type="${type}" href="`);
  out.text(href, true);
  out.raw('"/>\n');
}

export function author(out, value, base) {
  out.raw('<author>\n');
  element(out, 'name', value.name);

  if (value.email !== undefined) {
    element(out, 'email', value.email);
  }

  if (value.url) {
    element(out, 'uri', url(value.url, base).href);
  }

  out.raw('</author>\n');
}
