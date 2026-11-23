import { AsyncIteratorHelper } from '#core/async-iterator';
import { RendererFailedError, RendererInputError } from '#core/errors';

import { buildChannelHeader, closingTags } from '../../builders/channel.js';
import { buildItem } from '../../builders/item.js';
import { content } from '../../content.js';
import { toRfc2822Utc } from '../../lib/rfc2822.js';
import { writer } from '../../xml.js';
import { getState } from '../internal.js';

export default {
  name: 'collection',

  async fn(renderer, input, ctx) {
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

      const { config } = getState(renderer);
      const out = writer(config.bytes, renderer.name);
      buildChannelHeader(out, config, ctx);

      const { position } = out;
      let updated;
      const ids = new Set();

      if (config.limit > 0) {
        const iterator = AsyncIteratorHelper.from(posts, { signal: ctx.signal });

        for await (const value of iterator.take(config.limit)) {
          ctx.signal?.throwIfAborted();
          const { post, prepared, documentURL } = await content(value, config, ctx);

          if (ids.has(post.id)) {
            throw new RendererInputError('duplicate rss post id');
          }

          ids.add(post.id);

          buildItem(out, post, prepared, documentURL, config);

          for (const candidate of [post.updatedAt, post.publishedAt]) {
            if (!updated || Temporal.Instant.compare(candidate, updated) > 0) {
              updated = candidate;
            }
          }
        }
      }

      if (updated) {
        out.raw(`    <lastBuildDate>${toRfc2822Utc(updated)}</lastBuildDate>\n`, position);
      }

      out.raw(closingTags());
      ctx.signal?.throwIfAborted();

      return out.end();
    } catch (error) {
      if (ctx.signal?.aborted && Object.is(error, ctx.signal.reason)) {
        throw error;
      }

      if (error?.name === 'AbortError' || error?.code?.startsWith?.('YAMB_')) {
        throw error;
      }

      throw new RendererFailedError('rss generation failed', { cause: error });
    }
  }
};
