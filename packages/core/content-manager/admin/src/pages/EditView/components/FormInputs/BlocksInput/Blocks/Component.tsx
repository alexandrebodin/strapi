import * as React from 'react';

import {
  Box,
  Flex,
  Typography,
  Modal,
  Button,
  Field,
  SingleSelect,
  SingleSelectOption,
  IconButton,
} from '@strapi/design-system';
import { GridFour, Pencil } from '@strapi/icons';
import { useIntl } from 'react-intl';
import { type Element, Transforms, Editor } from 'slate';
import { ReactEditor, useFocused, type RenderElementProps, useSelected } from 'slate-react';
import { styled, css } from 'styled-components';

import { useGetInitialDataQuery } from '../../../../../../services/init';
import { useBlocksEditorContext, type BlocksStore } from '../BlocksEditor';
import { type Block } from '../utils/types';

import { ComponentDataForm } from './ComponentDataForm';

/* -------------------------------------------------------------------------------------------------
 * Renderer with edit affordance
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

const isComponent = (element: Element): element is Block<'component'> =>
  element.type === 'component';

/* -------------------------------------------------------------------------------------------------
 * Schema-aware edit dialog
 * -----------------------------------------------------------------------------------------------*/

const EditDialog = ({ element, onClose }: { element: Block<'component'>; onClose: () => void }) => {
  const { editor } = useBlocksEditorContext('Component.EditDialog');
  const { formatMessage } = useIntl();
  const { data } = useGetInitialDataQuery(undefined);
  const [draft, setDraft] = React.useState<Record<string, unknown>>(element.data ?? {});

  const component = data?.components?.find((c) => c.uid === element.componentUid);

  const save = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { data: draft } as any, { at: path });
    onClose();
  };

  return (
    <Modal.Root open onOpenChange={(next: boolean) => !next && onClose()}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage(
              {
                id: 'components.Blocks.component.edit.title',
                defaultMessage: 'Edit {uid}',
              },
              { uid: element.componentUid }
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {component ? (
            <ComponentDataForm
              componentUid={element.componentUid}
              value={draft}
              onChange={setDraft}
            />
          ) : (
            <Typography variant="pi" textColor="danger600">
              Unknown component: {element.componentUid}
            </Typography>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={onClose}>
            {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button onClick={save}>
            {formatMessage({ id: 'app.components.Button.save', defaultMessage: 'Save' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

const ComponentRenderer = ({ attributes, children, element }: RenderElementProps) => {
  const editorIsFocused = useFocused();
  const isSelected = useSelected();
  const [editing, setEditing] = React.useState(false);

  if (!isComponent(element)) return null;

  // Prefer a user-friendly summary when a common main-field-like key is set.
  const summary = ['name', 'title', 'label', 'displayName']
    .map((key) => element.data?.[key])
    .find((v) => typeof v === 'string') as string | undefined;

  return (
    <Box {...attributes}>
      {children}
      <Card
        contentEditable={false}
        background="neutral0"
        $isFocused={editorIsFocused && isSelected}
      >
        <Flex alignItems="center" gap={2} justifyContent="space-between">
          <Flex alignItems="center" gap={2}>
            <GridFour />
            <Typography variant="pi" textColor="neutral600">
              Component
            </Typography>
            <Typography variant="sigma" textColor="neutral800">
              {element.componentUid}
            </Typography>
            {summary && (
              <Typography variant="pi" textColor="neutral500">
                — {summary}
              </Typography>
            )}
          </Flex>
          <IconButton label="Edit component" onClick={() => setEditing(true)} variant="ghost">
            <Pencil />
          </IconButton>
        </Flex>
      </Card>
      {editing && <EditDialog element={element} onClose={() => setEditing(false)} />}
    </Box>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Insertion dialog — pick a component, then drop into the editor
 * -----------------------------------------------------------------------------------------------*/

/**
 * Insertion dialog — single step: pick a component, fill the form inline, insert.
 *
 * Changing the component selector resets the draft (can't reuse data across
 * schemas). Insert button is disabled until a component is picked.
 */
const ComponentDialog = () => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [selectedUid, setSelectedUid] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const { editor } = useBlocksEditorContext('ComponentDialog');
  const { formatMessage } = useIntl();
  const { data } = useGetInitialDataQuery(undefined);

  const components = data?.components ?? [];

  const byCategory = React.useMemo(() => {
    const groups: Record<string, typeof components> = {};
    for (const component of components) {
      const category = component.category ?? 'default';
      (groups[category] ||= []).push(component);
    }
    return groups;
  }, [components]);

  const selectedComponent = React.useMemo(
    () => components.find((c) => c.uid === selectedUid),
    [components, selectedUid]
  );

  const handleSelect = (uid: string) => {
    setSelectedUid(uid);
    setDraft({});
  };

  const handleInsert = () => {
    if (!selectedUid) return;

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

    const node: Block<'component'> = {
      type: 'component',
      componentUid: selectedUid as Block<'component'>['componentUid'],
      data: draft,
      children: [{ type: 'text', text: '' }],
    };

    Transforms.insertNodes(editor, node, { at: pathToInsert });
    Transforms.select(editor, pathToInsert);
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <Modal.Root open={isOpen} onOpenChange={(next: boolean) => setIsOpen(next)}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: 'components.Blocks.component.dialog.title',
              defaultMessage: 'Insert a component',
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            <Field.Root name="component">
              <Field.Label>
                {formatMessage({
                  id: 'components.Blocks.component.dialog.component',
                  defaultMessage: 'Component',
                })}
              </Field.Label>
              <SingleSelect
                value={selectedUid ?? ''}
                onChange={(value) => handleSelect(value as string)}
              >
                {Object.entries(byCategory).map(([category, entries]) =>
                  entries.map((component) => (
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
          <Modal.Close>
            <Button variant="tertiary">
              {formatMessage({ id: 'app.components.Button.cancel', defaultMessage: 'Cancel' })}
            </Button>
          </Modal.Close>
          <Button onClick={handleInsert} disabled={!selectedUid}>
            {formatMessage({
              id: 'components.Blocks.component.dialog.insert',
              defaultMessage: 'Insert',
            })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

const withComponent = (editor: Editor) => {
  const { isVoid } = editor;
  editor.isVoid = (element) => (element.type === 'component' ? true : isVoid(element));
  return editor;
};

const componentBlocks: Pick<BlocksStore, 'component'> = {
  component: {
    renderElement: (props) => <ComponentRenderer {...props} />,
    icon: GridFour,
    label: {
      id: 'components.Blocks.blocks.component',
      defaultMessage: 'Component',
    },
    matchNode: (node) => node.type === 'component',
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
    handleConvert: () => () => <ComponentDialog />,
    plugin: withComponent,
  },
};

export { componentBlocks };
