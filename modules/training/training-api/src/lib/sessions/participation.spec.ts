import { participation } from './participation.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const member = (id: string, departmentId: string, from = '2020-01-01', to: string | null = null) => ({ id, firstName: id, lastName: 'Test', periods: [{ from, to, departmentId, primary: true }] });
const session = (day: string, departmentIds: string[], attendance: { personId: string; status: 'present' | 'excused' | 'absent' }[] = []) => ({
  startsAt: new Date(`${day}T17:00:00Z`),
  endsAt: new Date(`${day}T19:00:00Z`),
  departmentIds,
  attendance: attendance.map((a) => ({ ...a, from: null, to: null })),
});

describe('participation', () => {
  it('counts only the sessions of the own departments while a member', () => {
    const rows = participation(
      [
        session('2026-02-01', [A], [{ personId: 'anna', status: 'present' }]),
        session('2026-03-01', [A], [{ personId: 'anna', status: 'excused' }]),
        session('2026-03-02', [B], [{ personId: 'ben', status: 'present' }]),
        // Before Carl joined A.
        session('2026-01-15', [A], []),
      ],
      [member('anna', A), member('ben', B), member('carl', A, '2026-02-15')],
      { to: '2026-12-31' },
    );
    const of = (id: string) => rows.find((r) => r.personId === id);
    expect(of('anna')).toMatchObject({ departmentId: A, sessions: 3, present: 1, excused: 1, rate: 33, hours: 2 });
    expect(of('ben')).toMatchObject({ departmentId: B, sessions: 1, present: 1, rate: 100 });
    expect(of('carl')).toMatchObject({ sessions: 1, present: 0, rate: 0 });
  });

  it('counts a session a guest attended for the guest', () => {
    const rows = participation([session('2026-02-01', [A], [{ personId: 'ben', status: 'present' }])], [member('ben', B)], { to: '2026-12-31' });
    expect(rows).toEqual([expect.objectContaining({ personId: 'ben', sessions: 1, present: 1, rate: 100 })]);
  });

  it('limits the members to the chosen department', () => {
    const rows = participation([session('2026-02-01', [A, B])], [member('anna', A), member('ben', B)], { to: '2026-12-31', departmentId: A });
    expect(rows.map((r) => r.personId)).toEqual(['anna']);
  });
});
