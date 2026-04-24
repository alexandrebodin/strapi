/**
 * Attribute-agnostic utilities for working with `blocks` attributes at
 * read and publish time.
 *
 * Read-time population: relation/media ref nodes inside a blocks JSON payload
 * are resolved against the live data so the API can return hydrated values
 * under a transient `resolved` key without mutating the stored JSON.
 *
 * Publish-time validation: relation ref nodes pointing at documents without a
 * published version at the requested locale cause `publish` to throw, matching
 * the policy for regular relation attributes.
 *
 * Neither routine touches the DB when a blocks value contains no resolvable
 * refs, so the overhead on blocks-heavy but ref-free content is negligible.
 */

import { errors } from '@strapi/utils';
import type { Struct, UID } from '@strapi/types';

type Status = 'draft' | 'published';

type BlocksCtx = {
  status: Status;
  locale?: string | null;
};

type PublishRefsMode = 'strict' | 'warn' | 'ignore';

const getPublishRefsMode = (): PublishRefsMode => {
  const raw = strapi.config.get('blocks.publishRefsOnPublish', 'strict') as unknown;
  if (raw === 'warn' || raw === 'ignore') return raw;
  return 'strict';
};

/** Returns the names of every `blocks` attribute on a schema. */
export const findBlocksAttributeNames = (
  schema: Struct.Schema | Struct.ContentTypeSchema
): string[] =>
  Object.entries(schema.attributes ?? {})
    .filter(([, attr]) => attr && (attr as any).type === 'blocks')
    .map(([name]) => name);

const lookupRelation = async (
  target: UID.ContentType,
  documentId: string,
  locale: string | null | undefined,
  status: Status
) => {
  const where: Record<string, unknown> = { documentId };
  if (locale) where.locale = locale;
  if (status === 'published') {
    where.publishedAt = { $notNull: true };
  } else {
    where.publishedAt = { $null: true };
  }

  try {
    return await strapi.db.query(target).findOne({ where });
  } catch {
    // Unknown / removed content type — surface as missing rather than crashing reads.
    return null;
  }
};

const resolveRelationNode = async (node: any, ctx: BlocksCtx) => {
  const { target, documentId } = node;
  if (!target || !documentId) {
    return { ...node, resolved: { missing: true } };
  }
  const targetLocale = node.locale ?? ctx.locale ?? null;
  const found = await lookupRelation(
    target as UID.ContentType,
    documentId,
    targetLocale,
    ctx.status
  );
  return { ...node, resolved: found ?? { missing: true } };
};

const normalizeLegacyImage = (node: any) => ({
  ...node,
  type: 'media' as const,
  kind: 'image' as const,
  media: node.image,
});

/**
 * Walks a blocks value and returns a new array with `relation` nodes resolved
 * and legacy `image` nodes normalised to the unified `media` shape.
 * The stored JSON is not mutated — callers consume the returned copy.
 */
export const populateBlocksValue = async (value: unknown, ctx: BlocksCtx): Promise<unknown> => {
  if (!Array.isArray(value)) return value;

  const walk = async (node: any): Promise<any> => {
    if (!node || typeof node !== 'object') return node;
    const children = Array.isArray(node.children)
      ? await Promise.all(node.children.map(walk))
      : node.children;

    let next = node;
    if (node.type === 'image') {
      next = normalizeLegacyImage(node);
    } else if (node.type === 'relation') {
      return { ...(await resolveRelationNode(node, ctx)), children };
    }

    return { ...next, children };
  };

  return Promise.all(value.map(walk));
};

/**
 * Resolves refs on every `blocks` attribute of a single entry. No-op when the
 * schema has none.
 */
export const populateEntryBlocks = async <T extends Record<string, unknown>>(
  entry: T | null | undefined,
  schema: Struct.Schema | Struct.ContentTypeSchema,
  ctx: BlocksCtx
): Promise<T | null | undefined> => {
  if (!entry) return entry;
  const names = findBlocksAttributeNames(schema);
  if (names.length === 0) return entry;

  const clone: Record<string, unknown> = { ...entry };
  for (const name of names) {
    clone[name] = await populateBlocksValue(entry[name], ctx);
  }
  return clone as T;
};

const collectRelationRefs = (
  value: unknown,
  out: Array<{ target: string; documentId: string; locale?: string | null }>
) => {
  if (!Array.isArray(value)) return;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'relation' && node.target && node.documentId) {
      out.push({ target: node.target, documentId: node.documentId, locale: node.locale ?? null });
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  value.forEach(walk);
};

/**
 * Walks every blocks attribute on an entry; for each `relation` node asserts
 * that the target document has a published version at the ref'd locale (or the
 * entry's locale as fallback). Policy is controlled by
 * `config.get('blocks.publishRefsOnPublish')` — 'strict' (default) throws,
 * 'warn' logs, 'ignore' does nothing.
 */
export const validateBlocksRefsForPublish = async (
  entry: Record<string, unknown>,
  schema: Struct.ContentTypeSchema,
  opts: { locale?: string | null } = {}
): Promise<void> => {
  const mode = getPublishRefsMode();
  if (mode === 'ignore') return;

  const names = findBlocksAttributeNames(schema);
  if (names.length === 0) return;

  const refs: Array<{ target: string; documentId: string; locale?: string | null }> = [];
  for (const name of names) collectRelationRefs(entry[name], refs);
  if (refs.length === 0) return;

  const entryLocale = (entry.locale as string | undefined) ?? opts.locale ?? null;
  const misses: string[] = [];

  await Promise.all(
    refs.map(async (ref) => {
      const targetLocale = ref.locale ?? entryLocale;
      try {
        const row = await strapi.db.query(ref.target as UID.ContentType).findOne({
          where: {
            documentId: ref.documentId,
            ...(targetLocale ? { locale: targetLocale } : {}),
            publishedAt: { $notNull: true },
          },
          select: ['id'],
        });
        if (!row) {
          misses.push(`${ref.target}#${ref.documentId}${targetLocale ? `@${targetLocale}` : ''}`);
        }
      } catch {
        misses.push(`${ref.target}#${ref.documentId} (unknown content type)`);
      }
    })
  );

  if (misses.length === 0) return;

  const message = `Cannot publish: ${misses.length} relation ref(s) inside blocks fields have no published version: ${misses.join(', ')}`;

  if (mode === 'warn') {
    strapi.log.warn(message);
    return;
  }

  throw new errors.ValidationError(message);
};
