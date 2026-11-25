import { Buffer } from 'node:buffer';

import { RendererInputError } from '#core/errors';
import { url } from '#core/url';

// oxlint-disable-next-line eslint/no-control-regex
const ILLEGAL_XML_CHARS = /[^\u0009\u000a\u000d -퟿-�\u{10000}-\u{10ffff}]/gu;
const TEXT = /[&<>"'\r]/g;
const ATTRIBUTE = /[&<>"'\r\t\n]/g;
const entities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '\r': '&#13;',
  '\t': '&#9;',
  '\n': '&#10;'
};

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

    raw(value, position = parts.length) {
      const length = Buffer.byteLength(value);
      check(length);
      size += length;
      parts.splice(position, 0, value);
    },

    text(value, attribute = false) {
      const clean = value.replace(ILLEGAL_XML_CHARS, '');
      const pattern = attribute ? ATTRIBUTE : TEXT;
      let length = Buffer.byteLength(clean);
      check(length);

      for (const [char] of clean.matchAll(pattern)) {
        length += entities[char].length - 1;
        check(length);
      }

      size += length;
      parts.push(clean.replace(pattern, (char) => entities[char]));
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
