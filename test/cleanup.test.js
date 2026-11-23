import assert from 'node:assert/strict';
import test from 'node:test';

import { rss } from '../src/index.js';

function fakePost(title) {
  return {
    title,
    uri: title,
    publishedAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    preview: `preview ${title}`,
    tags: []
  };
}

test('collection() releases the source iterator on a mid-stream abort', async () => {
  let cleaned = false;
  async function* source() {
    try {
      yield fakePost('a');
      yield fakePost('b');
    } finally {
      cleaned = true;
    }
  }

  const renderer = rss({
    feed: 'https://example.com/rss',
    title: 'Feed',
    description: 'Desc',
    link: 'https://e.com',
    limit: 100
  });
  const ac = new AbortController();

  const posts = (async function* () {
    for await (const v of source()) {
      ac.abort();
      yield v;
    }
  })();

  await assert.rejects(
    () =>
      renderer.collection(
        { posts },
        { signal: ac.signal, timeZone: 'UTC', base: new URL('https://e.com') }
      ),
    { name: 'AbortError' }
  );

  assert.equal(cleaned, true, 'source iterator must be closed on abort');
});
