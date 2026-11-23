import { AtomRenderer } from './atom/index.js';
import { RssRenderer } from './rss/index.js';

export function rss(config) {
  return new RssRenderer(config);
}

export function atom(config) {
  return new AtomRenderer(config);
}

export { AtomRenderer, RssRenderer };
