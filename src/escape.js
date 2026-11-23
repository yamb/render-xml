// oxlint-disable-next-line eslint/no-control-regex
const ILLEGAL_XML_CHARS = /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu;

export function cleanXml(value) {
  return String(value).replace(ILLEGAL_XML_CHARS, '');
}

export function escapeXml(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return cleanXml(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
