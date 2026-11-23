import assert from 'node:assert/strict';
import test from 'node:test';

import { url } from 'yamb/url';

import { buildItem as renderItem } from '../../src/builders/item.js';
import { writer } from '../../src/xml.js';

const buildItem = (data) => {
  const out = writer(8388608, 'rss');
  renderItem(
    out,
    data,
    {
      title: data.title,
      text: { feedHtml: data.text ?? 'Full body' },
      preview: { feedHtml: data.preview },
      cover: {}
    },
    url(data.uri, new URL('https://nko.io')).href,
    { feed: 'https://nko.io/rss' }
  );

  return out.end().trimEnd();
};

function makeFakePost(overrides = {}) {
  return {
    id: 'post',
    title: 'Hello',
    preview: 'Preview text',
    tags: ['js'],
    publishedAt: '2026-04-26T12:00:00Z',

    uri: '2026/04/hello',
    ...overrides
  };
}

test('returns multi-line XML wrapped in <item>', () => {
  const out = buildItem(makeFakePost());
  assert.ok(out.startsWith('    <item>'), 'starts with indented <item>');
  assert.ok(out.endsWith('</item>'), 'ends with indented </item>');
  assert.ok(out.includes('<title>'));
  assert.ok(out.includes('<link>'));
  assert.ok(out.includes('<guid'));
  assert.ok(out.includes('<pubDate>'));
  assert.ok(out.includes('<description>'));
  assert.ok(out.includes('<category>'));
});

test('title is XML-escaped', () => {
  const out = buildItem(makeFakePost({ title: 'Tom & Jerry' }));
  assert.ok(out.includes('<title>Tom &amp; Jerry</title>'));
});

test('link addresses the current URI and guid addresses the stable post', () => {
  const out = buildItem(makeFakePost());
  assert.ok(out.includes('<link>https://nko.io/2026/04/hello</link>'));
  assert.ok(out.includes('<guid isPermaLink="false">https://nko.io/rss#post/post</guid>'));
});

test('pubDate is RFC 2822 UTC', () => {
  const out = buildItem(makeFakePost());
  assert.ok(out.includes('<pubDate>Sun, 26 Apr 2026 12:00:00 GMT</pubDate>'));
});

test('description is escaped post.preview', () => {
  const out = buildItem(makeFakePost({ preview: 'A & B' }));
  assert.ok(out.includes('<description>A &amp; B</description>'));
});

test('category per tag, escaped', () => {
  const out = buildItem(makeFakePost({ tags: ['js', 'A & B'] }));
  const matches = out.match(/<category>/g) ?? [];
  assert.equal(matches.length, 2);
  assert.ok(out.includes('<category>js</category>'));
  assert.ok(out.includes('<category>A &amp; B</category>'));
});

test('empty tags array → no <category>', () => {
  const out = buildItem(makeFakePost({ tags: [] }));
  const matches = out.match(/<category>/g) ?? [];
  assert.equal(matches.length, 0);
});

test('full content is always included', () => {
  const out = buildItem(makeFakePost({ text: 'Complete body' }));
  assert.ok(out.includes('<content:encoded>Complete body</content:encoded>'));
});

test(']]> in title/preview/tag is neutralized', () => {
  const out = buildItem(
    makeFakePost({
      title: ']]>',
      preview: ']]>',
      tags: [']]>']
    })
  );

  assert.ok(!out.includes(']]>'), 'no literal CDATA terminator in output');
});

test('URL with & is escaped in <link> and <guid>', () => {
  const out = buildItem(
    makeFakePost({
      uri: '?a=1&b=2'
    })
  );

  assert.ok(out.includes('<link>https://nko.io/?a=1&amp;b=2</link>'));
  assert.ok(out.includes('<guid isPermaLink="false">https://nko.io/rss#post/post</guid>'));
});
