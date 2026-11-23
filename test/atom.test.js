import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { atom, AtomRenderer } from '../src/index.js';
import { blogWith, postData } from './fixture.js';

const config = { title: 'Feed', feed: 'https://example.com/atom', author: { name: 'Editor' } };
const row = (index = 0) => ({
  ...postData(100, index),
  id: `post-${index}`,
  uri: `2026/11/post-${index}`
});
function prepared(feedHtml, preview) {
  const result = {
    title: 'Title <&>\rline\u0000\ud800😀',
    text: { feedHtml },
    cover: {}
  };

  if (preview !== undefined) {
    result.preview = { feedHtml: preview, plain: preview };
  }

  return result;
}
const path = (suffix) => `/*[local-name()='feed']${suffix}`;
const entry = (suffix) => path(`/*[local-name()='entry']${suffix}`);

function xmlValue(xml, expression) {
  const result = spawnSync('xmllint', ['--nonet', '--xpath', expression, '-'], {
    input: xml,
    encoding: 'utf8'
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, result.stderr);

  return result.stdout.trimEnd();
}

async function setup(t, options = {}, extra = {}) {
  const blog = await blogWith([], {
    base: 'https://example.com/blog',
    renderers: { atom: atom({ ...config, ...options }) },
    ...extra
  });
  t.after(() => blog.close());

  return blog;
}

test('Atom emits a valid deterministic empty feed and supports collection scope only', async (t) => {
  assert.ok(atom(config) instanceof AtomRenderer);
  const blog = await setup(t);
  const xml = await blog.render('atom', { posts: [] });

  assert.equal(xmlValue(xml, 'namespace-uri(/*)'), 'http://www.w3.org/2005/Atom');
  assert.equal(
    xmlValue(xml, `string(${path("/*[local-name()='updated']")})`),
    '1970-01-01T00:00:00.000000000Z'
  );
  assert.equal(
    xmlValue(xml, `string(${path("/*[local-name()='link'][@rel='self']/@type")})`),
    'application/atom+xml'
  );

  await assert.rejects(() => blog.build({ title: 'Draft' }).render('atom'), {
    code: 'YAMB_RENDERER_SCOPE'
  });
});

test('Atom preserves stable identity across publication, rename and feed relocation', async (t) => {
  const blog = await setup(t, {
    id: 'https://example.com/stable',
    feed: 'https://example.com/new-atom'
  });
  const post = blog.build({
    title: 'First',
    slug: 'first',
    text: '**Markdown**',
    author: { name: 'Writer', url: './writer' }
  });
  await post.publish();
  const before = await blog.render('atom', { posts: [post] });

  post.slug = 'second';
  await post.save();
  const after = await blog.render('atom', { posts: blog.published });
  const id = `string(${entry("/*[local-name()='id']")})`;

  assert.equal(xmlValue(before, id), `https://example.com/stable#post/${post.id}`);
  assert.equal(xmlValue(after, id), xmlValue(before, id));
  assert.equal(
    xmlValue(after, `string(${entry("/*[local-name()='link']/@href")})`),
    'https://example.com/blog/2026/11/second'
  );
  assert.equal(
    xmlValue(after, `string(${entry("/*[local-name()='author']/*[local-name()='uri']")})`),
    'https://example.com/blog/writer'
  );
  assert.equal(post.text, '**Markdown**');
});

test('Atom escapes text, HTML and attributes without XML newline or Unicode loss', async (t) => {
  const blog = await setup(t, {
    title: '<Feed>& 😀\u0000',
    language: 'en',
    prepare: () => prepared('<p>A & B</p>\r\n😀', '<plain>\rline')
  });
  const post = {
    ...row(),
    title: 'Title <&>\rline\u0000\ud800😀',
    tags: ['a\tb\nc\rd"<&'],
    author: { name: 'Writer & Co', email: 'a@example.com' }
  };
  const before = structuredClone(post);
  const xml = await blog.render('atom', { posts: [post] });

  assert.equal(xmlValue(xml, `string(${path("/*[local-name()='title']")})`), '<Feed>& 😀');
  assert.equal(xmlValue(xml, `string(${entry("/*[local-name()='title']")})`), 'Title <&>\rline😀');
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='category']/@term")})`),
    post.tags[0]
  );
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='content']")})`),
    '<p>A & B</p>\r\n😀'
  );
  assert.equal(xmlValue(xml, `string(${entry("/*[local-name()='content']/@type")})`), 'html');
  assert.equal(xmlValue(xml, `string(${entry("/*[local-name()='summary']")})`), '<plain>\rline');
  assert.deepEqual(post, before);
});

