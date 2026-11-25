import assert from 'node:assert/strict';
import test from 'node:test';

import { rss } from '../../src/index.js';
import { blogWith } from '../fixture.js';

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

function makeBlog({
  rendererConfig = { feed: 'https://example.com/rss', title: 'Feed', description: 'Desc' },
  timeZone = 'Europe/Moscow'
} = {}) {
  return blogWith([], {
    renderers: { rss: rss(rendererConfig) },
    base: 'https://nko.io',
    timeZone,
    clock: CLOCK
  });
}

async function withBlog(fn, options) {
  const blog = await makeBlog(options);

  try {
    await fn(blog);
  } finally {
    await blog.close();
  }
}

async function publishMany(blog, titles) {
  const out = [];

  for (const title of titles) {
    const post = await blog.create({
      title,
      text: `body of ${title}`,
      preview: `preview of ${title}`,
      tags: ['t']
    });
    await post.publish();
    out.push(post);
  }

  return out;
}

test('returns XML starting with declaration and rss element, ending with </rss>', async () => {
  await withBlog(async (blog) => {
    const out = await blog.render('rss', { posts: [] });
    assert.equal(typeof out, 'string');
    assert.match(out, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"[^>]*>/);
    assert.ok(out.endsWith('</rss>'));
  });
});

test('renders all 3 published posts as <item> blocks with their titles', async () => {
  await withBlog(async (blog) => {
    await publishMany(blog, ['One', 'Two', 'Three']);
    const out = await blog.render('rss', { posts: blog.all() });
    const itemMatches = out.match(/<item>/g) ?? [];
    assert.equal(itemMatches.length, 3);
    assert.ok(out.includes('<title>One</title>'));
    assert.ok(out.includes('<title>Two</title>'));
    assert.ok(out.includes('<title>Three</title>'));
  });
});

test('missing input.posts (no input, undefined, bad shape) throws YAMB_RENDERER_INPUT', async () => {
  await withBlog(async (blog) => {
    await assert.rejects(
      () => blog.render('rss', {}),
      (err) => err?.code === 'YAMB_RENDERER_INPUT'
    );

    await assert.rejects(
      () => blog.render('rss', { posts: undefined }),
      (err) => err?.code === 'YAMB_RENDERER_INPUT'
    );

    await assert.rejects(
      () => blog.render('rss', { posts: 42 }),
      (err) => err?.code === 'YAMB_RENDERER_INPUT'
    );
  });
});

test('pre-aborted signal throws AbortError before consuming iterator', async () => {
  await withBlog(async (blog) => {
    await publishMany(blog, ['a', 'b']);
    let counter = 0;

    async function* counting() {
      for (const post of await blog.all().toArray()) {
        counter += 1;
        yield post;
      }
    }

    const ac = new AbortController();
    ac.abort();

    await assert.rejects(
      () => blog.render('rss', { posts: counting() }, { signal: ac.signal }),
      (err) => err?.name === 'AbortError'
    );

    assert.equal(counter, 0, 'iterator must not be consumed when signal pre-aborted');
  });
});

test('config.limit caps consumption (lazy — counter stops at limit)', async () => {
  await withBlog(
    async (blog) => {
      const posts = await publishMany(blog, ['p1', 'p2', 'p3', 'p4', 'p5']);
      let counter = 0;

      async function* counting() {
        for (const p of posts) {
          counter += 1;
          yield p;
        }
      }

      const out = await blog.render('rss', { posts: counting() });
      const itemMatches = out.match(/<item>/g) ?? [];
      assert.equal(itemMatches.length, 2);
      assert.ok(counter <= 2, `counter (${counter}) must not exceed limit 2`);
    },
    {
      rendererConfig: {
        feed: 'https://example.com/rss',
        title: 'Feed',
        description: 'Desc',
        limit: 2
      }
    }
  );
});

test('lastBuildDate is RFC 2822 of max(updatedAt OR publishedAt)', async () => {
  await withBlog(async (blog) => {
    const [p1, p2] = await publishMany(blog, ['old', 'new']);
    p1.publishedAt = '2026-04-25T00:00:00Z';
    await p1.save();
    p2.publishedAt = '2026-04-27T00:00:00Z';
    await p2.save();

    const out = await blog.render('rss', { posts: blog.all() });
    const expected = 'Mon, 27 Apr 2026 00:00:00 GMT';

    assert.ok(
      out.includes(`<lastBuildDate>${expected}</lastBuildDate>`),
      `expected lastBuildDate ${expected} in:\n${out}`
    );
  });
});

test('empty collection produces no <lastBuildDate>, but other channel tags present', async () => {
  await withBlog(async (blog) => {
    const out = await blog.render('rss', { posts: [] });
    assert.ok(!out.includes('<lastBuildDate>'), 'no lastBuildDate when empty');
    assert.ok(out.includes('<title>Feed</title>'));
    assert.ok(out.includes('<description>Desc</description>'));
    assert.ok(out.includes('<language>'));
  });
});

test('accepts plain array of Posts', async () => {
  await withBlog(async (blog) => {
    const posts = await publishMany(blog, ['arr1', 'arr2']);
    const out = await blog.render('rss', { posts });
    const itemMatches = out.match(/<item>/g) ?? [];
    assert.equal(itemMatches.length, 2);
  });
});

test('accepts an inline async generator (AsyncIterable)', async () => {
  await withBlog(async (blog) => {
    const posts = await publishMany(blog, ['g1']);

    async function* gen() {
      for (const p of posts) {
        yield p;
      }
    }

    const out = await blog.render('rss', { posts: gen() });
    const itemMatches = out.match(/<item>/g) ?? [];
    assert.equal(itemMatches.length, 1);
  });
});

test('special chars in title/preview/tags are XML-escaped in output', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'A & B',
      text: 'body',
      preview: '5 < 6',
      tags: ['a&b']
    });

    await post.publish();
    const out = await blog.render('rss', { posts: [post] });

    assert.ok(out.includes('<title>A &amp; B</title>'), 'title escaped');
    assert.ok(out.includes('<description>5 &amp;lt; 6</description>'), 'preview escaped');
    assert.ok(out.includes('<category>a&amp;b</category>'), 'category escaped');
    assert.ok(!/<title>A & B<\/title>/.test(out), 'no raw & in title');
    assert.ok(!/<description>5 < 6<\/description>/.test(out), 'no raw < in description');
  });
});

test('non-YAMB error from iterator wraps as YAMB_RENDERER_FAILED', async () => {
  await withBlog(async (blog) => {
    const boom = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('bang');
          }
        };
      }
    };

    await assert.rejects(
      () => blog.render('rss', { posts: boom }),
      (err) => err?.code === 'YAMB_RENDERER_FAILED' && err?.cause?.message === 'bang'
    );
  });
});
