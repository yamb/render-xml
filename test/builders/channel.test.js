import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChannelHeader as header, closingTags } from '../../src/builders/channel.js';
import { writer } from '../../src/xml.js';

const buildChannelHeader = (...args) => {
  const out = writer(8388608, 'rss');
  header(out, ...args);

  return out.end();
};

function makeCtx(overrides = {}) {
  return {
    yamb: {},
    format: 'rss',
    scope: 'collection',
    timeZone: 'Europe/Moscow',
    base: new URL('https://nko.io/'),
    signal: undefined,
    ...overrides
  };
}

function makeConfig(overrides = {}) {
  return {
    title: 'nko.io',
    description: 'Личный блог',
    language: 'ru',
    limit: 10,
    ...overrides
  };
}

test('returns header up to but not including <item>', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), undefined);
  assert.ok(out.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(
    out.includes('<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">')
  );
  assert.ok(out.includes('<channel>'));
  assert.ok(out.includes('<title>'));
  assert.ok(!out.includes('<item>'));
  assert.ok(!out.includes('</channel>'));
  assert.ok(!out.includes('</rss>'));
});

test('channel title/description/language are escaped', () => {
  const out = buildChannelHeader(
    makeConfig({
      title: 'A & B',
      description: 'Описание<x>',
      language: 'ru'
    }),

    makeCtx(),
    undefined
  );

  assert.ok(out.includes('<title>A &amp; B</title>'));
  assert.ok(out.includes('<description>Описание&lt;x&gt;</description>'));
  assert.ok(out.includes('<language>ru</language>'));
});

test('link defaults to ctx.base.href when config.link absent', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), undefined);
  assert.ok(out.includes('<link>https://nko.io/</link>'));
});

test('config.link overrides ctx.base.href', () => {
  const out = buildChannelHeader(
    makeConfig({ title: 'Other Blog', link: 'https://other.io' }),

    makeCtx(),
    undefined
  );

  assert.ok(out.includes('<link>https://other.io</link>'));
  assert.ok(!out.includes('nko.io'));
});

test('copyright is included when set', () => {
  const out = buildChannelHeader(makeConfig({ copyright: '© 2026' }), makeCtx(), undefined);
  assert.ok(out.includes('<copyright>© 2026</copyright>'));
});

test('copyright is omitted when undefined', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), undefined);
  assert.ok(!out.includes('<copyright>'));
});

test('lastBuildDate included when non-undefined', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), 'Sun, 26 Apr 2026 12:00:00 GMT');
  assert.ok(out.includes('<lastBuildDate>Sun, 26 Apr 2026 12:00:00 GMT</lastBuildDate>'));
});

test('lastBuildDate emitted even for empty string (not undefined)', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), '');
  assert.ok(out.includes('<lastBuildDate></lastBuildDate>'));
});

test('lastBuildDate omitted when undefined', () => {
  const out = buildChannelHeader(makeConfig(), makeCtx(), undefined);
  assert.ok(!out.includes('<lastBuildDate>'));
});

test('closingTags returns </channel> and </rss>', () => {
  const out = closingTags();
  assert.ok(out.includes('</channel>'));
  assert.ok(out.endsWith('</rss>'));
});
