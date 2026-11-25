import { element } from '../xml.js';

export function buildChannelHeader(out, config, ctx) {
  out.raw('<?xml version="1.0" encoding="UTF-8"?>\n');
  out.raw(
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n  <channel>\n'
  );
  element(out, 'title', config.title);
  element(out, 'link', config.link ?? ctx.base.href);
  element(out, 'description', config.description);
  element(out, 'language', config.language);

  if (config.copyright !== undefined) {
    element(out, 'copyright', config.copyright);
  }
}
