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

export const ConfigSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
  language: z
    .string()
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, 'must be a BCP 47 language tag')
    .default('ru'),
  copyright: z.string().optional(),
  link: HttpUrlSchema.optional(),
  feed: HttpUrlSchema.refine((value) => !value.includes('#'), 'must not contain a fragment'),
  id: HttpUrlSchema.refine(
    (value) => !value.includes('#'),
    'must not contain a fragment'
  ).optional(),
  prepare: z.function().optional(),
  limit: z.number().int().nonnegative().default(20),
  bytes: z.number().int().positive().default(8388608)
});

const AtomLanguageSchema = z.string().refine((value) => {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}, 'must be a locale identifier supported by Intl');

const AtomUrlSchema = HttpUrlSchema.refine(
  (value) => !value.includes('#'),
  'must not contain a fragment'
);

export const AtomConfigSchema = z.strictObject({
  title: z.string().refine((value) => value.trim().length > 0, 'must not be empty'),
  feed: AtomUrlSchema,
  id: AtomUrlSchema.optional(),
  link: HttpUrlSchema.optional(),
  description: z.string().optional(),
  language: AtomLanguageSchema.optional(),
  author: AuthorSchema.optional(),
  prepare: z.function().optional(),
  limit: z.number().int().nonnegative().default(20),
  bytes: z.number().int().positive().default(8388608),
  updated: InstantSchema.prefault('1970-01-01T00:00:00Z')
});

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
