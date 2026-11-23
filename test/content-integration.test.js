import assert from 'node:assert/strict';
import test from 'node:test';

import { markdown } from '@meritt/yamb-markdown';
import { microtypo } from '@meritt/yamb-microtypo';
import { html } from '@meritt/yamb-render-html';
import { feed, json } from '@meritt/yamb-render-json';
import { DOMParser } from '@xmldom/xmldom';
import { prepare } from 'yamb/transform';

import { atom, rss } from '../src/index.js';
import { blogWith } from './fixture.js';

const xml = (value) =>
  new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`);
    }
  }).parseFromString(value, 'application/xml');
const node = (doc, name) => doc.getElementsByTagName(name).item(0);

test('one standard preparation feeds HTML, RSS, Atom and JSON Feed with matching words and safe media', async (t) => {
  await using md = markdown();
  await using typo = microtypo();
  const anchors = {
    name: 'anchors',
    version: '1',
    transform(value) {
      for (const token of value.text.tokens) {
        if (token.type === 'heading_open') {
          (token.attrs ??= []).push(['id', 'part']);
        }
      }

      return value;
    }
  };

  let preparations = 0;
  const prepareContent = (source, ctx) => {
    preparations++;
    return prepare(source, [md, anchors, md.html(), typo, md.clean()], ctx);
  };
  const shared = {};
  const reuse = () => shared.post;
  const blog = await blogWith([], {
    base: 'https://example.test/blog',
    renderers: {
      html: html({ prepare: reuse }),
      rss: rss({
        title: 'Feed',
        description: 'D',
        feed: 'https://example.test/rss',
        prepare: reuse
      }),
      atom: atom({
        title: 'Feed',
        feed: 'https://example.test/atom',
        author: { name: 'Editor' },
        prepare: reuse
      }),
      feed: feed({ title: 'Feed', feed: 'https://example.test/feed', prepare: reuse }),
      json: json()
    }
  });
  t.after(() => blog.close());

  const post = blog.build({
    title: '"Заголовок" - 1000 руб.',
    slug: 'article',
    text: 'Введение - 1000 руб.\n\n---\n\n## Раздел\n\n"Полный текст" - 1000 руб.\n\n![Image](./image.jpg)\n\n<video src="./movie.mp4" controls title="Movie"></video>\n\n<iframe src="https://www.youtube.com/embed/example" title="Video"></iframe>\n\n<script>evil()</script><img src="javascript:alert(1)" onerror="evil()">\n\n`"code" - 1000 руб.`',
    preview: '["Анонс" - 1000 руб.](#part)',
    cover: {
      url: './cover.jpg',
      alt: '<b>"Фото"</b> &lt; &amp; &amp;quot;',
      caption: '"Подпись" - 1000 руб.',
      width: 600,
      height: 400
    }
  });
  await post.publish();
  const source = post.toJSON();
  const before = structuredClone(source);
  const cached = await prepareContent(source, {
    base: new URL(blog.base),
    timeZone: blog.timeZone
  });
  shared.post = cached;

  const page = await blog.render('html', { post: source });
  const rssOutput = await blog.render('rss', { posts: blog.published });
  const rssDoc = xml(rssOutput);
  const atomDoc = xml(await blog.render('atom', { posts: [source] }));
  const result = await blog.render('feed', { posts: [source] });
  const item = result.items[0];
  const raw = await blog.render('json', { post: source });

  assert.equal(preparations, 1);
  assert.ok(Object.isFrozen(cached.text.tree.children));
  assert.equal(page.title, cached.title);
  assert.match(rssOutput, /Заголовок/);
  assert.equal(node(node(rssDoc, 'item'), 'title').textContent, page.title);
  assert.equal(node(node(atomDoc, 'entry'), 'title').textContent, page.title);
  assert.equal(item.title, page.title);
  assert.notEqual(page.title, source.title);
  assert.notEqual(page.cover.caption, source.cover.caption);
  assert.equal(page.cover.caption, cached.cover.caption);
  assert.equal(page.cover.alt, '<b>«Фото»</b> &lt; &amp; &amp;quot;');
  assert.equal(page.cover.alt, cached.cover.alt);

  const full = node(rssDoc, 'content:encoded').textContent;
  assert.equal(node(atomDoc, 'content').textContent, full);
  assert.equal(item.content_html, full);
  assert.ok(full.includes(`<figcaption>${cached.cover.caption}</figcaption>`));
  assert.ok(full.includes('alt="&lt;b&gt;«Фото»&lt;/b&gt; &amp;lt; &amp;amp; &amp;amp;quot;"'));
  assert.ok(full.endsWith(cached.text.feedHtml));
  assert.equal(node(node(rssDoc, 'item'), 'description').textContent, cached.preview.feedHtml);
  assert.equal(node(atomDoc, 'summary').textContent, cached.preview.feedHtml);
  assert.equal(item.summary, cached.preview.plain);

  assert.ok(full.includes('https://example.test/blog/2026/11/movie.mp4'));
  assert.ok(full.includes('https://www.youtube.com/embed/example'));
  assert.ok(full.includes('https://example.test/blog/2026/11/image.jpg'));
  assert.ok(page.body.includes('<video'));
  assert.ok(page.body.includes('<iframe'));
  assert.ok(!full.includes('<video'));
  assert.ok(!full.includes('<iframe'));
  assert.ok(!full.includes('<script'));
  assert.ok(!full.includes('javascript:'));
  assert.ok(!full.includes('onerror'));

  assert.ok(full.includes('<code>"code" - 1000 руб.</code>'));
  assert.ok(full.includes('Введение'));
  assert.ok(full.includes('Полный текст'));
  assert.ok(!full.includes('Анонс'));
  assert.ok(full.includes('id="user-content-part"'));
  assert.ok(
    cached.preview.feedHtml.includes('https://example.test/blog/2026/11/article#user-content-part')
  );
  assert.equal(item.image, cached.cover.url);

  assert.equal(raw.title, source.title);
  assert.equal(raw.text, source.text);
  assert.deepEqual(raw.cover, source.cover);
  assert.deepEqual(source, before);
  assert.deepEqual(post.toJSON(), before);
});

test('RSS identity survives publish, edit, rename and feed relocation', async (t) => {
  const config = {
    title: 'Feed',
    description: 'D',
    feed: 'https://example.test/new-rss',
    id: 'https://example.test/stable'
  };
  const blog = await blogWith([], {
    base: 'https://example.test/blog',
    renderers: { rss: rss(config) }
  });
  t.after(() => blog.close());

  const post = blog.build({ title: 'First', slug: 'first', text: 'First' });
  await post.publish();
  const before = xml(await blog.render('rss', { posts: [post] }));

  post.title = 'Edited';
  post.text = 'Edited';
  post.slug = 'renamed';
  await post.save();
  const after = xml(await blog.render('rss', { posts: [post] }));

  assert.equal(
    node(before, 'guid').textContent,
    `${config.id}#post/${encodeURIComponent(post.id)}`
  );
  assert.equal(node(after, 'guid').textContent, node(before, 'guid').textContent);
  assert.equal(node(after, 'guid').getAttribute('isPermaLink'), 'false');
  assert.equal(
    node(node(after, 'item'), 'link').textContent,
    'https://example.test/blog/2026/11/renamed'
  );
  assert.equal(node(node(after, 'item'), 'title').textContent, 'Edited');
});

