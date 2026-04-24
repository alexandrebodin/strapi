import * as React from 'react';

import {
  Box,
  Checkbox,
  DatePicker,
  DateTimePicker,
  Field,
  Flex,
  Grid,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  TextInput,
  TimePicker,
  Toggle,
  Typography,
} from '@strapi/design-system';
import { styled } from 'styled-components';

import {
  convertEditLayoutToFieldLayouts,
  type EditFieldLayout,
} from '../../../../../../hooks/useDocumentLayout';
import { useGetInitialDataQuery } from '../../../../../../services/init';
import { useGetComponentConfigurationQuery } from '../../../../../../services/components';

/**
 * Schema + layout-aware form for editing a component instance's `data`
 * payload inside a blocks editor node.
 *
 * Reuses the Content Manager's stored component edit layout
 * (`convertEditLayoutToFieldLayouts`) so field visibility, labels, sizes
 * and ordering match the main CM component form exactly. Nested component
 * attributes render recursively.
 *
 * Depth is visualised with a coloured left border instead of padding so
 * deeply-nested editors don't shrink field widths. A hard depth cap prevents
 * infinite recursion in the unlikely case of a cyclic component definition.
 */

/* -------------------------------------------------------------------------------------------------
 * Helpers shared by all levels of the recursion
 * -----------------------------------------------------------------------------------------------*/

const MAX_DEPTH = 8;

type ScalarValue = unknown;

const scalarTextInputType = (type: string): 'password' | 'email' | 'text' => {
  if (type === 'password') return 'password';
  if (type === 'email') return 'email';
  return 'text';
};

const isScalarNumberType = (type: string) =>
  type === 'integer' || type === 'biginteger' || type === 'float' || type === 'decimal';

const isScalarTextType = (type: string) =>
  type === 'string' ||
  type === 'text' ||
  type === 'richtext' ||
  type === 'email' ||
  type === 'uid' ||
  type === 'password';

/* -------------------------------------------------------------------------------------------------
 * Unsupported placeholder — complex embed types we haven't wired inline yet
 * -----------------------------------------------------------------------------------------------*/

const PlaceholderBox = styled(Box)`
  border: 1px dashed ${({ theme }) => theme.colors.neutral200};
  border-radius: ${({ theme }) => theme.borderRadius};
`;

const UnsupportedPlaceholder = ({ type, label }: { type: string; label: string }) => (
  <Field.Root>
    <Field.Label>{label}</Field.Label>
    <PlaceholderBox padding={2} background="neutral100">
      <Typography variant="pi" textColor="neutral600">
        {type} fields aren&apos;t editable inline yet. Use the REST API to set this value.
      </Typography>
    </PlaceholderBox>
  </Field.Root>
);

/* -------------------------------------------------------------------------------------------------
 * Scalar field renderer
 * -----------------------------------------------------------------------------------------------*/

const ScalarField = ({
  field,
  value,
  onChange,
  disabled,
}: {
  field: EditFieldLayout;
  value: ScalarValue;
  onChange: (v: ScalarValue) => void;
  disabled?: boolean;
}) => {
  const { attribute, label, hint } = field;
  const { type } = attribute;

  if (type === 'boolean') {
    return (
      <Field.Root name={field.name} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <Toggle
          checked={value === true}
          disabled={disabled}
          onLabel="true"
          offLabel="false"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.checked)}
        />
      </Field.Root>
    );
  }

  if (type === 'enumeration') {
    const enumValues = (attribute as { enum?: string[] }).enum ?? [];
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <SingleSelect
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(next: string | number) => onChange(next)}
        >
          {enumValues.map((option) => (
            <SingleSelectOption key={option} value={option}>
              {option}
            </SingleSelectOption>
          ))}
        </SingleSelect>
      </Field.Root>
    );
  }

  if (isScalarNumberType(type)) {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <NumberInput
          value={typeof value === 'number' ? value : undefined}
          disabled={disabled}
          onValueChange={(next) => onChange(next ?? null)}
        />
      </Field.Root>
    );
  }

  if (type === 'date') {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <DatePicker
          disabled={disabled}
          value={value ? new Date(value as string) : undefined}
          onChange={(next?: Date) => onChange(next ? next.toISOString().slice(0, 10) : null)}
        />
      </Field.Root>
    );
  }

  if (type === 'datetime' || type === 'timestamp') {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <DateTimePicker
          disabled={disabled}
          value={value ? new Date(value as string) : undefined}
          onChange={(next?: Date) => onChange(next ? next.toISOString() : null)}
        />
      </Field.Root>
    );
  }

  if (type === 'time') {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <TimePicker
          disabled={disabled}
          value={(value as string) ?? undefined}
          onChange={(next: string) => onChange(next ?? null)}
        />
      </Field.Root>
    );
  }

  if (type === 'richtext' || type === 'text') {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <Textarea
          rows={4}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.currentTarget.value)}
        />
      </Field.Root>
    );
  }

  if (type === 'json') {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
    return (
      <Field.Root name={field.name} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <Textarea
          rows={6}
          value={text}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const raw = e.currentTarget.value;
            try {
              onChange(JSON.parse(raw));
            } catch {
              onChange(raw);
            }
          }}
        />
      </Field.Root>
    );
  }

  if (isScalarTextType(type)) {
    return (
      <Field.Root name={field.name} required={field.required} hint={hint}>
        <Field.Label>{label}</Field.Label>
        <TextInput
          type={scalarTextInputType(type)}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value)}
        />
      </Field.Root>
    );
  }

  return <UnsupportedPlaceholder type={type || 'unknown'} label={label} />;
};

