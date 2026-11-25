import { AsyncIteratorHelper } from '#core/async-iterator';
import { RendererFailedError, RendererInputError } from '#core/errors';

import { content } from './content.js';

export async function* entries(input, config, ctx) {
  const posts = input?.posts;

  if (
    !posts ||
    (typeof posts[Symbol.asyncIterator] !== 'function' &&
      typeof posts[Symbol.iterator] !== 'function')
  ) {
    throw new RendererInputError('input.posts must be iterable or async iterable');
  }

  if (config.limit === 0) {
    return;
  }

  const ids = new Set();

  for await (const value of AsyncIteratorHelper.from(posts, { signal: ctx.signal }).take(
    config.limit
  )) {
    ctx.signal?.throwIfAborted();
    const entry = await content(value, config, ctx);

    if (ids.has(entry.post.id)) {
      throw new RendererInputError('duplicate post id');
    }

    ids.add(entry.post.id);
    yield entry;
  }
}

export function failure(format, error, signal) {
  if (
    (signal?.aborted && Object.is(error, signal.reason)) ||
    error?.name === 'AbortError' ||
    error?.code?.startsWith?.('YAMB_')
  ) {
    return error;
  }

  return new RendererFailedError(`${format} generation failed`, { cause: error });
}
