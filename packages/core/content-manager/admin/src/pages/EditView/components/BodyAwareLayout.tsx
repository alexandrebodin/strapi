import * as React from 'react';

import { Box, Flex, Grid } from '@strapi/design-system';
import { styled } from 'styled-components';

import { FormLayout, type FormLayoutProps } from './FormLayout';

import type { EditLayout } from '../../../hooks/useDocumentLayout';

/**
 * Body-aware edit layout.
 *
 * When the content type carries the auto-injected `body` attribute, render it
 * full-width as the main composition surface, with the rest of the data fields
 * stacked below (or in a right-side column on desktop). When no body attribute
 * exists, degrades transparently to the regular `FormLayout`.
 *
 * Data is not split into a separate tab here — the current layout already uses
 * tabs for draft/published status, so nesting another tab level would harm UX.
 * Stacking preserves affordances and remains permission-friendly: if a user
 * can't read `body`, we simply hide the body panel.
 */

const BodyPanel = styled(Box)`
  padding: ${({ theme }) => theme.spaces[6]};
  border: 1px solid ${({ theme }) => theme.colors.neutral150};
  background: ${({ theme }) => theme.colors.neutral0};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.tableShadow};
`;

const splitLayout = (layout: EditLayout['layout']) => {
  const bodyLayout: EditLayout['layout'] = [];
  const dataLayout: EditLayout['layout'] = [];

  for (const panel of layout) {
    const bodyPanel: typeof panel = [];
    const dataPanel: typeof panel = [];
    for (const row of panel) {
      const bodyRow: typeof row = [];
      const dataRow: typeof row = [];
      for (const field of row) {
        if (field.name === 'body' && field.type === 'blocks') {
          bodyRow.push(field);
        } else {
          dataRow.push(field);
        }
      }
      if (bodyRow.length > 0) bodyPanel.push(bodyRow);
      if (dataRow.length > 0) dataPanel.push(dataRow);
    }
    if (bodyPanel.length > 0) bodyLayout.push(bodyPanel);
    if (dataPanel.length > 0) dataLayout.push(dataPanel);
  }

  return { bodyLayout, dataLayout };
};

interface BodyAwareLayoutProps extends FormLayoutProps {
  /**
   * If true, render in stacked mode regardless of viewport. Otherwise the
   * callsite picks Grid.Item columns around us.
   */
  stacked?: boolean;
}

const BodyAwareLayout: React.FC<BodyAwareLayoutProps> = ({ layout, document, hasBackground }) => {
  const { bodyLayout, dataLayout } = React.useMemo(() => splitLayout(layout), [layout]);

  if (bodyLayout.length === 0) {
    // No body attribute → regular form.
    return <FormLayout layout={layout} document={document} hasBackground={hasBackground} />;
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      <BodyPanel>
        <FormLayout layout={bodyLayout} document={document} hasBackground={false} />
      </BodyPanel>
      {dataLayout.length > 0 && (
        <FormLayout layout={dataLayout} document={document} hasBackground={hasBackground} />
      )}
    </Flex>
  );
};

BodyAwareLayout.displayName = 'BodyAwareLayout';

export { BodyAwareLayout };
