import { BadRequestException } from '@nestjs/common';
import type { FormAnswer, FormField, InspectionForm, RecordedForm } from '@forga/equipment-contracts';

type Value = string | number | boolean | null;

/** Longest text answer. */
const TEXT_MAX = 2000;

/**
 * Fills the fields of a fillable form from the answers of a recording and checks them: required fields need a value,
 * numbers are numbers, choices are one of the options, unknown answers are refused. A checkbox is `true` or `false`.
 */
export function fillFields(fields: FormField[], answers: FormAnswer[]): (FormField & { value: Value })[] {
  const known = new Set(fields.map((f) => f.id));
  for (const answer of answers) {
    if (!known.has(answer.id)) throw new BadRequestException({ code: 'equipment.formFieldUnknown', field: answer.id });
  }
  return fields.map((field) => {
    const raw = answers.find((a) => a.id === field.id)?.value ?? null;
    const fail = (): never => {
      throw new BadRequestException({ code: 'equipment.formFieldInvalid', field: field.id });
    };
    const missing = (value: Value) => field.required && (value === null || value === '' || value === false);
    let value: Value;
    switch (field.type) {
      case 'checkbox':
        if (raw !== null && typeof raw !== 'boolean') fail();
        value = raw === true;
        break;
      case 'number':
        if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw))) fail();
        value = raw;
        break;
      case 'choice':
        if (raw !== null && (typeof raw !== 'string' || !field.choices.includes(raw))) fail();
        value = raw;
        break;
      default:
        if (raw !== null && typeof raw !== 'string') fail();
        value = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, TEXT_MAX) : null;
    }
    if (missing(value)) throw new BadRequestException({ code: 'equipment.formFieldRequired', field: field.id });
    return { ...field, value };
  });
}

/**
 * Recorded form of an inspection, from the form of its type (at the time of recording) and the answers. A form with
 * an approval needs the confirmation; the approving person is the recording user. `null` without a fillable form or approval.
 */
export function recordForm(form: InspectionForm, answers: { formValues: FormAnswer[]; approved: boolean }, approvedBy: string, approvedAt: string): RecordedForm | null {
  switch (form.kind) {
    case 'fillable':
      return { kind: 'fillable', fields: fillFields(form.fields, answers.formValues) };
    case 'approval':
      if (!answers.approved) throw new BadRequestException({ code: 'equipment.approvalRequired' });
      return { kind: 'approval', text: form.text, approvedBy, approvedAt };
    default:
      return null;
  }
}

/** Values of a correction: a recorded fillable form takes the new answers with its recorded field definitions; approval stays. */
export function correctForm(recorded: RecordedForm | null, answers: FormAnswer[]): RecordedForm | null {
  if (recorded?.kind !== 'fillable') return recorded;
  return { kind: 'fillable', fields: fillFields(recorded.fields, answers) };
}
