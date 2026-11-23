import assert from 'node:assert/strict';
import test from 'node:test';

import { rss } from '../src/index.js';

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
