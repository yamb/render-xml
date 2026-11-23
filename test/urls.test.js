import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { rss } from '../src/index.js';
import { blogWith } from './fixture.js';

for (const base of [
  'https://example.com/',
  'https://example.com/blog',
  'https://example.com/blog/',
  'https://example.com/blog?view=1#section'
]) {
  test(`RSS and Post.url agree at ${base}`, async (t) => {
    const blog = await blogWith([], {
      base,
      renderers: {
        rss: rss({ feed: 'https://example.com/rss', title: 'Feed', description: 'Description' })
      }
    });
    t.after(() => blog.close());

    const post = blog.build({ title: 'Post', slug: 'post', text: 'Body' });
    await post.publish();

    const expected = `https://example.com${new URL(base).pathname === '/' ? '' : '/blog'}/2026/11/post`;
    assert.equal(post.url().href, expected);

    const xml = await blog.render('rss', { posts: [post] });

    for (const [path, value] of [
      ['/rss/channel/item/link', expected],
      ['/rss/channel/item/guid', `https://example.com/rss#post/${post.id}`],
      ['/rss/channel/link', base]
    ]) {
      const result = spawnSync('xmllint', ['--nonet', '--xpath', `string(${path})`, '-'], {
        input: xml,
        encoding: 'utf8'
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trimEnd(), value);
    }
  });
}
