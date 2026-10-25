import { RESPIRATORY_PROTECTION_MANIFEST, type FitnessStatus } from '@forga/respiratory-protection-contracts';
import { isWearer, redact } from './visibility.js';

const status: FitnessStatus = {
  personId: '01a16846-0000-7000-8000-000000000001',
  firstName: 'Jonas',
  lastName: 'Test',
  departmentIds: [],
  color: 'red',
  conditions: [
    { key: 'examination', met: false, lastDate: '2026-10-01', dueOn: '2026-10-01', concerns: true },
    { key: 'briefing', met: true, lastDate: '2026-05-01', dueOn: '2027-05-01' },
  ],
  nextDue: '2026-10-01',
  minimumKilojoules: 80,
};

describe('redact', () => {
  it('hides the date of an examination with concerns, also from the next due date', () => {
    const redacted = redact(status);
    expect(redacted.conditions[0]).toEqual({ key: 'examination', met: false, lastDate: null, dueOn: null });
    expect(redacted.nextDue).toBe('2027-05-01');
    expect(redacted.color).toBe('red');
  });
});

describe('wearers', () => {
  it('counts only active members and members on probation with the qualification', () => {
    expect(isWearer({ status: 'active', qualifications: ['breathing-apparatus'] })).toBe(true);
    expect(isWearer({ status: 'probation', qualifications: ['breathing-apparatus'] })).toBe(true);
    expect(isWearer({ status: 'veterans', qualifications: ['breathing-apparatus'] })).toBe(false);
    expect(isWearer({ status: 'active', qualifications: [] })).toBe(false);
  });

  it('leaves recording evidence and its deadlines out of the commander template', () => {
    const commander = RESPIRATORY_PROTECTION_MANIFEST.roles.filter((r) => r.key === 'commander').flatMap((r) => r.permissions);
    expect(commander).toEqual(['respiratory-protection.read']);
  });
});
