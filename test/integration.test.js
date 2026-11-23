import assert from 'node:assert/strict';
import test from 'node:test';

import { rss } from '../src/index.js';
import { blogWith } from './fixture.js';

test('RSS removes XML-forbidden code points and preserves international and astral text', async () => {
  await withBlog(async (blog) => {
    const text = 'Привет Ελληνικά 日本語 😀 ';
    await blog.create({
      title: `${text}\ufffe\uffff\ud800`,
      slug: 'unicode',
      preview: `${text}\u0000\udfff`,
      status: 'published'
    });
    const out = await blog.render('rss', { posts: blog.all() });
    assert.ok(out.includes(`<title>${text}</title>`));
    assert.ok(out.includes(`<description>${text}</description>`));
    assert.equal(out.includes('\u0000'), false);
    assert.doesNotMatch(out, /[\ufffe\uffff\ud800\udfff]/u);
  });
});

const CLOCK = () => Temporal.Instant.from('2026-04-26T12:00:00Z');

async function makeBlog(
  rendererConfig = { feed: 'https://example.com/rss', title: 'Feed', description: 'Desc' }
) {
  const blog = await blogWith([], {
    renderers: { rss: rss(rendererConfig) },
    base: 'https://nko.io',
    timeZone: 'Europe/Moscow',
    clock: CLOCK
  });

  return blog;
}

async function withBlog(fn, opts) {
  const blog = await makeBlog(opts?.rendererConfig);

  try {
    await fn(blog);
  } finally {
    await blog.close();
  }
}

async function publishN(blog, n) {
  const posts = [];

  for (let i = 0; i < n; i++) {
    const post = await blog.create({ title: `T${i}`, text: `body-${i}` });
    await post.publish();
    posts.push(post);
  }

  return posts;
}

test("blog.render('rss', { posts: blog.all() }) returns valid XML string", async () => {
  await withBlog(async (blog) => {
    await publishN(blog, 2);
    const out = await blog.render('rss', { posts: blog.all() });
    assert.equal(typeof out, 'string');
    assert.ok(out.startsWith('<?xml'), 'output starts with XML declaration');
    assert.match(out, /<rss version="2\.0"[^>]*>/);
    assert.match(out, /<channel>/);

    const itemCount = out.match(/<item>/g)?.length ?? 0;
    assert.equal(itemCount, 2, 'output contains exactly 2 <item> blocks');
    assert.ok(out.endsWith('</rss>'), 'output ends with </rss>');
  });
});

test("post.render('rss') throws YAMB_RENDERER_SCOPE (collection-only renderer)", async () => {
  await withBlog(async (blog) => {
    const [post] = await publishN(blog, 1);

    await assert.rejects(
      () => post.render('rss'),
      (err) => err?.code === 'YAMB_RENDERER_SCOPE' && err?.name === 'RendererScopeError'
    );
  });
});

test("blog.render('atom', { posts }) throws YAMB_RENDERER_MISSING (atom not registered)", async () => {
  await withBlog(async (blog) => {
    await assert.rejects(
      () => blog.render('atom', { posts: blog.all() }),
      (err) => err?.code === 'YAMB_RENDERER_MISSING' && err?.name === 'RendererMissingError'
    );
  });
});

test('<link> uses post.url().href after slug rename', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({ title: 'Original', text: 'body' });
    await post.publish();

    post.slug = 'new-slug';
    await post.save();

    const expectedHref = post.url().href;
    const out = await blog.render('rss', { posts: blog.all() });

    assert.ok(
      out.includes(`<link>${expectedHref}</link>`),
      `output should contain <link>${expectedHref}</link>`
    );

    assert.ok(
      out.includes(`<guid isPermaLink="false">https://example.com/rss#post/${post.id}</guid>`),
      `output should contain <guid> with ${expectedHref}`
    );

    assert.match(out, /\/new-slug/);
  });
});

test('special chars in title/preview/tags survive escape round-trip', async () => {
  await withBlog(async (blog) => {
    const post = await blog.create({
      title: 'Hello & "world"',
      preview: '5 < 6 & 7 > 3',
      text: 'body',
      tags: ['a&b', 'c<d']
    });

    await post.publish();
    const out = await blog.render('rss', { posts: blog.all() });

    assert.match(out, /<title>Hello &amp; &quot;world&quot;<\/title>/);
    assert.match(out, /<description>5 &amp;lt; 6 &amp;amp; 7 &amp;gt; 3<\/description>/);

    const categories = out.match(/<category>[^<]*<\/category>/g) ?? [];
    assert.equal(categories.length, 2);
    assert.ok(categories[0].includes('a&amp;b'));
    assert.ok(categories[1].includes('c&lt;d'));

    assert.doesNotMatch(out, /&(?!(amp|lt|gt|quot|apos);)/);
  });
});
