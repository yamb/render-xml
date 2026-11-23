import { z } from 'zod';

import { AsyncIteratorHelper } from '#core/async-iterator';
import { RendererFailedError, RendererInputError } from '#core/errors';
import { url } from '#core/url';

import pkg from '../../package.json' with { type: 'json' };
import { content, full } from '../content.js';
import { XmlRendererConfigError } from '../errors/index.js';
import { AtomConfigSchema } from '../schemas/zod.js';
import { author, element, link, writer } from '../xml.js';

const precision = { fractionalSecondDigits: 9 };

export class AtomRenderer {
  #config;

  constructor(config) {
    const result = AtomConfigSchema.safeParse(config);

    if (!result.success) {
      throw new XmlRendererConfigError(`invalid config: ${z.prettifyError(result.error)}`, {
        details: { issues: result.error.issues }
      });
    }

    this.name = 'atom';
    this.version = pkg.version;
    this.#config = result.data;
  }

  async collection(input, ctx) {
    try {
      ctx.signal?.throwIfAborted();
      const posts = input?.posts;

      if (
        !posts ||
        (typeof posts[Symbol.asyncIterator] !== 'function' &&
          typeof posts[Symbol.iterator] !== 'function')
      ) {
        throw new RendererInputError('input.posts must be iterable or async iterable');
      }

      const config = this.#config;
      const base = url('./', ctx.base);
      const out = writer(config.bytes, this.name);
      let { updated } = config;

      out.raw('<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"');

      if (config.language !== undefined) {
        out.raw(' xml:lang="');
        out.text(config.language, true);
        out.raw('"');
      }

      out.raw('>\n');

      element(out, 'title', config.title, ' type="text"');
      element(out, 'id', new URL(config.id ?? config.feed).href);
      link(out, 'self', 'application/atom+xml', new URL(config.feed).href);
      link(out, 'alternate', 'text/html', config.link ?? ctx.base.href);

      if (config.description !== undefined) {
        element(out, 'subtitle', config.description, ' type="text"');
      }

      if (config.author) {
        author(out, config.author, base);
      }

      const { position } = out;
      const ids = new Set();

      if (config.limit > 0) {
        const iterator = AsyncIteratorHelper.from(posts, { signal: ctx.signal });

        for await (const value of iterator.take(config.limit)) {
          ctx.signal?.throwIfAborted();
          const { post, prepared, documentURL } = await content(value, config, ctx);

          if (ids.has(post.id)) {
            throw new RendererInputError('duplicate atom post id');
          }

          ids.add(post.id);

          if (!config.author && !post.author) {
            throw new RendererInputError('atom requires a feed author or an author on every entry');
          }

          if (Temporal.Instant.compare(post.updatedAt, updated) > 0) {
            updated = post.updatedAt;
          }

          out.raw('<entry>\n');
          element(
            out,
            'id',
            `${new URL(config.id ?? config.feed).href}#post/${encodeURIComponent(post.id)}`
          );
          element(out, 'title', prepared.title, ' type="text"');
          link(out, 'alternate', 'text/html', documentURL);
          element(out, 'published', post.publishedAt.toString(precision));
          element(out, 'updated', post.updatedAt.toString(precision));

          if (post.author) {
            author(out, post.author, base);
          }

          for (const tag of post.tags ?? []) {
            out.raw('<category term="');
            out.text(tag, true);
            out.raw('"/>\n');
          }

          if (prepared.preview !== undefined) {
            element(out, 'summary', prepared.preview.feedHtml, ' type="html"');
          }

          element(out, 'content', full(prepared), ' type="html"');
          out.raw('</entry>\n');
        }
      }

      if (ids.size === 0 && !config.author) {
        throw new RendererInputError('empty atom feed requires an author');
      }

      out.raw(`<updated>${updated.toString(precision)}</updated>\n`, position);
      out.raw('</feed>');
      ctx.signal?.throwIfAborted();

      return out.end();
    } catch (error) {
      if (ctx.signal?.aborted && Object.is(error, ctx.signal.reason)) {
        throw error;
      }

      if (error?.name === 'AbortError' || error?.code?.startsWith?.('YAMB_')) {
        throw error;
      }

      throw new RendererFailedError('atom generation failed', { cause: error });
    }
  }
}
