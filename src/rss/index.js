import pkg from '../../package.json' with { type: 'json' };
import { buildChannelHeader } from '../builders/channel.js';
import { buildItem } from '../builders/item.js';
import { entries, failure } from '../collection.js';
import { toRfc2822Utc } from '../lib/rfc2822.js';
import { parseConfig, RssConfigSchema } from '../schemas/zod.js';
import { writer } from '../xml.js';

export class RssRenderer {
  #config;

  constructor(config) {
    this.#config = parseConfig(RssConfigSchema, config);
    this.name = 'rss';
    this.version = pkg.version;
  }

  async collection(input, ctx) {
    try {
      ctx.signal?.throwIfAborted();
      const config = this.#config;
      const out = writer(config.bytes, this.name);
      buildChannelHeader(out, config, ctx);

      const { position } = out;
      let updated;

      for await (const { post, prepared, documentURL } of entries(input, config, ctx)) {
        buildItem(out, post, prepared, documentURL, config);

        for (const candidate of [post.updatedAt, post.publishedAt]) {
          if (!updated || Temporal.Instant.compare(candidate, updated) > 0) {
            updated = candidate;
          }
        }
      }

      if (updated) {
        out.raw(`    <lastBuildDate>${toRfc2822Utc(updated)}</lastBuildDate>\n`, position);
      }

      out.raw('  </channel>\n</rss>');
      ctx.signal?.throwIfAborted();

      return out.end();
    } catch (error) {
      throw failure(this.name, error, ctx.signal);
    }
  }
}
