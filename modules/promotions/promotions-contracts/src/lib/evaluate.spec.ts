import { addYears, type CareerFacts, evaluatePerson, explain } from './evaluate.js';
import { PromotionSettings, VWV_2022_RULES } from './rules.js';

const ORDER = ['probation', 'fm', 'ofm', 'hfm', 'lm', 'olm', 'hlm', 'bm', 'obm', 'hbm', 'lhbm'];
const facts = (
  overrides: Partial<Omit<CareerFacts, 'qualifications'>> & {
    qualifications?: Record<string, string>;
  } = {},
): CareerFacts => ({
  rank: 'fm',
  rankSince: '2020-01-01',
  joinedOn: '2018-01-01',
  probationEndsOn: '2020-01-01',
  musician: false,
  ...overrides,
  qualifications: new Map(Object.entries(overrides.qualifications ?? {})),
});
const evaluate = (f: CareerFacts, on = '2026-10-24', until = '2027-01-24', population: number | null = 10_000) => evaluatePerson(f, VWV_2022_RULES, { population }, on, until, ORDER);

describe('addYears', () => {
  it('adds whole and half years and keeps the end of February valid', () => {
    expect(addYears('2020-03-15', 3)).toBe('2023-03-15');
    expect(addYears('2020-01-31', 0.5)).toBe('2020-07-31');
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
  });
});

