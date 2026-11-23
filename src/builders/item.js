import { full } from '../content.js';
import { toRfc2822Utc } from '../lib/rfc2822.js';
import { element } from '../xml.js';

export function buildItem(out, post, prepared, documentURL, config) {
  out.raw('    <item>\n');
  element(out, 'title', prepared.title);
  element(out, 'link', documentURL);
  element(
    out,
    'guid',
    `${config.id ?? config.feed}#post/${encodeURIComponent(post.id)}`,
    ' isPermaLink="false"'
  );
  element(out, 'pubDate', toRfc2822Utc(post.publishedAt));

  const body = full(prepared);
  element(out, 'content:encoded', body);
  element(out, 'description', prepared.preview === undefined ? body : prepared.preview.feedHtml);

  for (const tag of post.tags ?? []) {
    element(out, 'category', tag);
  }

  out.raw('    </item>\n');
}
