import { z } from 'zod';

import pkg from '../../package.json' with { type: 'json' };
import { XmlRendererConfigError } from '../errors/index.js';
import { ConfigSchema } from '../schemas/zod.js';
import { setState } from './internal.js';
import methods from './methods.js';

export class RssRenderer {
  constructor(config) {
    const result = ConfigSchema.safeParse(config);

    if (!result.success) {
      throw new XmlRendererConfigError(`invalid config: ${z.prettifyError(result.error)}`, {
        details: { issues: result.error.issues }
      });
    }

    this.name = 'rss';
    this.version = pkg.version;
    setState(this, { config: result.data });
  }

  static {
    for (const method of methods) {
      Object.defineProperty(this.prototype, method.name, {
        value(...args) {
          return method.fn(this, ...args);
        },
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  }
}