/* -------------------------------------------------------------------------------------------------
 * NestedComponentField — renders a nested single component inline
 * -----------------------------------------------------------------------------------------------*/

// Palette of depth colours cycling through so deep nesting stays visually distinct.
const DEPTH_COLORS = [
  'primary500',
  'secondary500',
  'success500',
  'warning500',
  'danger500',
  'alternative500',
] as const;

const DepthBorder = styled(Box)<{ $depth: number }>`
  border-left: 2px solid
    ${({ theme, $depth }) =>
      theme.colors[DEPTH_COLORS[$depth % DEPTH_COLORS.length]] ?? theme.colors.primary500};
  padding-left: ${({ theme }) => theme.spaces[2]};
`;

const NestedComponentField = ({
  field,
  value,
  onChange,
  depth,
  configurations,
  schemas,
}: {
  field: EditFieldLayout & {
    attribute: { type: 'component'; component: string; repeatable?: boolean };
  };
  value: unknown;
  onChange: (next: unknown) => void;
  depth: number;
  configurations: Record<string, ComponentConfigurationShape>;
  schemas: Record<string, ComponentSchemaShape>;
}) => {
  const componentUid = field.attribute.component;

  if (field.attribute.repeatable) {
    // Repeatable nested components — supported with a simple add / remove list.
    const items = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    const setItems = (nextItems: Array<Record<string, unknown>>) => onChange(nextItems);

    return (
      <Field.Root name={field.name} required={field.required}>
        <Flex justifyContent="space-between" alignItems="center">
          <Field.Label>
            {field.label} ({items.length})
          </Field.Label>
        </Flex>
        <Flex direction="column" alignItems="stretch" gap={2}>
          {items.map((item, index) => (
            <DepthBorder key={index} $depth={depth}>
              <Flex direction="column" alignItems="stretch" gap={2}>
                <Flex justifyContent="space-between" alignItems="center">
                  <Typography variant="pi" textColor="neutral600">
                    #{index + 1} · {componentUid}
                  </Typography>
                  <Typography
                    variant="pi"
                    textColor="danger600"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Typography>
                </Flex>
                <ComponentFormFields
                  componentUid={componentUid}
                  value={item}
                  onChange={(next) => {
                    const copy = [...items];
                    copy[index] = next ?? {};
                    setItems(copy);
                  }}
                  depth={depth + 1}
                  configurations={configurations}
                  schemas={schemas}
                />
              </Flex>
            </DepthBorder>
          ))}
          <Typography
            variant="pi"
            textColor="primary600"
            style={{ cursor: 'pointer' }}
            onClick={() => setItems([...items, {}])}
          >
            + Add item
          </Typography>
        </Flex>
      </Field.Root>
    );
  }

  // Single nested component.
  return (
    <Field.Root name={field.name} required={field.required}>
      <Field.Label>{field.label}</Field.Label>
      <DepthBorder $depth={depth}>
        <ComponentFormFields
          componentUid={componentUid}
          value={(value as Record<string, unknown>) ?? {}}
          onChange={onChange}
          depth={depth + 1}
          configurations={configurations}
          schemas={schemas}
        />
      </DepthBorder>
    </Field.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * ComponentFormFields — iterates the component's edit layout and renders each field
 * -----------------------------------------------------------------------------------------------*/

type ComponentSchemaShape = {
  uid: string;
  attributes: Record<string, unknown>;
};

type ComponentConfigurationShape = {
  settings: Record<string, unknown>;
  metadatas: Record<string, { edit: Record<string, unknown>; list: Record<string, unknown> }>;
  layouts: { edit: Array<Array<{ name: string; size: number }>> };
};

interface ComponentFormFieldsProps {
  componentUid: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  depth?: number;
  /** Pre-fetched configurations. When omitted, the component fetches its own. */
  configurations?: Record<string, ComponentConfigurationShape>;
  schemas?: Record<string, ComponentSchemaShape>;
}

const ComponentFormFields: React.FC<ComponentFormFieldsProps> = ({
  componentUid,
  value,
  onChange,
  disabled,
  depth = 0,
  configurations: configurationsProp,
  schemas: schemasProp,
}) => {
  // Fetch configurations + schemas at the top level only; inner levels reuse
  // what's passed down so we don't trigger N nested HTTP calls.
  const shouldFetch = !configurationsProp || !schemasProp;
  const { data: configData } = useGetComponentConfigurationQuery(componentUid, {
    skip: !shouldFetch,
  });
  const { data: initialData } = useGetInitialDataQuery(undefined, { skip: !shouldFetch });

  const configurations: Record<string, ComponentConfigurationShape> =
    configurationsProp ??
    (configData
      ? ({
          [componentUid]: configData.component,
          ...configData.components,
        } as unknown as Record<string, ComponentConfigurationShape>)
      : {});

  const schemas: Record<string, ComponentSchemaShape> =
    schemasProp ??
    (initialData?.components
      ? Object.fromEntries(
          initialData.components.map((c) => [c.uid, c as unknown as ComponentSchemaShape])
        )
      : {});

  const schema = schemas[componentUid];
  const configuration = configurations[componentUid];

  if (depth >= MAX_DEPTH) {
    return (
      <Typography variant="pi" textColor="warning600">
        Nested depth cap reached ({MAX_DEPTH}). Edit deeper via the REST API.
      </Typography>
    );
  }

  if (!schema || !configuration) {
    // Initial fetch in flight — show nothing rather than a flashing skeleton.
    return null;
  }

  // Reuse the CM's own layout converter so visibility, labels, sizes and order
  // match what a user would see editing this component on its content type.
  const rows = convertEditLayoutToFieldLayouts(
    configuration.layouts.edit as any,
    schema.attributes as any,
    configuration.metadatas as any,
    { configurations: configurations as any, schemas: schemas as any }
  );

  const setFieldValue = (name: string, next: unknown) => {
    const draft = { ...value };
    if (next === undefined) {
      delete draft[name];
    } else {
      draft[name] = next;
    }
    onChange(draft);
  };

  if (rows.length === 0) {
    return (
      <Typography variant="pi" textColor="neutral500">
        (This component has no editable fields.)
      </Typography>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      {rows.map((row, rowIndex) => (
        <Grid.Root gap={{ initial: 3, medium: 4 }} key={rowIndex}>
          {row.map((field) => (
            <Grid.Item
              col={field.size}
              key={field.name}
              s={12}
              xs={12}
              direction="column"
              alignItems="stretch"
            >
              {renderField(
                field,
                value?.[field.name],
                (next) => setFieldValue(field.name, next),
                disabled,
                depth,
                configurations,
                schemas
              )}
            </Grid.Item>
          ))}
        </Grid.Root>
      ))}
    </Flex>
  );
};

const renderField = (
  field: EditFieldLayout,
  value: unknown,
  onChange: (next: unknown) => void,
  disabled: boolean | undefined,
  depth: number,
  configurations: Record<string, ComponentConfigurationShape>,
  schemas: Record<string, ComponentSchemaShape>
) => {
  const { type } = field.attribute;

  if (type === 'component') {
    return (
      <NestedComponentField
        field={field as any}
        value={value}
        onChange={onChange}
        depth={depth}
        configurations={configurations}
        schemas={schemas}
      />
    );
  }

  if (type === 'dynamiczone' || type === 'blocks' || type === 'relation' || type === 'media') {
    return <UnsupportedPlaceholder type={type} label={field.label} />;
  }

  return (
    <ScalarField
      field={field}
      value={value}
      onChange={onChange}
      disabled={disabled || field.disabled}
    />
  );
};

/* -------------------------------------------------------------------------------------------------
 * Legacy export — kept so callers that still import `ComponentDataForm` work
 *
 * Old signature: attributes + value + onChange. New preferred signature is
 * `componentUid + value + onChange` via `ComponentFormFields`. The thin
 * compatibility wrapper below translates the legacy callsite.
 * -----------------------------------------------------------------------------------------------*/

export type SchemaAttribute = {
  type: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  component?: string;
  [key: string]: unknown;
};

interface ComponentDataFormProps {
  /** Preferred: point at a component UID so we can reuse its CM edit layout. */
  componentUid?: string;
  /** Legacy fallback — iterates attributes directly without the edit layout. */
  attributes?: Record<string, SchemaAttribute>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

const ComponentDataForm: React.FC<ComponentDataFormProps> = ({
  componentUid,
  value,
  onChange,
  disabled,
}) => {
  if (!componentUid) {
    return (
      <Typography variant="pi" textColor="danger600">
        ComponentDataForm now requires a `componentUid` prop.
      </Typography>
    );
  }

  return (
    <ComponentFormFields
      componentUid={componentUid}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

export { ComponentDataForm, ComponentFormFields };
export type { ComponentDataFormProps };
