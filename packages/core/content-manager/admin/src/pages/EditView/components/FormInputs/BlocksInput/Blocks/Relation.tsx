import * as React from 'react';

import {
  Box,
  Button,
  Field,
  Flex,
  IconButton,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from '@strapi/design-system';
import { Cross, Link as LinkIcon, Pencil } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { type Element, Transforms, Editor } from 'slate';
import { ReactEditor, useFocused, type RenderElementProps, useSelected } from 'slate-react';
import { styled, css } from 'styled-components';

import { useContentTypeSchema } from '../../../../../../hooks/useContentTypeSchema';
import { useBlocksEditorContext, type BlocksStore } from '../BlocksEditor';
import { type Block } from '../utils/types';

import { DocumentListPicker, type PickedDoc, type SelectionMode } from './DocumentListPicker';

import type { ContentType } from '../../../../../../../../shared/contracts/content-types';

/* -------------------------------------------------------------------------------------------------
 * Renderer
 * -----------------------------------------------------------------------------------------------*/

const Card = styled(Box)<{ $isFocused?: boolean; $missing?: boolean }>`
  border: 1px solid
    ${({ theme, $missing }) => ($missing ? theme.colors.danger200 : theme.colors.neutral200)};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spaces[3]};
  transition-property: box-shadow;
  transition-duration: 0.2s;
  ${(props) =>
    props.$isFocused &&
    css`
      box-shadow: ${props.theme.colors.primary600} 0px 0px 0px 3px;
    `}
`;

const isRelation = (element: Element): element is Block<'relation'> => element.type === 'relation';

const RelationRenderer = ({ attributes, children, element }: RenderElementProps) => {
  const editorIsFocused = useFocused();
  const isSelected = useSelected();
  const [editing, setEditing] = React.useState(false);

  if (!isRelation(element)) return null;

  const { target, documentId, locale } = element;
  const resolved = (element as unknown as { resolved?: { missing?: boolean } }).resolved;
  const isMissing = resolved?.missing === true;

  return (
    <Box {...attributes}>
      {children}
      <Card
        contentEditable={false}
        background="neutral0"
        $isFocused={editorIsFocused && isSelected}
        $missing={isMissing}
      >
        <Flex alignItems="center" gap={2} justifyContent="space-between">
          <Flex alignItems="center" gap={2}>
            <LinkIcon />
            <Typography variant="pi" textColor={isMissing ? 'danger600' : 'neutral600'}>
              {isMissing ? 'Missing relation' : 'Relation'}
            </Typography>
            <Typography variant="sigma" textColor="neutral800">
              {target}#{documentId}
              {locale ? `@${locale}` : ''}
            </Typography>
          </Flex>
          <IconButton label="Edit relation" onClick={() => setEditing(true)} variant="ghost">
            <Pencil />
          </IconButton>
        </Flex>
      </Card>
      {editing && <EditRelationDialog element={element} onClose={() => setEditing(false)} />}
    </Box>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Insertion dialog
 *
 * Uses the shared DocumentListPicker (list view with sort, search, pagination)
 * so authors pick relations with the same primitives they use when browsing
 * collections in the Content Manager.
 * -----------------------------------------------------------------------------------------------*/

/**
 * Mirrors the CM sidebar + regular relation field filter:
 *   - `kind === 'collectionType'`
 *   - `isDisplayed === true` (pluginOptions['content-manager'].visible)
 */
const isUsableTarget = (ct: ContentType): boolean =>
  ct.kind === 'collectionType' && ct.isDisplayed === true;

const Pill = styled(Flex)`
  padding: ${({ theme }) => `${theme.spaces[1]} ${theme.spaces[2]}`};
  background: ${({ theme }) => theme.colors.primary100};
  color: ${({ theme }) => theme.colors.primary700};
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: ${({ theme }) => theme.fontSizes[1]};
`;

const SelectedPill = ({ display, onRemove }: { display: string; onRemove: () => void }) => (
  <Pill alignItems="center" gap={1}>
    <Typography variant="pi" textColor="primary700">
      {display}
    </Typography>
    <IconButton label={`Remove ${display}`} variant="ghost" onClick={onRemove} size="S">
      <Cross />
    </IconButton>
  </Pill>
);

const RelationDialog = () => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [selectedTarget, setSelectedTarget] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<SelectionMode>('single');
  const [selected, setSelected] = React.useState<Record<string, PickedDoc>>({});

  const { editor } = useBlocksEditorContext('RelationDialog');
  const { formatMessage } = useIntl();
  const { schemas } = useContentTypeSchema();

  const allowedTargets = React.useMemo<ContentType[]>(
    () => (schemas ?? []).filter(isUsableTarget),
    [schemas]
  );

  // Auto-pick when there's only one allowed target.
  React.useEffect(() => {
    if (!selectedTarget && allowedTargets.length === 1) {
      setSelectedTarget(allowedTargets[0].uid);
    }
  }, [selectedTarget, allowedTargets]);

  const handleTargetChange = (uid: string) => {
    setSelectedTarget(uid);
    setSelected({});
  };

  const handleModeChange = (next: SelectionMode) => {
    setMode(next);
    if (next === 'single') {
      const ids = Object.keys(selected);
      if (ids.length > 1) setSelected({ [ids[0]]: selected[ids[0]] });
    }
  };

  const handleInsert = () => {
    const entries = Object.values(selected);
    if (!selectedTarget || entries.length === 0) return;

    Transforms.unwrapNodes(editor, {
      match: (node) => !Editor.isEditor(node) && node.type === 'list',
      split: true,
    });

    const nodeEntryBeingReplaced = Editor.above(editor, {
      match: (node) => {
        if (Editor.isEditor(node)) return false;
        return !['text', 'link'].includes(node.type);
      },
    });

    if (!nodeEntryBeingReplaced) return;
    const [, pathToInsert] = nodeEntryBeingReplaced;

    Transforms.removeNodes(editor);

    const nodes: Block<'relation'>[] = entries.map((entry) => ({
      type: 'relation',
      target: selectedTarget as Block<'relation'>['target'],
      documentId: entry.documentId,
      ...(entry.locale ? { locale: entry.locale } : {}),
      children: [{ type: 'text', text: '' }],
    }));

    Transforms.insertNodes(editor, nodes, { at: pathToInsert });
    Transforms.select(editor, pathToInsert);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const selectedCount = Object.keys(selected).length;

  return (
    <Modal.Root open={isOpen} onOpenChange={(next: boolean) => setIsOpen(next)}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: 'components.Blocks.relation.dialog.title',
              defaultMessage: 'Insert a relation',
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Flex gap={4} alignItems="flex-end">
              <Field.Root name="target" style={{ flex: 2 }}>
                <Field.Label>
                  {formatMessage({
                    id: 'components.Blocks.relation.dialog.target',
                    defaultMessage: 'Content type',
                  })}
                </Field.Label>
                <SingleSelect
                  value={selectedTarget ?? ''}
                  onChange={(value) => handleTargetChange(value as string)}
                >
                  {allowedTargets.map((ct: ContentType) => (
                    <SingleSelectOption key={ct.uid} value={ct.uid}>
                      {ct.info.displayName}
                    </SingleSelectOption>
                  ))}
                </SingleSelect>
              </Field.Root>

              <Field.Root name="mode" style={{ flex: 1 }}>
                <Field.Label>
                  {formatMessage({
                    id: 'components.Blocks.relation.dialog.mode',
                    defaultMessage: 'Selection',
                  })}
                </Field.Label>
                <Flex gap={2}>
                  <Button
                    variant={mode === 'single' ? 'default' : 'tertiary'}
                    onClick={() => handleModeChange('single')}
                    size="S"
                  >
                    Single
                  </Button>
                  <Button
                    variant={mode === 'multiple' ? 'default' : 'tertiary'}
                    onClick={() => handleModeChange('multiple')}
                    size="S"
                  >
                    Multiple
                  </Button>
                </Flex>
              </Field.Root>
            </Flex>

            {selectedTarget && (
              <DocumentListPicker
                model={selectedTarget}
                selected={selected}
                onSelectionChange={setSelected}
                mode={mode}
                status="draft"
              />
            )}

            {selectedCount > 0 && (
              <Flex gap={2} wrap="wrap">
                {Object.values(selected).map((entry) => (
                  <SelectedPill
                    key={entry.documentId}
                    display={entry.display}
                    onRemove={() => {
                      const next = { ...selected };
                      delete next[entry.documentId];
                      setSelected(next);
                    }}
                  />
                ))}
              </Flex>
            )}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">
              {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
            </Button>
          </Modal.Close>
          <Button onClick={handleInsert} disabled={selectedCount === 0}>
            {selectedCount > 1
              ? formatMessage(
                  {
                    id: 'components.Blocks.relation.dialog.insertMany',
                    defaultMessage: 'Insert {count} relations',
                  },
                  { count: selectedCount }
                )
              : formatMessage({
                  id: 'components.Blocks.relation.dialog.insert',
                  defaultMessage: 'Insert',
                })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Edit dialog for an already-inserted relation node
 *
 * Lets the author change target content type, pick a different document, or
 * drop the locale — all via the same list-view picker used on insertion.
 * -----------------------------------------------------------------------------------------------*/

const EditRelationDialog = ({
  element,
  onClose,
}: {
  element: Block<'relation'>;
  onClose: () => void;
}) => {
  const { editor } = useBlocksEditorContext('Relation.EditDialog');
  const { formatMessage } = useIntl();
  const { schemas } = useContentTypeSchema();

  const allowedTargets = React.useMemo<ContentType[]>(
    () => (schemas ?? []).filter(isUsableTarget),
    [schemas]
  );

  const [target, setTarget] = React.useState<string>(element.target);
  // Pre-seed the selection with the current ref so the UI shows something
  // useful before the user browses the list and re-picks (or picks a new one).
  const initialDisplay = element.documentId;
  const [selected, setSelected] = React.useState<Record<string, PickedDoc>>({
    [element.documentId]: {
      documentId: element.documentId,
      locale: element.locale,
      display: initialDisplay,
    },
  });

  const handleTargetChange = (uid: string) => {
    setTarget(uid);
    // Switching the target type invalidates the current selection.
    setSelected({});
  };

  const save = () => {
    const entries = Object.values(selected);
    if (!target || entries.length === 0) return;
    const entry = entries[0];

    const path = ReactEditor.findPath(editor, element);
    const next: Partial<Block<'relation'>> = {
      target: target as Block<'relation'>['target'],
      documentId: entry.documentId,
      locale: entry.locale,
    };
    // `locale: undefined` via setNodes would leave the key; unset via setNodes
    // isn't trivial, so fall back to a remove+re-insert only if we need to.
    if (!entry.locale && element.locale) {
      // Clear the locale field to avoid leaving a stale entry.
      Transforms.setNodes(
        editor,
        { target: next.target, documentId: next.documentId, locale: undefined } as any,
        { at: path }
      );
    } else {
      Transforms.setNodes(editor, next as any, { at: path });
    }

    onClose();
  };

  const canSave = Object.keys(selected).length > 0;

  return (
    <Modal.Root open onOpenChange={(n: boolean) => !n && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: 'components.Blocks.relation.edit.title',
              defaultMessage: 'Edit relation',
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root name="target">
              <Field.Label>
                {formatMessage({
                  id: 'components.Blocks.relation.dialog.target',
                  defaultMessage: 'Content type',
                })}
              </Field.Label>
              <SingleSelect
                value={target}
                onChange={(value) => handleTargetChange(value as string)}
              >
                {allowedTargets.map((ct: ContentType) => (
                  <SingleSelectOption key={ct.uid} value={ct.uid}>
                    {ct.info.displayName}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>

            {target && (
              <DocumentListPicker
                model={target}
                selected={selected}
                onSelectionChange={setSelected}
                mode="single"
                status="draft"
              />
            )}

            {canSave && (
              <Flex gap={2} wrap="wrap">
                {Object.values(selected).map((entry) => (
                  <SelectedPill
                    key={entry.documentId}
                    display={entry.display}
                    onRemove={() => {
                      const next = { ...selected };
                      delete next[entry.documentId];
                      setSelected(next);
                    }}
                  />
                ))}
              </Flex>
            )}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {formatMessage({ id: 'app.components.Button.save', defaultMessage: 'Save' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

const withRelation = (editor: Editor) => {
  const { isVoid } = editor;
  editor.isVoid = (element) => (element.type === 'relation' ? true : isVoid(element));
  return editor;
};

const relationBlocks: Pick<BlocksStore, 'relation'> = {
  relation: {
    renderElement: (props) => <RelationRenderer {...props} />,
    icon: LinkIcon,
    label: {
      id: 'components.Blocks.blocks.relation',
      defaultMessage: 'Relation',
    },
    matchNode: (node) => node.type === 'relation',
    isInBlocksSelector: true,
    handleBackspaceKey(editor) {
      if (editor.children.length === 1) {
        Transforms.setNodes(editor, {
          type: 'paragraph',
          children: [{ type: 'text', text: '' }],
        });
      } else {
        Transforms.removeNodes(editor);
      }
    },
    handleEnterKey(editor) {
      Transforms.insertNodes(editor, {
        type: 'paragraph',
        children: [{ type: 'text', text: '' }],
      });
    },
    handleConvert: () => () => <RelationDialog />,
    plugin: withRelation,
  },
};

export { relationBlocks };
