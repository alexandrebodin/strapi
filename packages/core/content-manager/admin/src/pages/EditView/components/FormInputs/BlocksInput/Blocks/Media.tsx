import * as React from 'react';

import { useStrapiApp } from '@strapi/admin/strapi-admin';
import { Box, Flex, FlexComponent, Typography } from '@strapi/design-system';
import { Images as MediaIcon } from '@strapi/icons';
import { type Element, Transforms, Editor } from 'slate';
import { useFocused, type RenderElementProps, useSelected } from 'slate-react';
import { styled, css } from 'styled-components';

import { prefixFileUrlWithBackendUrl } from '../../../../../../utils/urls';
import { useBlocksEditorContext, type BlocksStore } from '../BlocksEditor';
import { type Block } from '../utils/types';

import type { Schema } from '@strapi/types';

/* -------------------------------------------------------------------------------------------------
 * Renderer
 * -----------------------------------------------------------------------------------------------*/

const MediaWrapper = styled<FlexComponent>(Flex)<{ $isFocused?: boolean }>`
  transition-property: box-shadow;
  transition-duration: 0.2s;
  ${(props) =>
    props.$isFocused &&
    css`
      box-shadow: ${props.theme.colors.primary600} 0px 0px 0px 3px;
    `}

  & > img,
  & > video {
    height: auto;
    max-height: calc(512px - 56px);
    max-width: 100%;
    object-fit: contain;
  }
`;

const isMedia = (element: Element): element is Block<'media'> => element.type === 'media';

const MediaRenderer = ({ attributes, children, element }: RenderElementProps) => {
  const editorIsFocused = useFocused();
  const isSelected = useSelected();

  if (!isMedia(element)) return null;

  const { kind, media } = element;
  const url = media?.url ? prefixFileUrlWithBackendUrl(media.url) : undefined;
  const alt = (media as { alternativeText?: string })?.alternativeText ?? media?.name ?? '';

  return (
    <Box {...attributes}>
      {children}
      <MediaWrapper
        background="neutral100"
        contentEditable={false}
        justifyContent="center"
        $isFocused={editorIsFocused && isSelected}
        hasRadius
        padding={kind === 'image' ? 0 : 4}
        gap={2}
      >
        {kind === 'image' && url ? (
          <img src={url} alt={alt} />
        ) : kind === 'video' && url ? (
          <video src={url} controls />
        ) : kind === 'audio' && url ? (
          <audio src={url} controls />
        ) : (
          <Flex direction="column" alignItems="center" gap={1}>
            <Typography variant="sigma" textColor="neutral600">
              {kind?.toUpperCase() ?? 'FILE'}
            </Typography>
            <Typography>{media?.name ?? 'Untitled'}</Typography>
          </Flex>
        )}
      </MediaWrapper>
    </Box>
  );
};

/* -------------------------------------------------------------------------------------------------
 * Insertion dialog — reuses the Media Library with allowedTypes widened
 * -----------------------------------------------------------------------------------------------*/

const MEDIA_FIELDS = [
  'id',
  'name',
  'alternativeText',
  'url',
  'caption',
  'width',
  'height',
  'formats',
  'hash',
  'ext',
  'mime',
  'size',
  'previewUrl',
  'provider',
  'provider_metadata',
  'createdAt',
  'updatedAt',
];

const pick = <T extends object, K extends keyof T>(object: T, keys: K[]): Pick<T, K> => {
  const entries = keys.map((key) => [key, object[key]]);
  return Object.fromEntries(entries);
};

const mimeToKind = (mime: string | undefined): Block<'media'>['kind'] => {
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const MediaDialog = () => {
  const [isOpen, setIsOpen] = React.useState(true);
  const { editor } = useBlocksEditorContext('MediaDialog');
  const components = useStrapiApp('MediaDialog', (state) => state.components);

  if (!components || !isOpen) return null;

  const MediaLibraryDialog = components['media-library'] as React.ComponentType<{
    allowedTypes: Schema.Attribute.MediaKind[];
    onClose: () => void;
    onSelectAssets: (assets: Schema.Attribute.MediaValue<true>) => void;
  }>;

  const insertMedia = (assets: Array<Block<'media'>['media'] & { mime?: string }>) => {
    // If the selection is inside a list, split the list so the new block lives outside it.
    Transforms.unwrapNodes(editor, {
      match: (node) => !Editor.isEditor(node) && node.type === 'list',
      split: true,
    });

    // Find the closest block-level node above the current selection to replace.
    const nodeEntryBeingReplaced = Editor.above(editor, {
      match(node) {
        if (Editor.isEditor(node)) return false;
        const isInlineNode = ['text', 'link'].includes(node.type);
        return !isInlineNode;
      },
    });

    if (!nodeEntryBeingReplaced) return;
    const [, pathToInsert] = nodeEntryBeingReplaced;

    Transforms.removeNodes(editor);

    const nodesToInsert: Block<'media'>[] = assets.map((asset) => ({
      type: 'media',
      kind: mimeToKind(asset.mime),
      media: asset,
      children: [{ type: 'text', text: '' }],
    }));

    Transforms.insertNodes(editor, nodesToInsert, { at: pathToInsert });
    Transforms.select(editor, pathToInsert);
  };

  const handleSelectAssets = (assets: Schema.Attribute.MediaValue<true>) => {
    const formatted = assets.map((asset) => {
      const expected = pick(asset, MEDIA_FIELDS as Array<keyof typeof asset>);
      return {
        ...expected,
        alternativeText: (expected as any).alternativeText || (expected as any).name,
        url: prefixFileUrlWithBackendUrl((expected as any).url),
      } as Block<'media'>['media'] & { mime?: string };
    });
    insertMedia(formatted);
    setIsOpen(false);
  };

  return (
    <MediaLibraryDialog
      // Accept everything — the per-asset mime determines `kind`.
      allowedTypes={['images', 'videos', 'audios', 'files']}
      onClose={() => setIsOpen(false)}
      onSelectAssets={handleSelectAssets}
    />
  );
};

const withMedia = (editor: Editor) => {
  const { isVoid } = editor;
  editor.isVoid = (element) => (element.type === 'media' ? true : isVoid(element));
  return editor;
};

const mediaBlocks: Pick<BlocksStore, 'media'> = {
  media: {
    renderElement: (props) => <MediaRenderer {...props} />,
    icon: MediaIcon,
    label: {
      id: 'components.Blocks.blocks.media',
      defaultMessage: 'Media',
    },
    matchNode: (node) => node.type === 'media',
    isInBlocksSelector: true,
    handleBackspaceKey(editor) {
      if (editor.children.length === 1) {
        Transforms.setNodes(editor, {
          type: 'paragraph',
          // @ts-expect-error blanking out media so Slate deletes it
          media: null,
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
    handleConvert: () => {
      // Logic lives in the dialog; nothing is mutated until the user picks.
      return () => <MediaDialog />;
    },
    plugin: withMedia,
  },
};

export { mediaBlocks };
