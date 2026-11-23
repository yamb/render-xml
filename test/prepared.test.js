import assert from 'node:assert/strict';
import test from 'node:test';

import { DOMParser } from '@xmldom/xmldom';

import { atom, rss } from '../src/index.js';
import { postData } from './fixture.js';

const ctx = { base: new URL('https://example.test/blog'), timeZone: 'UTC' };
const config = {
  title: 'Feed',
  description: 'Description',
  feed: 'https://example.test/feed',
  author: { name: 'Editor' }
};
const source = () => ({
  ...postData(20),
  id: 'a/é😀',
  uri: '2026/11/article',
  cover: { url: './cover.jpg', alt: '<alt>', caption: '<caption>', width: 320, height: 200 }
});
function prepared(preview) {
  const result = {
    title: 'Prepared <title> 😀',
    text: { feedHtml: '<p>Introduction</p><hr><p>Complete body</p>' },
    cover: {
      url: './cover.jpg',
      alt: '<alt>',
      caption: 'Prepared <caption>',
      width: 320,
      height: 200
    }
  };

  if (preview !== undefined) {
    result.preview = { feedHtml: preview, plain: 'Plain preview' };
  }

  return result;
}

function parse(xml) {
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`);
    }
  }).parseFromString(xml, 'application/xml');
}

const node = (doc, name) => doc.getElementsByTagName(name).item(0);

for (const format of ['rss', 'atom']) {
  const factory = format === 'rss' ? rss : atom;
  const options = format === 'rss' ? { ...config, author: undefined } : config;
  const make = (patch = {}) =>
    factory(
      Object.fromEntries(
        Object.entries({ ...options, ...patch }).filter(([, v]) => v !== undefined)
      )
    );
  const bodyName = format === 'rss' ? 'content:encoded' : 'content';
  const previewName = format === 'rss' ? 'description' : 'summary';

  test(`${format} consumes one PreparedPost with independent absent, empty and custom preview`, async () => {
    for (const preview of [undefined, '', '<p>Independent</p>']) {
      let calls = 0;
      const value = prepared(preview);
      const before = structuredClone(value);
      const post = source();
      const original = structuredClone(post);
      const renderer = make({
        prepare: (data, context) => {
          calls++;
          assert.deepEqual(data, post);
          assert.equal(context, ctx);
          return value;
        }
      });

      const xml = await renderer.collection({ posts: [post] }, ctx);
      const doc = parse(xml);
      const entry = node(doc, format === 'rss' ? 'item' : 'entry');

      assert.equal(node(entry, 'title').textContent, value.title);

      const full = node(entry, bodyName).textContent;
      assert.ok(full.startsWith('<figure><img src="https://example.test/blog/2026/11/cover.jpg"'));
      assert.ok(full.includes('alt="&lt;alt&gt;" width="320" height="200"'));
      assert.ok(full.includes('<figcaption>Prepared &lt;caption&gt;</figcaption></figure>'));
      assert.ok(full.endsWith(value.text.feedHtml));

      const summary = node(entry, previewName);

      if (preview === undefined) {
        if (format === 'rss') {
          assert.equal(summary.textContent, full);
        } else {
          assert.equal(summary, null);
        }
      } else {
        assert.equal(summary.textContent, preview);
      }

      if (format === 'atom') {
        assert.equal(node(entry, 'content').getAttribute('type'), 'html');
        if (summary) {
          assert.equal(summary.getAttribute('type'), 'html');
        }
      }

      assert.equal(calls, 1);
      assert.deepEqual(value, before);
      assert.deepEqual(post, original);
    }
  });

  test(`${format} captures all metadata before callback mutation and await`, async () => {
    const post = source();
    const before = structuredClone(post);
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const renderer = make({
      prepare: async (data) => {
        data.id = 'callback';
        data.uri = '2026/11/callback';
        data.tags.push('callback');
        entered.resolve();
        await release.promise;
        return prepared();
      }
    });
    const result = renderer.collection({ posts: [post] }, ctx);
    await entered.promise;

    Object.assign(post, {
      id: 'after',
      uri: '2026/11/after',
      title: 'After',
      publishedAt: '2026-12-01T00:00:00Z'
    });
    post.tags.push('after');

    release.resolve();
    const doc = parse(await result);
    const entry = node(doc, format === 'rss' ? 'item' : 'entry');

    assert.equal(node(entry, 'title').textContent, 'Prepared <title> 😀');
    assert.deepEqual(
      [...entry.getElementsByTagName('category')].map((n) =>
        format === 'rss' ? n.textContent : n.getAttribute('term')
      ),
      before.tags
    );
    assert.equal(
      format === 'rss' ? node(entry, 'link').textContent : node(entry, 'link').getAttribute('href'),
      'https://example.test/blog/2026/11/article'
    );
    assert.equal(
      node(entry, format === 'rss' ? 'guid' : 'id').textContent,
      `${config.feed}#post/${encodeURIComponent(before.id)}`
    );
  });

  test(`${format} uses escaped literal content without a hidden parser`, async () => {
    const post = {
      ...source(),
      text: '**literal** <script>x</script> & 😀',
      preview: '<preview>',
      cover: {}
    };
    const entry = node(
      parse(await make().collection({ posts: [post] }, ctx)),
      format === 'rss' ? 'item' : 'entry'
    );

    assert.equal(
      node(entry, bodyName).textContent,
      '**literal** &lt;script&gt;x&lt;/script&gt; &amp; 😀'
    );
    assert.equal(node(entry, previewName).textContent, '&lt;preview&gt;');
  });

  test(`${format} enforces the exact UTF-8 bytes after XML and HTML escaping`, async () => {
    const posts = [{ ...source(), text: '😀 & < > " \r\n', preview: '', cover: {} }];
    const xml = await make().collection({ posts }, ctx);
    const bytes = Buffer.byteLength(xml);

    assert.equal(await make({ bytes }).collection({ posts }, ctx), xml);
    await assert.rejects(() => make({ bytes: bytes - 1 }).collection({ posts }, ctx), {
      code: 'YAMB_RENDERER_INPUT'
    });

    const zero = make({ limit: 0, prepare: () => assert.fail('prepare') });
    await zero.collection(
      {
        posts: {
          [Symbol.iterator]() {
            assert.fail('iterator');
          }
        }
      },
      ctx
    );
  });

  test(`${format} preserves primitive abort reasons and ordinary errors despite abort`, async () => {
    for (const reason of [null, false, 0]) {
      const controller = new AbortController();
      let closed = 0;
      const posts = {
        *[Symbol.iterator]() {
          try {
            yield source();
            yield source();
          } finally {
            closed++;
          }
        }
      };
      const renderer = make({
        prepare: () => {
          controller.abort(reason);
          throw reason;
        }
      });

      await assert.rejects(
        () => renderer.collection({ posts }, { ...ctx, signal: controller.signal }),
        (e) => Object.is(e, reason)
      );
      assert.equal(closed, 1);
    }

    const controller = new AbortController();
    const failure = new Error('primary');
    const renderer = make({
      prepare: () => {
        controller.abort(0);
        throw failure;
      }
    });
    await assert.rejects(
      () => renderer.collection({ posts: [source()] }, { ...ctx, signal: controller.signal }),
      (e) => e.cause === failure
    );
  });

  test(`${format} validates raw source and bounded derived fields independently`, async () => {
    for (const patch of [
      { title: `${' '.repeat(501)}A` },
      { text: '😀'.repeat(524289) },
      { preview: '😀'.repeat(2501) },
      { tags: ['😀'.repeat(33)] },
      { cover: { alt: 'a'.repeat(5001) } },
      { cover: { url: '/a'.repeat(2049) } }
    ]) {
      await assert.rejects(
        () =>
          make({ prepare: () => assert.fail('prepare invalid source') }).collection(
            { posts: [{ ...source(), ...patch }] },
            ctx
          ),
        { code: 'YAMB_RENDERER_INPUT' }
      );
    }

    const post = {
      ...source(),
      cover: { url: `./${'a'.repeat(4094)}`, caption: 'a'.repeat(5000) }
    };
    const value = {
      ...prepared(),
      title: 'T'.repeat(501),
      cover: {
        url: new URL(post.cover.url, 'https://example.test/blog/2026/11/article').href,
        caption: 'C'.repeat(5001),
        alt: 'A'.repeat(5001)
      }
    };
    const doc = parse(await make({ prepare: () => value }).collection({ posts: [post] }, ctx));
    const full = node(doc, bodyName).textContent;

    assert.ok(full.includes(value.cover.url));
    assert.ok(full.includes(value.cover.caption));
    assert.ok(full.includes(`alt="${value.cover.alt}"`));

    for (const changed of [
      { title: 'a'.repeat(5000001) },
      { text: { feedHtml: 'a'.repeat(5000001) } },
      { cover: { alt: 'a'.repeat(5000001) } },
      { cover: { url: `https://example.test/${'a'.repeat(5000000)}` } }
    ]) {
      await assert.rejects(
        () =>
          make({ prepare: () => ({ ...prepared(), ...changed }) }).collection(
            { posts: [source()] },
            ctx
          ),
        { code: 'YAMB_RENDERER_INPUT' }
      );
    }
  });
}

