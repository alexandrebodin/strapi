import * as React from 'react';

import { Box, Flex, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { Editor, Range, Transforms } from 'slate';
import { ReactEditor, useSlate } from 'slate-react';
import { styled } from 'styled-components';

import { insertLink } from './Blocks/Link';
import {
  useBlocksEditorContext,
  type BlocksStore,
  type SelectorBlockKey,
  isSelectorBlockKey,
} from './BlocksEditor';
import { getEntries } from './utils/types';

/**
 * Slash menu.
 *
 * Triggered by typing `/` at the start of an empty paragraph. Lists every
 * block type in the selector, filterable by typing after the `/`. Arrow keys
 * navigate; Enter inserts; Escape / blur closes. Selecting a block invokes the
 * same `handleConvert` path used by the toolbar dropdown — so insertion
 * dialogs (media, component, relation) open just like they would via the
 * dropdown.
 *
 * Positioned absolutely relative to the DOM rect of the current Slate
 * selection; recalculated on every keystroke while open.
 */

interface MenuState {
  open: boolean;
  position: { top: number; left: number } | null;
  query: string;
  highlightIndex: number;
}

interface SlashMenuProps {
  /**
   * Called when a block is chosen. The caller renders any conversion modal
   * via its own `useConversionModal` instance.
   */
  onConversionResult: (modal: void | (() => React.JSX.Element) | undefined) => void;
}

const MenuBox = styled(Box)`
  position: fixed;
  z-index: 20;
  min-width: 220px;
  max-height: 260px;
  overflow-y: auto;
  box-shadow: ${({ theme }) => theme.shadows.filterShadow};
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const MenuItem = styled(Flex)<{ $highlighted?: boolean }>`
  padding: ${({ theme }) => `${theme.spaces[2]} ${theme.spaces[3]}`};
  cursor: pointer;
  background: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.primary100 : 'transparent'};
  color: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.primary700 : theme.colors.neutral800};

  &:hover {
    background: ${({ theme }) => theme.colors.primary100};
  }
