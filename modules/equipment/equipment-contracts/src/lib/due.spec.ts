import { addMonths, computeDues, isBlocked, withIntervals } from './due.js';
import type { InspectionType } from './equipment.js';

const type = (key: string, intervalMonths: number | null, trigger: InspectionType['trigger'] = 'periodic'): InspectionType => ({ key, name: { de: key, en: key }, intervalMonths, trigger, inspector: 'competent-person', checklist: [] });

describe('computeDues', () => {
  const today = '2026-10-24';
  it('adds the interval to the last inspection', () => {
    const dues = computeDues([type('check', 6), type('overhaul', 72)], new Map([['check', { date: '2026-06-01', nextDueOn: null }]]), {}, today);
    expect(dues[0]).toMatchObject({ dueOn: '2026-12-01', overdue: false, lastDate: '2026-06-01' });
  });

  it('measures items never inspected from the purchase date, else from the day they were recorded', () => {
    const types = [type('check', 12)];
    expect(computeDues(types, new Map(), {}, today, { purchasedOn: '2026-03-15', createdOn: '2026-10-01' })[0]).toMatchObject({ dueOn: '2027-03-15', overdue: false, lastDate: null });
    // Without purchase date the item is due from the day it was recorded; the date does not move with today.
    const recorded = computeDues(types, new Map(), {}, '2026-11-30', { purchasedOn: null, createdOn: '2026-10-01' })[0];
    expect(recorded).toMatchObject({ dueOn: '2026-10-01', overdue: true, notRecorded: false });
  });

  it('shows inspections of vehicles taken over without dates as not recorded instead of due', () => {
    const types = [type('hu', 12), type('after-use', null, 'after-use')];
    const dues = computeDues(types, new Map(), {}, today, { purchasedOn: null, createdOn: today, dueFromRecording: false });
    expect(dues.map((d) => [d.dueOn, d.overdue, d.notRecorded])).toEqual([[null, false, true], [null, false, false]]);
    // Once inspected, the interval counts as usual.
    const inspected = computeDues(types, new Map([['hu', { date: '2026-03-01', nextDueOn: null }]]), {}, today, { purchasedOn: null, createdOn: today, dueFromRecording: false });
    expect(inspected[0]).toMatchObject({ dueOn: '2027-03-01', notRecorded: false });
  });

  it('keeps a failed inspection due instead of advancing the due date', () => {
    const failed = computeDues([type('check', 6)], new Map([['check', { date: '2026-10-20', nextDueOn: null, result: 'failed' as const }]]), {}, today)[0];
    expect(failed).toMatchObject({ dueOn: '2026-10-20', overdue: true });
  });

  it('applies the interval overrides of an item and blocks items of locking categories when overdue', () => {
    const types = withIntervals([type('hu', 12), type('annual', 12)], { hu: 24 });
    expect(types.map((t) => t.intervalMonths)).toEqual([24, 12]);
    const dues = computeDues(types, new Map([['hu', { date: '2025-06-01', nextDueOn: null }], ['annual', { date: '2025-06-01', nextDueOn: null }]]), {}, today);
    expect(dues.map((d) => d.dueOn)).toEqual(['2027-06-01', '2026-06-01']);
    expect(isBlocked(dues, true, today)).toBe(true);
    expect(isBlocked(dues, false, today)).toBe(false);
    // Due today is still valid today.
    expect(isBlocked([{ ...dues[0], dueOn: today }], true, today)).toBe(false);
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
