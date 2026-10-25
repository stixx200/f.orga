import { addMonths, computeDues } from './due.js';
import type { InspectionType } from './equipment.js';

const type = (key: string, intervalMonths: number | null, trigger: InspectionType['trigger'] = 'periodic'): InspectionType => ({ key, name: { de: key, en: key }, intervalMonths, trigger, inspector: 'competent-person', checklist: [] });

describe('computeDues', () => {
  const today = '2026-10-24';
  it('adds the interval to the last inspection and is due today without inspection', () => {
    const dues = computeDues([type('check', 6), type('overhaul', 72)], new Map([['check', { date: '2026-06-01', nextDueOn: null }]]), {}, today);
    expect(dues[0]).toMatchObject({ dueOn: '2026-12-01', overdue: false, lastDate: '2026-06-01' });
    expect(dues[1]).toMatchObject({ dueOn: today, overdue: true, lastDate: null });
  });

  it('respects a due date set on the inspection', () => {
    expect(computeDues([type('check', 12)], new Map([['check', { date: '2026-01-01', nextDueOn: '2026-07-01' }]]), {}, today)[0]).toMatchObject({ dueOn: '2026-07-01', overdue: true });
  });

  it('makes inspections after use due when triggered after the last inspection', () => {
    const afterUse = [type('wash', null, 'after-washing')];
    expect(computeDues(afterUse, new Map(), {}, today)[0].dueOn).toBeNull();
    expect(computeDues(afterUse, new Map([['wash', { date: '2026-10-01', nextDueOn: null }]]), { wash: '2026-10-20' }, today)[0]).toMatchObject({ dueOn: '2026-10-20', overdue: true });
    expect(computeDues(afterUse, new Map([['wash', { date: '2026-10-22', nextDueOn: null }]]), { wash: '2026-10-20' }, today)[0].dueOn).toBeNull();
  });

  it('adds months', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });
});
