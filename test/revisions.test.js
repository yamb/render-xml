import assert from 'node:assert/strict';
import test from 'node:test';

import { rss } from '../src/index.js';
import { blogWith } from './fixture.js';

test('RSS renders string dates, mounted URLs and escaped source from Post snapshots', async (t) => {
  const blog = await blogWith([], {
    base: 'https://example.com/blog',
    clock: () => Temporal.Instant.from('2026-11-11T10:00:00Z'),
    renderers: {
      rss: rss({ feed: 'https://example.com/rss', title: 'Feed', description: 'Latest' })
    }
  });
  t.after(() => blog.close());

  const post = blog.build({
    title: 'Guide & notes',
    slug: 'guide',
    text: '**source**',
    preview: '<script>raw</script>',
    tags: ['a&b'],
    status: 'published',
    publishedAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-11T10:00:00Z'
  });
  await post.save();
  const out = await blog.render('rss', { posts: [post] });

  assert.match(out, /<title>Guide &amp; notes<\/title>/);
  assert.match(out, /<link>https:\/\/example.com\/blog\/2026\/11\/guide<\/link>/);
  assert.match(out, /<pubDate>Tue, 10 Nov 2026 09:00:00 GMT<\/pubDate>/);
  assert.match(out, /<lastBuildDate>Wed, 11 Nov 2026 10:00:00 GMT<\/lastBuildDate>/);
  assert.match(
    out,
    /<description>&amp;lt;script&amp;gt;raw&amp;lt;\/script&amp;gt;<\/description>/
  );
  assert.match(out, /<category>a&amp;b<\/category>/);
  assert.equal(post.text, '**source**');
});

test('RSS closes a limited iterator and preserves cancellation over a close failure', async (t) => {
  const blog = await blogWith([], {
    renderers: {
      rss: rss({ feed: 'https://example.com/rss', title: 'Feed', description: 'Latest', limit: 1 })
    }
  });
  t.after(() => blog.close());

  const post = blog.build({ title: 'Guide', slug: 'guide' });
  await post.publish();
  let closed = false;

  async function* source() {
    try {
      yield post;
      yield post;
    } finally {
      closed = true;
    }
  }

  await blog.render('rss', { posts: source() });
  assert.equal(closed, true);

  const controller = new AbortController();
  const reason = { stopped: true };
  const renderer = rss({ feed: 'https://example.com/rss', title: 'Feed', description: 'Latest' });
  const posts = {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next() {
      controller.abort(reason);
      return { value: post.toJSON(), done: false };
    },

    async return() {
      throw new Error('close failed');
    }
  };

  await assert.rejects(
    () =>
      renderer.collection(
        { posts },
        {
          base: new URL(blog.base),
          timeZone: blog.timeZone,
          signal: controller.signal
        }
      ),
    (error) => error === reason
  );
});