test('Atom uses escaped literal Markdown by default and compares dates at nanosecond precision', async (t) => {
  const blog = await setup(t, { updated: '2026-11-01T12:00:00.000000002Z' });
  const posts = [
    row(),
    {
      ...row(1),
      text: '**raw**',
      updatedAt: '2026-11-01T15:00:00.000000003+03:00',
      publishedAt: '2026-10-31T00:00:00.123456789Z'
    }
  ];
  const xml = await blog.render('atom', { posts });

  assert.equal(xmlValue(xml, `count(${entry('')})`), '2');
  assert.equal(
    xmlValue(
      xml,
      `count(${path("/*[local-name()='updated']/preceding-sibling::*[local-name()='entry']")})`
    ),
    '0'
  );
  assert.equal(
    xmlValue(xml, `string(${path("/*[local-name()='updated']")})`),
    '2026-11-01T12:00:00.000000003Z'
  );
  assert.equal(
    xmlValue(xml, `string(${entry("[2]/*[local-name()='published']")})`),
    '2026-10-31T00:00:00.123456789Z'
  );
  assert.equal(xmlValue(xml, `string(${entry("[2]/*[local-name()='content']")})`), '**raw**');
  assert.equal(xmlValue(xml, `string(${entry("[2]/*[local-name()='content']/@type")})`), 'html');
});

