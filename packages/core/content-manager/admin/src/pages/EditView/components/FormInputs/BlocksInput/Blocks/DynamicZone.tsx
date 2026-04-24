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
import { Layout, Pencil, Plus, Trash } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { type Element, Transforms, Editor } from 'slate';
import { ReactEditor, useFocused, type RenderElementProps, useSelected } from 'slate-react';
import { styled, css } from 'styled-components';

import { useGetInitialDataQuery } from '../../../../../../services/init';
import { useBlocksEditorContext, type BlocksStore } from '../BlocksEditor';
import { type Block } from '../utils/types';

import { ComponentDataForm } from './ComponentDataForm';

/* -------------------------------------------------------------------------------------------------
 * Dynamic-zone renderer with add / edit / remove per item
 * -----------------------------------------------------------------------------------------------*/

const Card = styled(Box)<{ $isFocused?: boolean }>`
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
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

const ItemRow = styled(Flex)`
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spaces[2]};
  background: ${({ theme }) => theme.colors.neutral0};
`;

const isDynamicZone = (element: Element): element is Block<'dynamic-zone'> =>
  element.type === 'dynamic-zone';

const summarise = (data: Record<string, unknown> | undefined): string | undefined => {
  const summary = ['name', 'title', 'label', 'displayName']
    .map((key) => data?.[key])
    .find((v) => typeof v === 'string') as string | undefined;
  return summary;
};

/* -------------------------------------------------------------------------------------------------
 * Pick-component dialog (reused for "add component to this DZ")
 * -----------------------------------------------------------------------------------------------*/

/**
 * Single-step picker: choose a component type and fill the form inline, then
 * commit. Switching component type resets the draft.
 */
const PickComponentDialog = ({
  onPick,
  onClose,
}: {
  onPick: (componentUid: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}) => {
  const { formatMessage } = useIntl();
  const { data } = useGetInitialDataQuery(undefined);
  const [selectedUid, setSelectedUid] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});

  const byCategory = React.useMemo(() => {
    const groups: Record<string, NonNullable<typeof data>['components']> = {};
    for (const component of data?.components ?? []) {
      const category = component.category ?? 'default';
      (groups[category] ||= []).push(component);
    }
    return groups;
  }, [data]);

  const selectedComponent = (data?.components ?? []).find((c) => c.uid === selectedUid);

  const handleSelect = (uid: string) => {
    setSelectedUid(uid);
    setDraft({});
  };

  return (
    <Modal.Root open onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: 'components.Blocks.dz.pick.title',
              defaultMessage: 'Add a component',
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root name="component">
              <Field.Label>
                {formatMessage({
                  id: 'components.Blocks.dz.pick.label',
                  defaultMessage: 'Component',
                })}
              </Field.Label>
              <SingleSelect
                value={selectedUid ?? ''}
                onChange={(value) => handleSelect(value as string)}
              >
                {Object.entries(byCategory).map(([category, entries]) =>
                  (entries ?? []).map((component) => (
                    <SingleSelectOption key={component.uid} value={component.uid}>
                      {`${category} / ${component.info.displayName}`}
                    </SingleSelectOption>
                  ))
                )}
              </SingleSelect>
            </Field.Root>

            {selectedComponent && selectedUid && (
              <Box
                paddingTop={4}
                borderColor="neutral150"
                style={{ borderTopWidth: 1, borderTopStyle: 'solid' }}
              >
                <ComponentDataForm componentUid={selectedUid} value={draft} onChange={setDraft} />
              </Box>
            )}
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button
            onClick={() => {
              if (selectedUid) {
                onPick(selectedUid, draft);
                onClose();
              }
            }}
            disabled={!selectedUid}
          >
            {formatMessage({ id: 'app.components.Button.add', defaultMessage: 'Add' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Edit-item dialog — schema-aware form for a single DZ item
 * -----------------------------------------------------------------------------------------------*/

const EditItemDialog = ({
  componentUid,
  initial,
  onSave,
  onClose,
}: {
  componentUid: string;
  initial: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => void;
  onClose: () => void;
}) => {
  const { formatMessage } = useIntl();
  const { data } = useGetInitialDataQuery(undefined);
  const [draft, setDraft] = React.useState<Record<string, unknown>>(initial ?? {});

  const component = data?.components?.find((c) => c.uid === componentUid);

  return (
    <Modal.Root open onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage(
              { id: 'components.Blocks.dz.edit.title', defaultMessage: 'Edit {uid}' },
              { uid: componentUid }
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {component ? (
            <ComponentDataForm componentUid={componentUid} value={draft} onChange={setDraft} />
          ) : (
            <Typography variant="pi" textColor="danger600">
              Unknown component: {componentUid}
            </Typography>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            {formatMessage({ id: 'app.components.Button.save', defaultMessage: 'Save' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Renderer
 * -----------------------------------------------------------------------------------------------*/

const DynamicZoneRenderer = (props: RenderElementProps) => {
  const editorIsFocused = useFocused();
  const isSelected = useSelected();
  const { editor } = useBlocksEditorContext('DynamicZoneRenderer');
  const { element, attributes, children } = props;

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  if (!isDynamicZone(element)) return null;

  const setItems = (next: Block<'dynamic-zone'>['items']) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { items: next } as any, { at: path });
  };

  const addItem = (componentUid: string, data: Record<string, unknown>) => {
    setItems([
      ...(element.items ?? []),
      {
        componentUid: componentUid as Block<'dynamic-zone'>['items'][number]['componentUid'],
        data,
      },
    ]);
  };

  const updateItem = (index: number, data: Record<string, unknown>) => {
    const next = (element.items ?? []).map((item, i) => (i === index ? { ...item, data } : item));
    setItems(next);
  };

  const removeItem = (index: number) => {
    const next = (element.items ?? []).filter((_, i) => i !== index);
    setItems(next);
  };

  return (
    <Box {...attributes}>
      {children}
      <Card
        contentEditable={false}
        background="neutral0"
        $isFocused={editorIsFocused && isSelected}
      >
        <Flex direction="column" gap={3} alignItems="stretch">
          <Flex alignItems="center" gap={2} justifyContent="space-between">
            <Flex alignItems="center" gap={2}>
              <Layout />
              <Typography variant="pi" textColor="neutral600">
                Dynamic zone
              </Typography>
              <Typography variant="pi" textColor="neutral500">
                ({element.items?.length ?? 0})
              </Typography>
            </Flex>
            <IconButton
              label="Add component"
              onClick={() => setPickerOpen(true)}
              variant="tertiary"
            >
              <Plus />
            </IconButton>
          </Flex>
          {element.items?.length ? (
            <Flex direction="column" gap={2} alignItems="stretch">
              {element.items.map((item, index) => {
                const summary = summarise(item.data);
                return (
                  <ItemRow
                    key={`${item.componentUid}-${index}`}
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Flex direction="column" alignItems="flex-start" gap={0}>
                      <Typography variant="sigma" textColor="neutral700">
                        {item.componentUid}
                      </Typography>
                      {summary && (
                        <Typography variant="pi" textColor="neutral500">
                          {summary}
                        </Typography>
                      )}
                    </Flex>
                    <Flex gap={1}>
                      <IconButton
                        label={`Edit ${item.componentUid}`}
                        onClick={() => setEditingIndex(index)}
                        variant="ghost"
                      >
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label={`Remove ${item.componentUid}`}
                        onClick={() => removeItem(index)}
                        variant="ghost"
                      >
                        <Trash />
                      </IconButton>
                    </Flex>
                  </ItemRow>
                );
              })}
            </Flex>
          ) : (
            <Typography variant="pi" textColor="neutral500">
              (empty — click + to add a component)
            </Typography>
          )}
        </Flex>
      </Card>
      {pickerOpen && <PickComponentDialog onPick={addItem} onClose={() => setPickerOpen(false)} />}
      {editingIndex !== null && element.items?.[editingIndex] && (
        <EditItemDialog
          componentUid={element.items[editingIndex].componentUid}
          initial={element.items[editingIndex].data}
          onSave={(data) => updateItem(editingIndex, data)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </Box>
  );
};

const withDynamicZone = (editor: Editor) => {
  const { isVoid } = editor;
  editor.isVoid = (element) => (element.type === 'dynamic-zone' ? true : isVoid(element));
  return editor;
};

const insertDynamicZone = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: (node) => !Editor.isEditor(node) && node.type === 'list',
    split: true,
  });

  const node: Block<'dynamic-zone'> = {
    type: 'dynamic-zone',
    items: [],
    children: [{ type: 'text', text: '' }],
  };

  Transforms.setNodes(editor, node as Partial<Block<'dynamic-zone'>>);
};

const dynamicZoneBlocks: Pick<BlocksStore, 'dynamic-zone'> = {
  'dynamic-zone': {
    renderElement: (props) => <DynamicZoneRenderer {...props} />,
    icon: Layout,
    label: {
      id: 'components.Blocks.blocks.dynamicZone',
      defaultMessage: 'Dynamic zone',
    },
    matchNode: (node) => node.type === 'dynamic-zone',
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
    handleConvert: (editor) => {
      insertDynamicZone(editor);
    },
    plugin: withDynamicZone,
  },
};

export { dynamicZoneBlocks };
