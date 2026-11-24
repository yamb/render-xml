# RSS and Atom renderer API

Use `rss(config)` or `new RssRenderer(config)` for RSS 2.0, and `atom(config)` or `new AtomRenderer(config)` for Atom 1.0. See the [quick start](../readme.md#quick-start) for direct calls. With the renderer registered, call `blog.render('rss', { posts: blog.published })` or the equivalent Atom call.

Serve RSS as `application/rss+xml; charset=utf-8` and Atom as `application/atom+xml; charset=utf-8`. `post.render(format)` fails with `YAMB_RENDERER_SCOPE`. See the [Yamb core reference](https://github.com/yamb/yamb#reference) for renderer context, snapshots and cancellation, and for collection selection and ordering.

## Configuration

Unknown keys are rejected. Common settings apply to both factories:

| Key | Meaning | Default |
| --- | --- | --- |
| `title` | Plain feed title; RSS requires a nonempty string, Atom rejects whitespace-only strings | Required |
| `feed` | Absolute HTTP(S) feed URL without credentials or a fragment | Required |
| `id` | Stable absolute HTTP(S) identity URL without credentials or a fragment; keep it unchanged when relocating the feed | `feed` |
| `link` | Site link, absolute HTTP(S) URL without credentials | `ctx.base.href` |
| `prepare` | Sync or async whole-post callback `(source, ctx)` | Absent |
| `limit` | Nonnegative safe integer; maximum posts consumed | `20` |
| `bytes` | Positive safe integer; maximum final UTF-8 XML bytes | `8388608` |

| Key | RSS | Atom |
| --- | --- | --- |
| `description` | Required nonempty plain channel description | Optional plain subtitle, including `''` |
| `language` | Defaults to `'ru'`; matches `[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*` | Optional `xml:lang`; validated by `Intl.getCanonicalLocales`, supplied spelling retained |
| `copyright` | Optional plain channel copyright | Unsupported |
| `author` | Unsupported | Optional `{ name, email?, url? }`; required for an empty feed or when any entry lacks an author |
| `updated` | Unsupported | Feed metadata timestamp; defaults to `'1970-01-01T00:00:00Z'` |

## Output mapping

Input is `{ posts }`, where `posts` is sync or async iterable. Every consumed post must be saved and published, with a unique valid-Unicode `id`, `uri`, `title`, `text`, `updatedAt` and `publishedAt`. Source fields follow the core post schema and limits; optional author, tags, preview and cover are validated before preparation. Input order is preserved.

| Value | RSS 2.0 | Atom 1.0 |
| --- | --- | --- |
| Feed metadata | `title`, `link`, `description`, `language`, optional `copyright` | Plain `title type="text"`, `id`, self/alternate links, optional `subtitle type="text"`, `xml:lang`, `author` |
| Post title | `item/title` | `entry/title type="text"` |
| Article URL | `item/link` | `entry/link rel="alternate" type="text/html"` |
| Stable post identity | `guid isPermaLink="false"` | `entry/id` |
| Publication time | `pubDate`, RFC 2822 in GMT, whole seconds | `published`, UTC with nine fractional digits |
| Modification time | Channel `lastBuildDate`: maximum of rendered `updatedAt` and `publishedAt`; absent for empty input | Entry `updated`; feed `updated` is the maximum of configured `updated` and rendered `updatedAt`, with nine fractional digits |
| Full content | `content:encoded` | `content type="html"` |
| Explicit preview | `description`; absent preview uses full content | `summary type="html"`; omitted without preview |
| Tags | One `category` text element per tag | One `category term="…"` per tag |
| Post author | Omitted | Entry `author`, inheriting the feed author when absent |

RSS identities are `${id ?? feed}#post/${encodeURIComponent(post.id)}`. Atom first canonicalizes `id ?? feed` with `new URL(value).href`; its feed ID is that URL and entry IDs append the same suffix. Atom also canonicalizes its self link; RSS does not emit a self link. Changing a post URI changes its article link, while its ID remains stable. Set Atom `updated` explicitly for feed metadata changes and deletions.

Article URLs use core `url(post.uri, ctx.base)`, treating a mounted base pathname as a directory even without a trailing slash. Atom author URLs resolve against that base directory. Relative cover URLs use native URL semantics against the article URL: `./cover.jpg` beside `/blog/2026/11/article` becomes `/blog/2026/11/cover.jpg`.

## Content and preparation

Without `prepare`, body and preview are literal source escaped for HTML. The serializer emits XML character data, escaping `]]>` and removing XML 1.0 forbidden characters and unpaired surrogates. Legal Unicode and carriage returns survive, as do tabs and newlines in Atom category attributes.

The callback receives its own PostData snapshot and context. It supplies title, body, preview and cover. The remaining metadata comes from the original snapshot. This example shows the consumed fields.

```js
const prepared = {
  title: 'Plain title',
  text: {
    feedHtml: '<p>Complete article</p>'
  },
  preview: {
    feedHtml: '<p>Independent preview</p>',
    plain: 'Independent preview'
  },
  cover: {
    url: './cover.jpg',
    alt: 'Plain alt',
    caption: 'Plain caption'
  }
};
```

`preview` is optional, and `plain` is optional within it; XML uses only `feedHtml`. Cover fields follow the core cover schema, except derived URL/alt/caption have the larger string budget below. A nonempty cover URL prepends a figure to full content, with HTML-escaped URL, alt and caption and optional width/height. Full content always contains all `text.feedHtml`. An explicit empty preview stays empty; neither format generates a preview or prepends it to full text.

RSS and Atom accept the same preparation callback as HTML and JSON Feed. This example configures Atom with Markdown and MicroTypo.

```js
import { markdown } from 'yamb-markdown';
import { microtypo } from 'yamb-microtypo';
import { atom } from 'yamb-render-xml';
import { prepare } from 'yamb/transform';

await using md = markdown();
await using typo = microtypo();

const stages = [md, md.html(), typo, md.clean()];

const news = atom({
  title: 'My blog',
  feed: 'https://example.com/blog/atom.xml',
  author: {
    name: 'Editor'
  },
  prepare: (source, ctx) => prepare(source, stages, ctx)
});
```

Keep these owners alive until rendering completes. The renderer trusts prepared HTML; `md.clean()` owns sanitation and safe `feedHtml`, including links in place of unsupported media. See the [Markdown reference](https://github.com/yamb/markdown#reference) for stages, projections and cleanup, and the [MicroTypo reference](https://github.com/yamb/microtypo#reference) for native typography. The core reference covers preparation and caching.

## Limits and errors

Each consumed derived title, `text.feedHtml`, `preview.feedHtml`, optional `preview.plain`, cover URL, alt and caption is limited to 5000000 UTF-16 code units; the resolved cover URL is checked again. The final `bytes` budget includes markup and XML escaping. Overflow rejects without returning partial XML. `limit: 0` never starts the source or calls `prepare`. Limit, processing failure, source failure and cancellation close the source iterator; the renderer leaves storage open. Callbacks must cooperate with `ctx.signal`.

| Code | Cause |
| --- | --- |
| `YAMB_XML_RENDERER_CONFIG` | Invalid factory configuration; `XmlRendererConfigError` is exported from `yamb-render-xml/errors` |
| `YAMB_RENDERER_INPUT` | Missing/noniterable `posts`, invalid post/prepared fields, duplicate ID, missing Atom author or output overflow |
| `YAMB_RENDERER_FAILED` | Unexpected failure, with the original error as `cause` |

Yamb errors and native cancellation reasons pass through unchanged, including non-Error reasons. The renderers perform no filesystem or network I/O; the application owns callback work.