test('Atom requires authors for empty feeds or each entry without feed inheritance', async (t) => {
  const blog = await setup(t, { author: undefined });
  await assert.rejects(() => blog.render('atom', { posts: [] }), { code: 'YAMB_RENDERER_INPUT' });
  await assert.rejects(() => blog.render('atom', { posts: [row()] }), {
    code: 'YAMB_RENDERER_INPUT'
  });

  const xml = await blog.render('atom', { posts: [{ ...row(), author: { name: 'Author' } }] });
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='author']/*[local-name()='name']")})`),
    'Author'
  );
});

test('Atom bounds consumption, never starts limit zero and closes infinite sources', async (t) => {
  let pulled = 0;
  let closed = 0;

  async function* source() {
    try {
      while (true) {
        yield row(pulled++);
      }
    } finally {
      closed++;
    }
  }

  const zero = await setup(t, { limit: 0 });
  await zero.render('atom', { posts: source() });
  assert.equal(pulled, 0);

  const blog = await setup(t, { limit: 2 });
  await blog.render('atom', { posts: source() });
  assert.equal(pulled, 2);
  assert.equal(closed, 1);
});

for (const [name, change] of Object.entries({
  draft: { status: 'draft' },
  scheduled: { status: 'scheduled' },
  id: { id: undefined },
  uri: { uri: undefined },
  title: { title: '' },
  text: { text: 42 },
  date: { updatedAt: 'bad' },
  published: { publishedAt: undefined },
  surrogate: { id: '\ud800' }
})) {
  test(`Atom rejects invalid published input: ${name}`, async (t) => {
    const blog = await setup(t);
    await assert.rejects(() => blog.render('atom', { posts: [{ ...row(), ...change }] }), {
      code: 'YAMB_RENDERER_INPUT'
    });
  });
}

test('Atom keeps distinct encoded IDs and rejects duplicate IDs', async (t) => {
  const blog = await setup(t);
  const xml = await blog.render('atom', {
    posts: [
      { ...row(), id: 'a\u0000' },
      { ...row(1), id: 'a' }
    ]
  });
  assert.equal(
    xmlValue(xml, `string(${entry("[1]/*[local-name()='id']")})`),
    'https://example.com/atom#post/a%00'
  );
  await assert.rejects(() => blog.render('atom', { posts: [row(), row()] }), {
    code: 'YAMB_RENDERER_INPUT'
  });
});

for (const value of [
  { unknown: true },
  { limit: -1 },
  { limit: 1.5 },
  { bytes: 0 },
  { bytes: Number.MAX_SAFE_INTEGER + 1 },
  { feed: '/atom' },
  { feed: 'ftp://example.com/feed' },
  { feed: 'https://example.com/#x' },
  { id: 'https://example.com/#' },
  { title: ' ' },
  { prepare: 'html' },
  { author: { name: '' } },
  { updated: 'bad' }
]) {
  test(`Atom rejects invalid config ${JSON.stringify(value)}`, () => {
    assert.throws(() => atom({ ...config, ...value }), { code: 'YAMB_XML_RENDERER_CONFIG' });
  });
}

test('Atom prepare callback receives public context and snapshot', async (t) => {
  const controller = new AbortController();
  const blog = await setup(t, {
    prepare: async (post, ctx) => {
      assert.equal(ctx.yamb, blog);
      assert.equal(ctx.signal, controller.signal);
      assert.equal(post.id, 'post-0');

      return prepared('plain', 'summary');
    }
  });
  const xml = await blog.render('atom', { posts: [row()] }, { signal: controller.signal });

  assert.equal(xmlValue(xml, `string(${entry("/*[local-name()='content']")})`), 'plain');
});

for (const content of [
  null,
  [],
  new Date('2026-11-11T00:00:00Z'),
  {},
  { html: 5 },
  { text: 'ok', extra: 1 },
  { text: 'ok', summary: 5 }
]) {
  test(`Atom rejects invalid callback result ${JSON.stringify(content)}`, async (t) => {
    const blog = await setup(t, { prepare: () => content });
    await assert.rejects(() => blog.render('atom', { posts: [row()] }), {
      code: 'YAMB_RENDERER_INPUT'
    });
  });
}

test('Atom preserves errors/cancellation and closes sources on callback failures', async (t) => {
  const failure = new Error('callback failed');
  const controller = new AbortController();
  const reason = { stopped: true };
  let closed = 0;

  async function* source() {
    try {
      yield row();
      yield row(1);
    } finally {
      closed++;
    }
  }

  const blog = await setup(t, {
    prepare: () => {
      throw failure;
    }
  });
  await assert.rejects(
    () => blog.render('atom', { posts: source() }),
    (error) => error.code === 'YAMB_RENDERER_FAILED' && error.cause === failure
  );

  const aborted = await setup(t, {
    prepare: (_post, ctx) => {
      controller.abort(reason);
      ctx.signal.throwIfAborted();
    }
  });
  await assert.rejects(
    () => aborted.render('atom', { posts: source() }, { signal: controller.signal }),
    (error) => error === reason
  );
  assert.equal(closed, 2);
});

test('Atom enforces exact final UTF-8 ceiling including XML escaping and closes on overflow', async (t) => {
  const blog = await setup(t);
  const posts = [{ ...row(), text: '😀&\r\u0000' }];
  const xml = await blog.render('atom', { posts });
  const bytes = Buffer.byteLength(xml);

  const exact = await setup(t, { bytes });
  assert.equal(await exact.render('atom', { posts }), xml);

  const small = await setup(t, { bytes: bytes - 1 });
  await assert.rejects(() => small.render('atom', { posts }), { code: 'YAMB_RENDERER_INPUT' });

  let closed = false;

  async function* source() {
    try {
      yield row();
    } finally {
      closed = true;
    }
  }

  const huge = await setup(t, { bytes: 1000, prepare: () => prepared('&'.repeat(1000000)) });
  await assert.rejects(() => huge.render('atom', { posts: source() }), {
    code: 'YAMB_RENDERER_INPUT'
  });
  assert.equal(closed, true);
});

test('Atom preserves domain failures and cancellation when iterator cleanup fails', async (t) => {
  const blog = await setup(t);
  const controller = new AbortController();
  const reason = { stopped: true };
  let closed = 0;
  const posts = {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next() {
      controller.abort(reason);
      return { value: row(), done: false };
    },

    async return() {
      closed++;
      throw new Error('cleanup');
    }
  };

  await assert.rejects(
    () =>
      atom(config).collection({ posts }, { base: new URL(blog.base), signal: controller.signal }),
    (error) => error === reason
  );
  assert.equal(closed, 1);

  const { RendererInputError } = await import('yamb/errors');
  const domain = new RendererInputError('application error');
  const failed = await setup(t, {
    prepare: () => {
      throw domain;
    }
  });
  await assert.rejects(
    () => failed.render('atom', { posts: [row()] }),
    (error) => error === domain
  );
});

test('Atom closes a directly supplied iterator whose next rejects, preserving its cause', async (t) => {
  const blog = await setup(t);
  const cause = new Error('source failed');
  let closed = 0;
  const posts = {
    [Symbol.asyncIterator]() {
      return this;
    },

    async next() {
      throw cause;
    },

    async return() {
      closed++;
      throw new Error('cleanup failed');
    }
  };

  await assert.rejects(
    () => atom(config).collection({ posts }, { base: new URL(blog.base) }),
    (error) => error.code === 'YAMB_RENDERER_FAILED' && error.cause === cause
  );
  assert.equal(closed, 1);
});

test('Atom rejects missing input and pre-abort without consuming source', async (t) => {
  const blog = await setup(t);
  await assert.rejects(() => blog.render('atom', {}), { code: 'YAMB_RENDERER_INPUT' });
  await assert.rejects(() => blog.render('atom', { posts: 3 }), { code: 'YAMB_RENDERER_INPUT' });
  let pulled = 0;

  async function* posts() {
    pulled++;
    yield row();
  }

  const controller = new AbortController();
  const reason = new Error('cancelled');
  controller.abort(reason);

  await assert.rejects(
    () => blog.render('atom', { posts: posts() }, { signal: controller.signal }),
    (error) => error === reason
  );
  assert.equal(pulled, 0);
});

test('Atom counts exact bytes for attribute whitespace and Unicode in config', async (t) => {
  const settings = {
    language: 'en-US',
    title: 'Ω😀',
    description: 'Subtitle',
    link: 'https://example.com/site'
  };
  const blog = await setup(t, settings);
  const posts = [{ ...row(), tags: ['a\tb\nc\rd😀'], text: 'Ω😀\ud800\uffff' }];
  const xml = await blog.render('atom', { posts });
  const exact = await setup(t, { ...settings, bytes: Buffer.byteLength(xml) });
  assert.equal(await exact.render('atom', { posts }), xml);

  const small = await setup(t, { ...settings, bytes: Buffer.byteLength(xml) - 1 });
  await assert.rejects(() => small.render('atom', { posts }), { code: 'YAMB_RENDERER_INPUT' });
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='category']/@term")})`),
    'a\tb\nc\rd😀'
  );
});

test('Atom resolves mounted links against the base pathname with query and fragment', async (t) => {
  const blog = await setup(t, {}, { base: 'https://example.com/blog?view=1#top' });
  const xml = await blog.render('atom', {
    posts: [{ ...row(), author: { name: 'Author', url: './about' } }]
  });
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='link']/@href")})`),
    'https://example.com/blog/2026/11/post-0'
  );
  assert.equal(
    xmlValue(xml, `string(${entry("/*[local-name()='author']/*[local-name()='uri']")})`),
    'https://example.com/blog/about'
  );
});

for (const language of ['invalid_tag', 'en US', '', 'en\tUS', 'en-']) {
  test(`Atom rejects unsupported language ${JSON.stringify(language)}`, () => {
    assert.throws(() => atom({ ...config, language }), { code: 'YAMB_XML_RENDERER_CONFIG' });
  });
}

test('Atom accepts Intl locale identifiers and emits their supplied spelling', async (t) => {
  const blog = await setup(t, { language: 'sr-Latn-RS' });
  const xml = await blog.render('atom', { posts: [] });

  assert.equal(xmlValue(xml, `string(${path('/@xml:lang')})`), 'sr-Latn-RS');
});

for (const base of [
  'https://example.com/',
  'https://example.com/blog',
  'https://example.com/blog/',
  'https://example.com/blog?view=1#section'
]) {
  test(`Atom and Post.url agree at ${base}`, async (t) => {
    const blog = await setup(t, {}, { base });
    const post = blog.build({ title: 'Post', slug: 'post' });
    await post.publish();

    const expected = `https://example.com${new URL(base).pathname === '/' ? '' : '/blog'}/2026/11/post`;
    assert.equal(post.url().href, expected);

    const xml = await blog.render('atom', { posts: [post] });
    assert.equal(
      xmlValue(xml, `string(${entry("/*[local-name()='link'][@rel='alternate']/@href")})`),
      expected
    );
    assert.equal(
      xmlValue(xml, `string(${path("/*[local-name()='link'][@rel='alternate']/@href")})`),
      base
    );
  });
}

test('Atom rejects malformed configured author URL at construction', () => {
  assert.throws(() => atom({ ...config, author: { name: 'A', url: '//[' } }), {
    code: 'YAMB_XML_RENDERER_CONFIG'
  });
});

test('Atom rejects malformed post author URL as input', async (t) => {
  const blog = await setup(t);
  await assert.rejects(
    () => blog.render('atom', { posts: [{ ...row(), author: { name: 'A', url: '//[' } }] }),
    { code: 'YAMB_RENDERER_INPUT' }
  );
});

test('Atom through blog.render closes rejected async next with a failed return', async (t) => {
  const blog = await setup(t);
  const primary = new Error('next failed');
  let closed = 0;
  const posts = {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(primary),
        return() {
          closed++;
          throw new Error('cleanup failed');
        }
      };
    }
  };

  await assert.rejects(
    () => blog.render('atom', { posts }),
    (error) => error.cause === primary
  );
  assert.equal(closed, 1);
});
