import assert from 'node:assert/strict';
import test from 'node:test';

import { atom, rss } from '../src/index.js';

test('rss() and atom() accept feed, id and link URLs on any host', () => {
  for (const url of [
    'http://localhost:3000/feed',
    'http://127.0.0.1:3004/feed',
    'http://[::1]/feed',
    'http://intranet/feed'
  ]) {
    assert.doesNotThrow(
      () => rss({ feed: url, id: url, link: url, title: 'T', description: 'D' }),
      url
    );
    assert.doesNotThrow(() => atom({ feed: url, id: url, link: url, title: 'T' }), url);
  }
});

test('rss() and atom() reject feed, id and link URLs with credentials', () => {
  for (const options of [
    { feed: 'https://user:pass@example.com/feed' },
    { id: 'https://user@example.com/feed' },
    { link: 'https://user:pass@example.com/' }
  ]) {
    const config = { feed: 'https://example.com/feed', title: 'T', ...options };
    assert.throws(() => rss({ ...config, description: 'D' }), { code: 'YAMB_XML_RENDERER_CONFIG' });
    assert.throws(() => atom(config), { code: 'YAMB_XML_RENDERER_CONFIG' });
  }
});

test('rss() rejects an invalid language tag', () => {
  assert.throws(
    () =>
      rss({
        feed: 'https://example.com/rss',
        title: 'T',
        description: 'D',
        language: 'not a language'
      }),
    {
      code: 'YAMB_XML_RENDERER_CONFIG'
    }
  );
});

test('rss() accepts valid language tags and the default', () => {
  assert.doesNotThrow(() => rss({ feed: 'https://example.com/rss', title: 'T', description: 'D' }));
  assert.doesNotThrow(() =>
    rss({ feed: 'https://example.com/rss', title: 'T', description: 'D', language: 'en' })
  );
  assert.doesNotThrow(() =>
    rss({ feed: 'https://example.com/rss', title: 'T', description: 'D', language: 'en-US' })
  );
  assert.doesNotThrow(() =>
    rss({ feed: 'https://example.com/rss', title: 'T', description: 'D', language: 'zh-Hans' })
  );
});
