import type * as UID from '../../../uid';
import type { Intersect } from '../../../utils';
import type { Attribute } from '../..';

/**
 * Represents a block Strapi attribute along with its options
 */
export type Blocks = Intersect<
  [
    Attribute.OfType<'blocks'>,
    // Options
    Attribute.ConfigurableOption,
    Attribute.PrivateOption,
    Attribute.RequiredOption,
    Attribute.WritableOption,
    Attribute.VisibleOption,
  ]
>;

export type BlocksValue = RootNode[];

export type GetBlocksValue<T extends Attribute.Attribute> = T extends Blocks ? BlocksValue : never;

// Block node types
type RootNode =
  | ParagraphBlockNode
  | QuoteBlockNode
  | CodeBlockNode
  | HeadingBlockNode
  | ListBlockNode
  | ImageBlockNode
  | MediaBlockNode
  | ComponentBlockNode
  | DynamicZoneBlockNode
  | RelationBlockNode;

// Type utils needed for the blocks renderer and the blocks editor
export type BlocksNode = RootNode | NonTextInlineNode;
export type BlocksInlineNode = NonTextInlineNode;
export type BlocksTextNode = TextInlineNode;

interface TextInlineNode {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
}

interface BaseNode {
  type: string;
  /**
   * Stable, editor-assigned node identifier.
   * Populated by the document-service canonicalisation transform on write.
   */
  id?: string;
  children: unknown[];
}

export interface LinkInlineNode extends BaseNode {
  type: 'link';
  url: string;
  children: TextInlineNode[];
  rel: string;
  target: string;
}

interface ListItemInlineNode extends BaseNode {
  type: 'list-item';
  children: DefaultInlineNode[];
}

type InlineNode = TextInlineNode | LinkInlineNode | ListItemInlineNode;

type DefaultInlineNode = Exclude<InlineNode, ListItemInlineNode>;
type NonTextInlineNode = Exclude<InlineNode, TextInlineNode>;

interface ParagraphBlockNode extends BaseNode {
  type: 'paragraph';
  children: DefaultInlineNode[];
}

interface QuoteBlockNode extends BaseNode {
  type: 'quote';
  children: DefaultInlineNode[];
}

interface CodeBlockNode extends BaseNode {
  type: 'code';
  language?: string;
  children: DefaultInlineNode[];
}

interface HeadingBlockNode extends BaseNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: DefaultInlineNode[];
}

export interface ListBlockNode extends BaseNode {
  type: 'list';
  format: 'ordered' | 'unordered';
  children: (ListItemInlineNode | ListBlockNode)[];
  indentLevel?: number;
}

/**
 * Legacy image-only block.
 *
 * Retained in the union for backward compatibility with entries created before
 * the unified `media` node. The editor emits {@link MediaBlockNode} going
 * forward; the document-service populator normalises legacy `image` nodes into
 * `media` shape at read time without rewriting stored data.
 */
export interface ImageBlockNode extends BaseNode {
  type: 'image';
  image: Attribute.MediaValue<false>;
  children: [{ type: 'text'; text: '' }];
}

export type BlocksMediaKind = 'image' | 'video' | 'audio' | 'file';

/**
 * Unified media block. Supersedes {@link ImageBlockNode}.
 */
export interface MediaBlockNode extends BaseNode {
  type: 'media';
  kind: BlocksMediaKind;
  media: Attribute.MediaValue<false>;
  children: [{ type: 'text'; text: '' }];
}

/**
 * Inline component instance. `data` is intentionally typed loosely: the
 * concrete shape is validated at runtime against the component schema referenced
 * by `componentUid`.
 */
export interface ComponentBlockNode extends BaseNode {
  type: 'component';
  componentUid: UID.Component;
  data: Record<string, unknown>;
  children: [{ type: 'text'; text: '' }];
}

/**
 * Ordered list of component instances of potentially different types.
 * Constrained at validation time by the body config's allowed components.
 */
export interface DynamicZoneBlockNode extends BaseNode {
  type: 'dynamic-zone';
  items: Array<{
    componentUid: UID.Component;
    data: Record<string, unknown>;
  }>;
  children: [{ type: 'text'; text: '' }];
}

/**
 * Polymorphic, one-way document reference. No inverse, no cascade, no ORM join:
 * the reference lives entirely inside the JSONB payload and is resolved by the
 * document-service populator at read time.
 */
export interface RelationBlockNode extends BaseNode {
  type: 'relation';
  target: UID.ContentType;
  documentId: string;
  locale?: string;
  display?: 'inline' | 'card';
  children: [{ type: 'text'; text: '' }];
}
