/**
 * Purpose:
 * - Provide labeled form-field patterns built from shared primitives.
 *
 * Key Features:
 * - Standardizes label, help-text, and wrapper layout for common world and agent forms.
 * - Exposes text, textarea, select, and checkbox field patterns for feature code.
 *
 * Notes on Implementation:
 * - Checkbox layout remains explicit because its label row differs from stacked field controls.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Normalized AppRun child forwarding so field wrappers preserve nested controls and options.
 * - 2026-03-24: Added shared field patterns for the layered web UI contract.
 */

import { PrimitiveInput, PrimitiveSelect, PrimitiveTextarea } from '../primitives';
import { resolveAppRunChildren } from '../utils/apprun-children';

type LabeledFieldProps = {
  children: any;
  className?: string;
  help?: any;
  helpClassName?: string;
  htmlFor?: string;
  label: any;
  labelClassName?: string;
};

type TextInputFieldProps = {
  className?: string;
  fieldClassName?: string;
  help?: any;
  helpClassName?: string;
  htmlFor?: string;
  label: any;
  labelClassName?: string;
} & Record<string, unknown>;

type TextAreaFieldProps = {
  className?: string;
  fieldClassName?: string;
  help?: any;
  helpClassName?: string;
  htmlFor?: string;
  label: any;
  labelClassName?: string;
} & Record<string, unknown>;

type SelectFieldProps = {
  children?: any;
  className?: string;
  fieldClassName?: string;
  help?: any;
  helpClassName?: string;
  htmlFor?: string;
  label: any;
  labelClassName?: string;
} & Record<string, unknown>;

type CheckboxFieldProps = {
  checked?: boolean;
  className?: string;
  help?: any;
  helpClassName?: string;
  htmlFor?: string;
  id?: string;
  inputClassName?: string;
  label: any;
  labelClassName?: string;
  rowClassName?: string;
} & Record<string, unknown>;

export function LabeledField({
  children,
  className = 'form-group',
  help,
  helpClassName = 'form-help-text',
  htmlFor,
  label,
  labelClassName = '',
}: LabeledFieldProps, runtimeChildren?: any) {
  const resolvedChildren = resolveAppRunChildren(children, runtimeChildren);

  return <div className={className}>
    <label htmlFor={htmlFor} className={labelClassName}>{label}</label>
    {resolvedChildren}
    {help ? <small className={helpClassName}>{help}</small> : null}
  </div>;
}

export function TextInputField({
  className = 'form-group',
  fieldClassName = 'form-input',
  help,
  helpClassName = 'form-help-text',
  htmlFor,
  label,
  labelClassName = '',
  ...attrs
}: TextInputFieldProps) {
  return <LabeledField
    className={className}
    help={help}
    helpClassName={helpClassName}
    htmlFor={htmlFor}
    label={label}
    labelClassName={labelClassName}
  >
    <PrimitiveInput id={htmlFor} className={fieldClassName} {...attrs} />
  </LabeledField>;
}

export function TextAreaField({
  className = 'form-group',
  fieldClassName = 'form-textarea',
  help,
  helpClassName = 'form-help-text',
  htmlFor,
  label,
  labelClassName = '',
  ...attrs
}: TextAreaFieldProps) {
  return <LabeledField
    className={className}
    help={help}
    helpClassName={helpClassName}
    htmlFor={htmlFor}
    label={label}
    labelClassName={labelClassName}
  >
    <PrimitiveTextarea id={htmlFor} className={fieldClassName} {...attrs} />
  </LabeledField>;
}

export function SelectField({
  children,
  className = 'form-group',
  fieldClassName = 'form-select',
  help,
  helpClassName = 'form-help-text',
  htmlFor,
  label,
  labelClassName = '',
  ...attrs
}: SelectFieldProps, runtimeChildren?: any) {
  return <LabeledField
    className={className}
    help={help}
    helpClassName={helpClassName}
    htmlFor={htmlFor}
    label={label}
    labelClassName={labelClassName}
  >
    <PrimitiveSelect id={htmlFor} className={fieldClassName} {...attrs}>
      {resolveAppRunChildren(children, runtimeChildren)}
    </PrimitiveSelect>
  </LabeledField>;
}

export function CheckboxField({
  checked,
  className = 'form-group',
  help,
  helpClassName = 'form-help-text',
  htmlFor,
  id,
  inputClassName = '',
  label,
  labelClassName = '',
  rowClassName = 'form-checkbox-row',
  ...attrs
}: CheckboxFieldProps) {
  const resolvedId = id || htmlFor;
  return <div className={className}>
    <div className={rowClassName}>
      <PrimitiveInput
        id={resolvedId}
        type="checkbox"
        className={inputClassName}
        checked={checked}
        {...attrs}
      />
      <label htmlFor={resolvedId} className={labelClassName}>{label}</label>
    </div>
    {help ? <p className={helpClassName}>{help}</p> : null}
  </div>;
}

export default LabeledField;
