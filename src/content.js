import { RendererInputError } from '#core/errors';
import { url } from '#core/url';

import { FeedPostSchema, PreparedSchema } from './schemas/zod.js';

function parse(schema, value, message) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new RendererInputError(message, { details: { issues: result.error.issues } });
  }

  return result.data;
}

function escape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function literal(title, { text, preview, cover }) {
  const prepared = { title, text: { feedHtml: escape(text) }, cover };

  if (preview !== undefined) {
    prepared.preview = { feedHtml: escape(preview), plain: preview };
  }

  return prepared;
}

export async function content(value, config, ctx) {
  const source = structuredClone(value);
  const post = parse(FeedPostSchema, source, 'feed requires saved published posts');

  const prepared = config.prepare
    ? await config.prepare(structuredClone(source), ctx)
    : literal(source.title, post);
  ctx.signal?.throwIfAborted();

  const result = parse(PreparedSchema, prepared, 'invalid prepared post');
  const documentURL = url(post.uri, ctx.base).href;
  const cover = result.cover.url
    ? { ...result.cover, url: new URL(result.cover.url, documentURL).href }
    : result.cover;

  if ((cover.url?.length ?? 0) > 5000000) {
    throw new RendererInputError('derived cover URL exceeds 5000000 UTF-16 units');
  }

  return { post, prepared: { ...result, cover }, documentURL };
}

export function full(prepared) {
  const { cover } = prepared;

  if (!cover.url) {
    return prepared.text.feedHtml;
  }

  let image = `<figure><img src="${escape(cover.url)}" alt="${escape(cover.alt ?? '')}"`;

  if (cover.width !== undefined) {
    image += ` width="${cover.width}"`;
  }

  if (cover.height !== undefined) {
    image += ` height="${cover.height}"`;
  }

  image += '>';

  if (cover.caption !== undefined) {
    image += `<figcaption>${escape(cover.caption)}</figcaption>`;
  }

  return `${image}</figure>${prepared.text.feedHtml}`;
}