for (const factory of [rss, atom]) {
  const settings =
    factory === rss
      ? { title: 'Feed', description: 'D', feed: 'https://example.test/rss' }
      : { title: 'Feed', feed: 'https://example.test/atom', author: { name: 'Editor' } };

  test(`${factory.name} closes real sync and async iterators once on take, error and abort`, async () => {
    for (const async of [false, true]) {
      for (const mode of ['take', 'failure', 'abort', 'next']) {
        const controller = new AbortController();
        const failure = new Error('primary');
        let pulled = 0,
          closed = 0;
        let output;
        const posts = {
          [async ? Symbol.asyncIterator : Symbol.iterator]() {
            return {
              next() {
                pulled++;

                if (mode === 'next') {
                  throw failure;
                }

                return { value: source(), done: false };
              },

              return() {
                closed++;

                if (mode === 'failure') {
                  controller.abort(0);
                  throw new Error('cleanup');
                }

                return { done: true };
              }
            };
          }
        };
        const renderer = factory({
          ...settings,
          limit: 1,
          prepare: () => {
            if (mode === 'failure') {
              throw failure;
            }

            if (mode === 'abort') {
              controller.abort(null);
              controller.signal.throwIfAborted();
            }

            return prepared();
          }
        });
        const render = async () => {
          output = await renderer.collection({ posts }, { ...ctx, signal: controller.signal });
        };

        if (mode === 'take') {
          await render();
          assert.equal(typeof output, 'string');
        } else {
          await assert.rejects(render, (e) =>
            mode === 'abort' ? e === null : e.cause === failure
          );
          assert.equal(output, undefined);
        }

        assert.equal(pulled, 1);
        assert.equal(closed, 1);
      }
    }
  });

  test(`${factory.name} default bytes guard rejects actual XML expansion under derived ceiling`, async () => {
    let closed = 0;
    const posts = {
      async *[Symbol.asyncIterator]() {
        try {
          yield source();
        } finally {
          closed++;
        }
      }
    };
    const large = { ...prepared(), text: { feedHtml: '&'.repeat(1800000) }, cover: {} };

    await assert.rejects(
      () => factory({ ...settings, prepare: () => large }).collection({ posts }, ctx),
      { code: 'YAMB_RENDERER_INPUT' }
    );
    assert.equal(closed, 1);
  });

  test(`${factory.name} stops oversized prepared URL before native parsing`, async (t) => {
    const renderer = factory({
      ...settings,
      prepare: () => {
        t.mock.method(URL, 'parse', () => assert.fail('oversized URL parsed'));
        return { ...prepared(), cover: { url: `https://example.test/${'x'.repeat(5000000)}` } };
      }
    });
    await assert.rejects(() => renderer.collection({ posts: [source()] }, ctx), {
      code: 'YAMB_RENDERER_INPUT'
    });
  });
}
