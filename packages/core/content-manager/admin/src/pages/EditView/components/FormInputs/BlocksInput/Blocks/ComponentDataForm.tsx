import * as React from 'react';

import {
  Box,
  Checkbox,
  DatePicker,
  DateTimePicker,
  Field,
  Flex,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  TextInput,
  TimePicker,
  Toggle,
  Typography,
} from '@strapi/design-system';

/**
 * Schema-aware form for editing a component instance's `data` payload inside a
 * blocks editor node.
 *
 * Iterates the component's schema attributes and renders a typed input for
 * each. Scalar and enum types are covered; complex types (component,
 * dynamiczone, blocks, relation, media) render a disabled placeholder with a
 * clear "not yet supported inline" hint so authors understand why they can't
 * edit them here — these belong in a richer follow-up editor.
 *
 * Intentionally independent from the CM's FormLayout / InputRenderer
 * machinery, which requires a surrounding Form context and operates against
 * document state. Our state lives in a Slate node and gets written back via
 * `onChange` when the parent dialog saves.
 */

type SchemaAttribute = {
  type: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  component?: string;
  [key: string]: unknown;
};

interface ComponentDataFormProps {
  attributes: Record<string, SchemaAttribute>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

const isScalarNumberType = (type: string) =>
  type === 'integer' || type === 'biginteger' || type === 'float' || type === 'decimal';

const isScalarTextType = (type: string) =>
  type === 'string' ||
  type === 'text' ||
  type === 'richtext' ||
  type === 'email' ||
  type === 'uid' ||
  type === 'password';

const UnsupportedPlaceholder = ({ type, name }: { type: string; name: string }) => (
  <Field.Root name={name}>
    <Field.Label>{name}</Field.Label>
    <Box padding={2} background="neutral100" borderColor="neutral200" hasRadius>
      <Typography variant="pi" textColor="neutral600">
        {type} fields aren&apos;t editable inline yet. Use the REST API to set this value.
      </Typography>
    </Box>
  </Field.Root>
);

const FieldRenderer = ({
  name,
  attribute,
  value,
  onChange,
  disabled,
}: {
  name: string;
  attribute: SchemaAttribute;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) => {
  const { type } = attribute;
  const label = name;

  if (type === 'boolean') {
    return (
      <Field.Root name={name}>
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
    return (
      <Field.Root name={name} required={attribute.required}>
        <Field.Label>{label}</Field.Label>
        <SingleSelect
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(next: string | number) => onChange(next)}
        >
          {(attribute.enum ?? []).map((option) => (
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
      <Field.Root name={name} required={attribute.required}>
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
      <Field.Root name={name} required={attribute.required}>
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
      <Field.Root name={name} required={attribute.required}>
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
      <Field.Root name={name} required={attribute.required}>
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
      <Field.Root name={name} required={attribute.required}>
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
      <Field.Root name={name}>
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
              // Preserve the raw text so the user can keep typing; validation
              // happens when the outer dialog saves.
              onChange(raw);
            }
          }}
        />
      </Field.Root>
    );
  }

  if (isScalarTextType(type)) {
    return (
      <Field.Root name={name} required={attribute.required}>
        <Field.Label>{label}</Field.Label>
        <TextInput
          type={type === 'password' ? 'password' : type === 'email' ? 'email' : 'text'}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value)}
        />
      </Field.Root>
    );
  }

  if (['component', 'dynamiczone', 'blocks', 'relation', 'media'].includes(type)) {
    return <UnsupportedPlaceholder type={type} name={name} />;
  }

  return <UnsupportedPlaceholder type={type || 'unknown'} name={name} />;
};

const ComponentDataForm = ({ attributes, value, onChange, disabled }: ComponentDataFormProps) => {
  const handleField = (name: string, next: unknown) => {
    const draft = { ...value };
    if (next === null || next === undefined) {
      delete draft[name];
    } else {
      draft[name] = next;
    }
    onChange(draft);
  };

  const entries = Object.entries(attributes).filter(
    ([, attr]) => attr && (attr as { private?: boolean }).private !== true
  );

  if (entries.length === 0) {
    return (
      <Typography variant="pi" textColor="neutral500">
        (This component has no editable attributes.)
      </Typography>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      {entries.map(([name, attribute]) => (
        <FieldRenderer
          key={name}
          name={name}
          attribute={attribute}
          value={value?.[name]}
          onChange={(next) => handleField(name, next)}
          disabled={disabled}
        />
      ))}
    </Flex>
  );
};

export { ComponentDataForm };
export type { ComponentDataFormProps, SchemaAttribute };