describe('evaluatePerson with the VwV 2022 template', () => {
  it('promotes to FM after probation with basic training', () => {
    const result = evaluate(
      facts({
        rank: 'probation',
        rankSince: '2025-01-01',
        probationEndsOn: '2026-07-01',
        qualifications: { 'truppmann-1': '2025-05-01' },
      }),
    );
    expect(result).toMatchObject({ state: 'fulfilled', rule: { rank: 'fm' } });
  });

  it('names the missing course for FM', () => {
    const result = evaluate(
      facts({
        rank: 'probation',
        rankSince: '2025-01-01',
        probationEndsOn: '2026-07-01',
      }),
    );
    expect(result?.state).toBe('missing');
    expect(result?.missing.map((m) => m.condition)).toEqual([{ type: 'qualification', keys: ['truppmann-1'] }]);
  });

  it('promotes to OFM after 3 years with Truppmann 2 and a specialist course', () => {
    const result = evaluate(
      facts({
        rankSince: '2023-06-01',
        qualifications: {
          'truppmann-2': '2022-01-01',
          'radio-operator': '2022-05-01',
        },
      }),
    );
    expect(result).toMatchObject({ state: 'fulfilled', rule: { rank: 'ofm' } });
  });

  it('shows OFM as preview when the time is reached within the preview period', () => {
    const result = evaluate(
      facts({
        rankSince: '2023-12-01',
        qualifications: {
          'truppmann-2': '2022-01-01',
          machinist: '2022-05-01',
        },
      }),
    );
    expect(result).toMatchObject({
      state: 'preview',
      metOn: '2026-12-01',
      rule: { rank: 'ofm' },
    });
  });

  it('lists the missing conditions of the alternative met first', () => {
    const result = evaluate(
      facts({
        rankSince: '2024-01-01',
        qualifications: { 'truppmann-2': '2022-01-01' },
      }),
    );
    expect(result).toMatchObject({
      state: 'missing',
      metOn: '2034-01-01',
      rule: { rank: 'ofm' },
    });
    expect(result?.missing.map((m) => m.condition.type)).toEqual(['years-in-rank']);
  });

  it('skips to LM as group leader, but only one year after the last promotion', () => {
    expect(
      evaluate(
        facts({
          rank: 'ofm',
          rankSince: '2024-01-01',
          qualifications: { 'group-leader': '2026-03-01' },
        }),
      ),
    ).toMatchObject({ state: 'fulfilled', rule: { rank: 'lm' } });
    const recent = evaluate(
      facts({
        rank: 'ofm',
        rankSince: '2026-09-01',
        qualifications: { 'group-leader': '2026-03-01' },
      }),
    );
    expect(recent).toMatchObject({
      state: 'missing',
      rule: { rank: 'lm' },
      metOn: '2027-09-01',
    });
  });

  it('respects the musician path', () => {
    expect(
      evaluate(
        facts({
          musician: true,
          rankSince: '2023-01-01',
          qualifications: { 'music-d2': '2022-01-01' },
        }),
      ),
    ).toMatchObject({ state: 'fulfilled', rule: { rank: 'ofm' } });
    expect(
      evaluate(
        facts({
          musician: false,
          rankSince: '2023-01-01',
          qualifications: { 'music-d2': '2022-01-01' },
        }),
      )?.state,
    ).toBe('missing');
  });

  it('allows HBM only above 15,000 inhabitants', () => {
    const obm = facts({ rank: 'obm', rankSince: '2010-01-01' });
    expect(evaluate(obm)).toMatchObject({
      state: 'missing',
      missing: [{ condition: { type: 'population' } }],
    });
    expect(evaluate(obm, undefined, undefined, 20_000)).toMatchObject({
      state: 'fulfilled',
      rule: { rank: 'hbm' },
    });
  });

  it('makes only the commander LHBM', () => {
    const hbm = facts({ rank: 'hbm', rankSince: '2000-01-01' });
    expect(evaluate(hbm, undefined, undefined, 20_000)).toMatchObject({ rule: { key: 'lhbm' }, state: 'missing', missing: [{ condition: { type: 'office' } }] });
    const commander = facts({ rank: 'hbm', rankSince: '2000-01-01', offices: [{ office: 'commander', from: '2020-05-01', to: null }] });
    expect(evaluate(commander, undefined, undefined, 20_000)).toMatchObject({ rule: { key: 'lhbm' }, state: 'fulfilled' });
    // A former commander does not count for "current".
    const former = facts({ rank: 'hbm', rankSince: '2000-01-01', offices: [{ office: 'commander', from: '2010-01-01', to: '2020-01-01' }] });
    expect(evaluate(former, undefined, undefined, 20_000)?.state).toBe('missing');
  });

  it('ignores inactive rules and ranks not above the current one', () => {
    const inactive = VWV_2022_RULES.map((r) => (r.key === 'lhbm' ? { ...r, active: false } : r));
    expect(evaluatePerson(facts({ rank: 'hbm', rankSince: '2000-01-01', offices: [{ office: 'commander', from: '2020-05-01', to: null }] }), inactive, { population: 20_000 }, '2026-10-24', '2027-01-24', ORDER)).toBeNull();
  });

  it('extends the time in rank by rest periods, and stops it during an open one', () => {
    const condition = { type: 'years-in-rank' as const, years: 3 };
    // Three years from 2022-01-01, plus 31 days dormant in January 2023.
    const rested = explain(condition, facts({ rankSince: '2022-01-01', restPeriods: [{ from: '2023-01-01', to: '2023-01-31' }] }), { population: null }, '2026-10-24');
    expect(rested.metOn).toBe('2025-02-01');
    expect(explain(condition, facts({ rankSince: '2022-01-01', restPeriods: [{ from: '2024-05-01', to: null }] }), { population: null }, '2026-10-24')).toMatchObject({ met: false, metOn: null });
    // Rest periods before the start do not count.
    expect(explain(condition, facts({ rankSince: '2022-01-01', restPeriods: [{ from: '2020-01-01', to: '2020-12-31' }] }), { population: null }, '2026-10-24').metOn).toBe('2025-01-01');
  });

  it('dates an office held for some years', () => {
    const result = explain({ type: 'office', keys: ['youth-warden'], current: false, years: 5 }, facts({ offices: [{ office: 'youth-warden', from: '2023-01-01', to: '2024-06-30' }, { office: 'youth-warden', from: '2025-01-01', to: null }] }), { population: null }, '2026-10-24');
    expect(result).toMatchObject({ met: false, metOn: '2030-01-01' });
  });

  it('takes the district population only with the department scope', () => {
    const condition = { type: 'population' as const, min: 15001, max: null };
    expect(explain(condition, facts(), { population: 10_000, departmentPopulation: 20_000 }, '2026-10-24').met).toBe(false);
    expect(explain({ ...condition, scope: 'department' }, facts(), { population: 10_000, departmentPopulation: 20_000 }, '2026-10-24').met).toBe(true);
  });
});

describe('explain', () => {
  it('dates an "and" by its latest condition', () => {
    const result = explain(
      {
        type: 'and',
        children: [
          { type: 'years-in-rank', years: 3 },
          { type: 'years-since-joining', years: 10 },
        ],
      },
      facts(),
      { population: null },
      '2021-01-01',
    );
    expect(result).toMatchObject({ met: false, metOn: '2028-01-01' });
  });
});

describe('PromotionSettings', () => {
  it('accepts the template', () => {
    expect(() => PromotionSettings.parse({ rules: VWV_2022_RULES })).not.toThrow();
  });
});
