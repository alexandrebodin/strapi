/**
 * BodyToggle
 *
 * Generic checkbox tailored for the body config section. Mirrors the shape
 * expected by the content-type form renderer (onChange({ target }) contract)
 * without the data-loss confirmation dialog that DraftAndPublishToggle uses —
 * the body toggles don't destroy data at the DB level, they only hide the
 * feature in the admin UI.
 */

import { Checkbox, CheckboxProps, Field } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import type { IntlLabel } from '../types';

interface BodyToggleDescription {
  id: string;
  defaultMessage: string;
  values?: Record<string, string | number | boolean>;
}

interface BodyToggleProps {
  description?: BodyToggleDescription;
  disabled?: boolean;
  intlLabel: IntlLabel;
  name: string;
  onChange: (value: { target: { name: string; value: boolean } }) => void;
  value?: boolean;
}

export const BodyToggle = ({
  description,
  disabled = false,
  intlLabel,
  name,
  onChange,
  value = false,
}: BodyToggleProps) => {
  const { formatMessage } = useIntl();
  const label = intlLabel.id
    ? formatMessage(
        { id: intlLabel.id, defaultMessage: intlLabel.defaultMessage },
        { ...intlLabel.values }
      )
    : name;

  const hint = description
    ? formatMessage(
        { id: description.id, defaultMessage: description.defaultMessage },
        { ...description.values }
      )
    : '';

  const handleChange: CheckboxProps['onCheckedChange'] = (checked) => {
    onChange({ target: { name, value: !!checked } });
  };

  return (
    <Field.Root hint={hint} name={name}>
      <Checkbox checked={value} disabled={disabled} onCheckedChange={handleChange}>
        {label}
      </Checkbox>
      <Field.Hint />
    </Field.Root>
  );
};
