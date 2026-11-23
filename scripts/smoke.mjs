import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import pkg from './package.json' with { type: 'json' };

const { atom, rss } = await import(pkg.name);

import { blogWith } from './test/fixture.js';

await using blog = await blogWith([], {
  base: 'https://example.test/blog',
  renderers: {
    atom: atom({ title: 'Example', feed: 'https://example.test/atom', author: { name: 'Editor' } }),
    rss: rss({ title: 'Example', feed: 'https://example.test/rss', description: 'Example feed' })
  }
});

const post = await blog.create({ title: 'Example post', text: 'Body' });
await post.publish();

for (const renderer of ['rss', 'atom']) {
  const input = await blog.render(renderer, { posts: blog.published });
  execFileSync('xmllint', ['--nonet', '--noout', '-'], { input });
  assert.match(input, /Example post/);
}
