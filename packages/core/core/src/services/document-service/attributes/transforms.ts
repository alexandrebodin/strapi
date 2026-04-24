import { getOr, toNumber, isString } from 'lodash/fp';
import type { Schema } from '@strapi/types';
import bcrypt from 'bcryptjs';

type Transforms = {
  [TKind in Schema.Attribute.Kind]?: (
    value: unknown,
    context: {
      attribute: Schema.Attribute.AnyAttribute;
      attributeName: string;
    }
  ) => any;
};

/** Generate a short, stable-ish id for a freshly-created blocks node. */
let blocksIdCounter = 0;
const generateBlockNodeId = (): string => {
  const counter = blocksIdCounter;
  blocksIdCounter += 1;
  return `bn_${Date.now().toString(36)}_${counter.toString(36)}`;
};

/**
 * Walk a blocks tree and return a canonical copy:
 *   - every node carries a stable `id`
 *   - unknown top-level keys are preserved (we don't own the full surface)
 *
 * Intentionally does NOT rewrite legacy `image` nodes on write — read-time
 * normalisation in `blocks/populate.ts` keeps the DB untouched so old clients
 * still see the shape they stored.
 */
const canonicaliseBlocksNode = (node: any): any => {
  if (!node || typeof node !== 'object') return node;
  const next: any = { ...node };
  if (typeof next.id !== 'string' || next.id.length === 0) {
    next.id = generateBlockNodeId();
  }
  if (Array.isArray(next.children)) {
    next.children = next.children.map(canonicaliseBlocksNode);
  }
  return next;
};

const transforms: Transforms = {
  password(value, context) {
    const { attribute } = context;

    if (attribute.type !== 'password') {
      throw new Error('Invalid attribute type');
    }

    if (!isString(value) && !(value instanceof Buffer)) {
      return value;
    }

    const rounds = toNumber(getOr(10, 'encryption.rounds', attribute));

    return bcrypt.hashSync(value.toString(), rounds);
  },
  blocks(value) {
    if (!Array.isArray(value)) return value;
    return value.map(canonicaliseBlocksNode);
  },
};

export default transforms;
