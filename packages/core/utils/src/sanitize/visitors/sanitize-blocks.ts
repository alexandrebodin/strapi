import { isPrivateAttribute } from '../../content-types';
import type { Visitor } from '../../traverse/factory';
import type { Model } from '../../types';

/**
 * Walks a blocks JSON value and sanitises embedded component / dynamic-zone /
 * relation data:
 *
 *   - `component` nodes: private + password attributes of the referenced
 *     component schema are stripped from `data`. Nested `component`,
 *     `dynamiczone`, and `blocks` attributes inside `data` are recursed into so
 *     deeply-nested private fields don't leak.
 *   - `dynamic-zone` nodes: same, applied per item.
 *   - `relation` nodes: when `resolved` is present and not a miss marker, the
 *     target schema's private + password attributes are stripped.
 *
 * The visitor is idempotent and always returns a fresh object / array — it
 * never mutates the input. `getModel` is the only external dependency; when it
 * returns null the branch is left untouched (safer than guessing).
 */

type ComponentLikeAttribute = {
  type: 'component';
  component?: string;
};

type DynamicZoneAttribute = {
  type: 'dynamiczone';
};

type AnyAttributeShape = {
  type?: string;
  component?: string;
  private?: boolean;
  [key: string]: unknown;
};

const isComponentAttribute = (attribute: AnyAttributeShape): attribute is ComponentLikeAttribute =>
  attribute.type === 'component' && typeof attribute.component === 'string';

const isDynamicZoneAttribute = (attribute: AnyAttributeShape): attribute is DynamicZoneAttribute =>
  attribute.type === 'dynamiczone';

const isBlocksAttribute = (attribute: AnyAttributeShape) => attribute.type === 'blocks';

/**
 * Shallow-sanitise an entity against a schema, recursing into nested
 * component / dynamic-zone / blocks attributes so private fields deeper in
 * the tree are also stripped.
 */
const sanitiseEntityDeep = (
  data: unknown,
  schema: Model | null | undefined,
  getModel: (uid: string) => Model | null
): unknown => {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !schema?.attributes) {
    return data;
  }

  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };

  for (const [key, attributeRaw] of Object.entries(schema.attributes)) {
    if (!(key in out)) continue;

    const attribute = attributeRaw as AnyAttributeShape;

    const isPrivate = attribute.private === true || isPrivateAttribute(schema, key);
    const isPassword = attribute.type === 'password';
    if (isPrivate || isPassword) {
      delete out[key];
      continue;
    }

    if (isComponentAttribute(attribute) && attribute.component) {
      const nestedModel = getModel(attribute.component);
      if (!nestedModel) continue;
      const value = out[key];
      if (Array.isArray(value)) {
        out[key] = value.map((item) => sanitiseEntityDeep(item, nestedModel, getModel));
      } else if (value && typeof value === 'object') {
        out[key] = sanitiseEntityDeep(value, nestedModel, getModel);
      }
      continue;
    }

    if (isDynamicZoneAttribute(attribute)) {
      const value = out[key];
      if (!Array.isArray(value)) continue;
      out[key] = value.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const componentUid = (item as { __component?: string }).__component;
        if (!componentUid) return item;
        const nestedModel = getModel(componentUid);
        if (!nestedModel) return item;
        return sanitiseEntityDeep(item, nestedModel, getModel);
      });
      continue;
    }

    if (isBlocksAttribute(attribute)) {
      out[key] = walkBlocksValue(out[key], getModel);
    }
  }

  return out;
};

const walkBlocksValue = (value: unknown, getModel: (uid: string) => Model | null): unknown => {
  if (!Array.isArray(value)) return value;

  const walkNode = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    const next: any = { ...node };

    if (Array.isArray(next.children)) {
      next.children = next.children.map(walkNode);
    }

    if (next.type === 'component' && typeof next.componentUid === 'string') {
      next.data = sanitiseEntityDeep(next.data, getModel(next.componentUid), getModel);
    }

    if (next.type === 'dynamic-zone' && Array.isArray(next.items)) {
      next.items = next.items.map((item: any) => {
        if (!item || typeof item !== 'object' || typeof item.componentUid !== 'string') {
          return item;
        }
        return {
          ...item,
          data: sanitiseEntityDeep(item.data, getModel(item.componentUid), getModel),
        };
      });
    }

    if (
      next.type === 'relation' &&
      next.resolved &&
      typeof next.resolved === 'object' &&
      !('missing' in next.resolved) &&
      typeof next.target === 'string'
    ) {
      next.resolved = sanitiseEntityDeep(next.resolved, getModel(next.target), getModel);
    }

    return next;
  };

  return value.map(walkNode);
};

const visitor: Visitor = ({ key, value, attribute, getModel }, { set }) => {
  if (attribute?.type !== 'blocks') return;
  set(key, walkBlocksValue(value, getModel as (uid: string) => Model | null));
};

export default visitor;
