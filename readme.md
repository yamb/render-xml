# yamb-render-xml

[![npm version][npm-image]][npm-url] [![Build status][github-actions-image]][github-actions-url] [![Coverage status][coveralls-image]][coveralls-url] [![Dependency status][libraries-image]][libraries-url]

Render [Yamb](https://github.com/yamb/yamb) post collections as RSS 2.0 and Atom 1.0 XML.

For GitHub Packages, route the `@yamb` scope to `https://npm.pkg.github.com` and install `@yamb/render-xml`.

## Quick start

Requires Node.js 26.13 or later and `yamb`. Direct rendering needs no storage.

```bash
pnpm add yamb yamb-render-xml
```

```js
import { atom, rss } from 'yamb-render-xml';

const source = {
  id: 'hello',
  uri: '2026/11/hello',
  title: 'Hello',
  text: 'Hello, world.',
  status: 'published',
  publishedAt: '2026-11-12T09:00:00Z',
  updatedAt: '2026-11-12T09:00:00Z'
};

const ctx = {
  base: new URL('https://example.com/blog'),
  timeZone: 'UTC'
};

const news = rss({
  title: 'My blog',
  description: 'Latest articles',
  language: 'en',
  feed: 'https://example.com/blog/rss.xml'
});

const updates = atom({
  title: 'My blog',
  feed: 'https://example.com/blog/atom.xml',
  author: {
    name: 'Editor'
  }
});

const input = {
  posts: [source]
};

console.log(await news.collection(input, ctx));
console.log(await updates.collection(input, ctx));
```

## Reference

- [RSS and Atom configuration](api/readme.md#configuration), [output mapping](api/readme.md#output-mapping) and [Markdown preparation](api/readme.md#content-and-preparation)
- [Yamb core reference](https://github.com/yamb/yamb#reference) for renderer registration and context

## Author

[Alexey Simonenko](https://simonenko.xyz)

## License

MIT. See `LICENSE`.

[npm-image]: https://img.shields.io/npm/v/yamb-render-xml?style=flat
[npm-url]: https://www.npmjs.com/package/yamb-render-xml
[github-actions-image]: https://github.com/yamb/render-xml/actions/workflows/ci.yml/badge.svg
[github-actions-url]: https://github.com/yamb/render-xml/actions/workflows/ci.yml
[coveralls-image]: https://coveralls.io/repos/github/yamb/render-xml/badge.svg
[coveralls-url]: https://coveralls.io/github/yamb/render-xml
[libraries-image]: https://img.shields.io/librariesio/release/npm/yamb-render-xml?style=flat
[libraries-url]: https://libraries.io/npm/yamb-render-xml