test('real typography expansion and document-relative cover survive every output', async (t) => {
  await using md = markdown();
  await using typo = microtypo();
  const shared = {};
  const reuse = () => shared.post;
  const blog = await blogWith([], {
    base: 'https://example.test/blog',
    renderers: {
      html: html({ prepare: reuse }),
      rss: rss({
        title: 'Feed',
        description: 'D',
        feed: 'https://example.test/rss',
        prepare: reuse
      }),
      atom: atom({
        title: 'Feed',
        feed: 'https://example.test/atom',
        author: { name: 'Editor' },
        prepare: reuse
      }),
      feed: feed({ title: 'Feed', feed: 'https://example.test/feed', prepare: reuse })
    }
  });
  t.after(() => blog.close());

  const post = blog.build({
    title: '12345 '.repeat(83).padEnd(500, 'x'),
    text: 'Text',
    slug: 'article',
    cover: {
      url: `./${'a'.repeat(4094)}`,
      alt: 'т.е. '.repeat(1000),
      caption: '12345 '.repeat(833).padEnd(5000, 'x')
    }
  });
  await post.publish();
  const source = post.toJSON();
  const prepared = await prepare(source, [md, md.html(), typo, md.clean()], {
    base: new URL(blog.base),
    timeZone: blog.timeZone
  });

  assert.ok(prepared.title.length > 500);
  assert.ok(prepared.cover.caption.length > 5000);
  assert.equal(prepared.cover.alt, 'т.\u00a0е. '.repeat(1000).trim());
  assert.ok(prepared.cover.url.length > 4096);

  shared.post = prepared;
  const page = await blog.render('html', { post: source });
  const rssDoc = xml(await blog.render('rss', { posts: [source] }));
  const atomDoc = xml(await blog.render('atom', { posts: [source] }));
  const result = await blog.render('feed', { posts: [source] });
  const item = result.items[0];

  assert.equal(page.title, prepared.title);
  assert.equal(node(node(rssDoc, 'item'), 'title').textContent, page.title);
  assert.equal(node(node(atomDoc, 'entry'), 'title').textContent, page.title);
  assert.equal(item.title, page.title);

  const full = node(rssDoc, 'content:encoded').textContent;
  assert.equal(node(atomDoc, 'content').textContent, full);
  assert.equal(item.content_html, full);
  assert.ok(full.includes(prepared.cover.caption));
  assert.equal(page.cover.alt, prepared.cover.alt);
  assert.ok(full.includes(`alt="${prepared.cover.alt}"`));
  assert.equal(item.image, prepared.cover.url);
});
