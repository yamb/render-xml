import assert from 'node:assert/strict';
import test from 'node:test';

import { writer } from '../src/xml.js';

function text(value, attribute) {
  const out = writer(8388608, 'test');
  out.text(value, attribute);

  return out.end();
}

test('escapes & first to avoid double-escape', () => {
  assert.equal(text('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(text('Tom &amp; Jerry'), 'Tom &amp;amp; Jerry');
});

test('five core entities in one pass', () => {
  const input = `<a href="x">'5 < 6'</a>`;
  const expected = '&lt;a href=&quot;x&quot;&gt;&apos;5 &lt; 6&apos;&lt;/a&gt;';
  assert.equal(text(input), expected);
});

test(']]> (CDATA terminator) is neutralized', () => {
  const result = text(']]>');
  assert.equal(result, ']]&gt;');
  assert.ok(!result.includes(']]>'));
});

test('empty string returns empty string', () => {
  assert.equal(text(''), '');
});

test('unicode passes through unchanged', () => {
  assert.equal(text('Привет «мир»'), 'Привет «мир»');
});

test('strips XML 1.0 illegal C0 controls (NUL, SOH, etc.)', () => {
  assert.equal(text('hello\u0000world'), 'helloworld');
  assert.equal(text('a\u0001b\u0002c\u0003d'), 'abcd');
  assert.equal(text('x\u000by\u000cz'), 'xyz');
  assert.equal(text('p\u001eq\u001fr'), 'pqr');
});

test('keeps tab and LF in text and escapes CR as a character reference', () => {
  assert.equal(text('a\tb\nc\rd'), 'a\tb\nc&#13;d');
});

test('escapes tab, LF and CR in attributes so normalization keeps them', () => {
  assert.equal(text('a\tb\nc\rd', true), 'a&#9;b&#10;c&#13;d');
});

test('strips noncharacters U+FFFE and U+FFFF', () => {
  assert.equal(text('a￾b￿c'), 'abc');
});

test('strips lone high surrogate (no low pair)', () => {
  assert.equal(text('hi\uD83Dthere'), 'hithere');
});

test('strips lone low surrogate (no high pair)', () => {
  assert.equal(text('hi\uDE00there'), 'hithere');
});

test('preserves valid surrogate pair (e.g., emoji)', () => {
  assert.equal(text('hi 😀 there'), 'hi 😀 there');
});

test('strips control chars even when adjacent to entities-needing chars', () => {
  assert.equal(text('<a>\u0000\u0001</a>'), '&lt;a&gt;&lt;/a&gt;');
});

test('counts the escaped UTF-8 bytes against the ceiling', () => {
  const value = '😀&"\t\r';
  const expected = '😀&amp;&quot;&#9;&#13;';
  const exact = writer(Buffer.byteLength(expected), 'test');
  exact.text(value, true);
  assert.equal(exact.end(), expected);
  assert.throws(() => writer(Buffer.byteLength(expected) - 1, 'test').text(value, true), {
    code: 'YAMB_RENDERER_INPUT'
  });
});
