import { z } from 'zod';

import {
  AuthorSchema,
  CoverSchema,
  IdSchema,
  InstantSchema,
  PreviewSchema,
  TagsSchema,
  TextSchema,
  TitleSchema,
  UriSchema
} from '#core/schemas';

import { XmlRendererConfigError } from '../errors/index.js';

function isHttpUrl(value) {
  // oxlint-disable-next-line no-control-regex
  if (/[\\\x00-\x20\x7f]/u.test(value) || !/^https?:\/\//i.test(value)) {
    return false;
  }

  const url = URL.parse(value);

  return url !== null && !url.username && !url.password;
}

const HttpUrlSchema = z
  .string()
  .trim()
  .refine(isHttpUrl, 'must be an absolute HTTP(S) URL without credentials');

const FeedUrlSchema = HttpUrlSchema.refine(
  (value) => !value.includes('#'),
  'must not contain a fragment'
);

const common = {
  feed: FeedUrlSchema,
  id: FeedUrlSchema.optional(),
  link: HttpUrlSchema.optional(),
  prepare: z.function().optional(),
  limit: z.number().int().nonnegative().default(20),
  bytes: z.number().int().positive().default(8388608)
};

export const RssConfigSchema = z.strictObject({
  ...common,
  title: z.string().min(1),
  description: z.string().min(1),
  language: z
    .string()
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, 'must be a BCP 47 language tag')
    .default('ru'),
  copyright: z.string().optional()
});

const AtomLanguageSchema = z.string().refine((value) => {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}, 'must be a locale identifier supported by Intl');

export const AtomConfigSchema = z.strictObject({
  ...common,
  title: z.string().refine((value) => value.trim().length > 0, 'must not be empty'),
  description: z.string().optional(),
  language: AtomLanguageSchema.optional(),
  author: AuthorSchema.optional(),
  updated: InstantSchema.prefault('1970-01-01T00:00:00Z')
});

export function parseConfig(schema, config) {
  const result = schema.safeParse(config);

  if (!result.success) {
    throw new XmlRendererConfigError(`invalid config: ${z.prettifyError(result.error)}`, {
      details: { issues: result.error.issues }
    });
  }

  return result.data;
}

const derived = z.string().refine((value) => value.length <= 5000000, {
  error: 'derived field exceeds 5000000 UTF-16 units',
  abort: true
});

const PreparedCoverSchema = z.strictObject({
  ...CoverSchema.in.shape,
  alt: derived.optional(),
  caption: derived.optional(),
  url: derived
    .refine((value) => {
      // oxlint-disable-next-line no-control-regex
      if (/[\\\x00-\x20\x7f]/u.test(value) || value.startsWith('//')) {
        return false;
      }

      if (value === '') {
        return true;
      }

      if (value.startsWith('/') || value.startsWith('./')) {
        return URL.canParse(value, 'https://example.invalid/');
      }

      return isHttpUrl(value);
    }, 'invalid prepared cover URL')
    .optional()
});

export const PreparedSchema = z.object({
  title: derived,
  text: z.object({ feedHtml: derived }),
  preview: z.object({ feedHtml: derived, plain: derived.optional() }).optional(),
  cover: PreparedCoverSchema
});

export const FeedPostSchema = z.object({
  id: IdSchema.refine((value) => value.isWellFormed(), 'id must be valid Unicode'),
  uri: UriSchema,
  title: z
    .string()
    .refine((value) => value.length <= 500, {
      error: 'title exceeds 500 UTF-16 units',
      abort: true
    })
    .pipe(TitleSchema),
  text: TextSchema,
  preview: PreviewSchema.optional(),
  cover: CoverSchema.default({}),
  status: z.literal('published'),
  updatedAt: InstantSchema,
  publishedAt: InstantSchema,
  author: AuthorSchema.optional(),
  tags: TagsSchema.optional()
});