`;

/**
 * A slash-menu item is either:
 *   - `{ kind: 'block' }` — a block-type convert, routed through
 *     `blocks[key].handleConvert(editor)`. Covers every `isInBlocksSelector`
 *     entry (paragraph, headings, lists, quote, code, media, component,
 *     dynamic-zone, relation…).
 *   - `{ kind: 'action' }` — an ad-hoc command that owns its own insertion
 *     logic. Used for inline primitives like Link that aren't full block
 *     conversions and therefore aren't in the `blocks` store selector.
 */
type BlockItem = { kind: 'block'; key: SelectorBlockKey; label: string; searchKey: string };
type ActionItem = {
  kind: 'action';
  key: string;
  label: string;
  searchKey: string;
  run: (editor: Editor) => void | (() => React.JSX.Element);
};
type VisibleItem = BlockItem | ActionItem;

const collectVisibleItems = (blocks: BlocksStore, formatMessage: any): VisibleItem[] => {
  const blockItems: BlockItem[] = getEntries(blocks)
    .filter(([, block]) => block.isInBlocksSelector)
    .map(([key, block]) => {
      const label = (block as { label?: { id: string; defaultMessage: string } }).label;
      const rendered = label ? formatMessage(label) : String(key);
      return {
        kind: 'block',
        key: key as SelectorBlockKey,
        label: rendered,
        searchKey: `${key} ${rendered}`.toLowerCase(),
      };
    });

  const actionItems: ActionItem[] = [
    {
      kind: 'action',
      key: 'link',
      label: formatMessage({
        id: 'components.Blocks.link',
        defaultMessage: 'Link',
      }),
      searchKey: 'link url anchor href',
      run: (editor) => {
        // Mirrors the toolbar LinkButton's addLink — insert an empty anchor so
        // the inline link popover can take over and prompt for the URL.
        (editor as any).shouldSaveLinkPath = true;
        insertLink(editor, { url: '' });
      },
    },
  ];

  return [...blockItems, ...actionItems];
};

const SlashMenu = ({ onConversionResult }: SlashMenuProps) => {
  const editor = useSlate();
  const { blocks } = useBlocksEditorContext('SlashMenu');
  const { formatMessage } = useIntl();

  const [state, setState] = React.useState<MenuState>({
    open: false,
    position: null,
    query: '',
    highlightIndex: 0,
  });

  const close = React.useCallback(
    () => setState({ open: false, position: null, query: '', highlightIndex: 0 }),
    []
  );

  const visibleItems = React.useMemo(() => {
    const all = collectVisibleItems(blocks, formatMessage);
    const q = state.query.toLowerCase();
    if (!q) return all;
    return all.filter((item) => item.searchKey.includes(q));
  }, [blocks, formatMessage, state.query]);

  // Keep the highlight index within bounds when the filter result shrinks.
  React.useEffect(() => {
    if (state.highlightIndex >= visibleItems.length) {
      setState((s) => ({ ...s, highlightIndex: Math.max(0, visibleItems.length - 1) }));
    }
  }, [visibleItems.length, state.highlightIndex]);

  const recalcPosition = React.useCallback((): { top: number; left: number } | null => {
    if (!editor.selection) return null;
    try {
      const domRange = ReactEditor.toDOMRange(editor, editor.selection);
      const rect = domRange.getBoundingClientRect();
      return { top: rect.bottom + 4, left: rect.left };
    } catch {
      return null;
    }
  }, [editor]);

  // Open on "/" pressed at the start of an empty paragraph (so it doesn't
  // interfere with typing slashes mid-sentence).
  React.useEffect(() => {
    const listener = (event: Event) => {
      const ke = event as unknown as KeyboardEvent;
      if (ke.key !== '/') return;

      if (!editor.selection || !Range.isCollapsed(editor.selection)) return;
      const [block] = Editor.nodes(editor, {
        match: (n) => !Editor.isEditor(n) && (n as any).type === 'paragraph',
      });
      if (!block) return;
      const [node] = block;
      if (!Editor.isEmpty(editor, node as any)) return;

      ke.preventDefault();
      const position = recalcPosition();
      setState({ open: true, position, query: '', highlightIndex: 0 });
    };

    const el = ReactEditor.toDOMNode(editor, editor);
    el.addEventListener('keydown', listener, true);
    return () => el.removeEventListener('keydown', listener, true);
  }, [editor, recalcPosition]);

  // While the menu is open, intercept every key at the document level so
  // Slate never sees the event — otherwise the typed query leaks into the
  // editor as text and Enter can still commit a paragraph break alongside the
  // chosen action.
  React.useEffect(() => {
    if (!state.open) return;

    const swallow = (ke: KeyboardEvent) => {
      ke.preventDefault();
      ke.stopPropagation();
      // Stop any further listeners on this same target/phase (React's
      // synthetic delegate, Slate's own handlers, etc.).
      ke.stopImmediatePropagation();
    };

    const onKeyDown = (ke: KeyboardEvent) => {
      if (ke.key === 'Escape') {
        swallow(ke);
        close();
        return;
      }
      if (ke.key === 'ArrowDown') {
        swallow(ke);
        setState((s) => ({
          ...s,
          highlightIndex: Math.min(visibleItems.length - 1, s.highlightIndex + 1),
        }));
        return;
      }
      if (ke.key === 'ArrowUp') {
        swallow(ke);
        setState((s) => ({ ...s, highlightIndex: Math.max(0, s.highlightIndex - 1) }));
        return;
      }
      if (ke.key === 'Enter') {
        swallow(ke);
        const chosen = visibleItems[state.highlightIndex];
        if (chosen) pick(chosen);
        return;
      }
      if (ke.key === 'Backspace') {
        swallow(ke);
        if (state.query.length === 0) {
          close();
          return;
        }
        setState((s) => ({ ...s, query: s.query.slice(0, -1), highlightIndex: 0 }));
        return;
      }
      if (ke.key === 'Tab') {
        swallow(ke);
        return;
      }
      // Printable characters: route to the query filter instead of the editor.
      if (ke.key.length === 1 && !ke.metaKey && !ke.ctrlKey && !ke.altKey) {
        swallow(ke);
        setState((s) => ({ ...s, query: s.query + ke.key, highlightIndex: 0 }));
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });

  const pick = (item: VisibleItem) => {
    let maybeModal: void | (() => React.JSX.Element) | undefined;

    if (item.kind === 'block') {
      if (!isSelectorBlockKey(item.key)) return;
      maybeModal = blocks[item.key].handleConvert?.(editor);
    } else {
      maybeModal = item.run(editor);
    }

    onConversionResult(maybeModal);
    close();
    try {
      ReactEditor.focus(editor);
    } catch {
      /* no-op if DOM detached */
    }
  };

  if (!state.open || !state.position) return null;

  return (
    <MenuBox style={{ top: state.position.top, left: state.position.left }}>
      {visibleItems.length === 0 ? (
        <MenuItem>
          <Typography variant="pi" textColor="neutral500">
            No matching block
          </Typography>
        </MenuItem>
      ) : (
        visibleItems.map((item, index) => (
          <MenuItem
            key={item.key}
            $highlighted={index === state.highlightIndex}
            onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
              // Prevent Slate from losing selection when we click.
              event.preventDefault();
              pick(item);
            }}
          >
            <Typography>{item.label}</Typography>
          </MenuItem>
        ))
      )}
    </MenuBox>
  );
};

export { SlashMenu };
