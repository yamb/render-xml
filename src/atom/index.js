import { RendererInputError } from '#core/errors';
import { url } from '#core/url';

import pkg from '../../package.json' with { type: 'json' };
import { entries, failure } from '../collection.js';
import { full } from '../content.js';
import { AtomConfigSchema, parseConfig } from '../schemas/zod.js';
import { author, element, link, writer } from '../xml.js';

const precision = { fractionalSecondDigits: 9 };

export class AtomRenderer {
  #config;
  #id;
  #self;

  constructor(config) {
    this.#config = parseConfig(AtomConfigSchema, config);
    this.#id = new URL(this.#config.id ?? this.#config.feed).href;
    this.#self = new URL(this.#config.feed).href;
    this.name = 'atom';
    this.version = pkg.version;
  }

  async collection(input, ctx) {
    try {
      ctx.signal?.throwIfAborted();
      const config = this.#config;
      const base = url('./', ctx.base);
      const out = writer(config.bytes, this.name);
      let { updated } = config;
      let count = 0;

      out.raw('<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"');

      if (config.language !== undefined) {
        out.raw(' xml:lang="');
        out.text(config.language, true);
        out.raw('"');
      }

      out.raw('>\n');

      element(out, 'title', config.title, ' type="text"');
      element(out, 'id', this.#id);
      link(out, 'self', 'application/atom+xml', this.#self);
      link(out, 'alternate', 'text/html', config.link ?? ctx.base.href);

      if (config.description !== undefined) {
        element(out, 'subtitle', config.description, ' type="text"');
      }

      if (config.author) {
        author(out, config.author, base);
      }

      const { position } = out;

      for await (const { post, prepared, documentURL } of entries(input, config, ctx)) {
        if (!config.author && !post.author) {
          throw new RendererInputError('atom requires a feed author or an author on every entry');
        }

        count++;

        if (Temporal.Instant.compare(post.updatedAt, updated) > 0) {
          updated = post.updatedAt;
        }

        out.raw('<entry>\n');
        element(out, 'id', `${this.#id}#post/${encodeURIComponent(post.id)}`);
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

      if (count === 0 && !config.author) {
        throw new RendererInputError('empty atom feed requires an author');
      }

      out.raw(`<updated>${updated.toString(precision)}</updated>\n`, position);
      out.raw('</feed>');
      ctx.signal?.throwIfAborted();

      return out.end();
    } catch (error) {
      throw failure(this.name, error, ctx.signal);
    }
  }
}
