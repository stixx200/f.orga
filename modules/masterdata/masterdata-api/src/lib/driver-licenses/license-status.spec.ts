import { DriverLicenseSettings, readDriverLicense } from '@forga/masterdata-contracts';
import { type LicenseStatusInput, licenseStatus } from './license-status.js';

const ON_OCCASION = DriverLicenseSettings.parse({});
const PERIODIC = DriverLicenseSettings.parse({ mode: 'periodic', intervalMonths: 6 });
const SELF = DriverLicenseSettings.parse({ mode: 'periodic', intervalMonths: 6, selfCheck: true, inPersonEveryMonths: 12 });
const AS_OF = '2026-10-28';

const input = (values: Partial<LicenseStatusInput> = {}): LicenseStatusInput => ({
  status: 'active',
  license: readDriverLicense({ classes: [{ class: 'B' }, { class: 'C', expiresOn: '2031-04-16' }, { class: 'CE', expiresOn: '2031-04-16' }] }),
  qualifications: [],
  checks: [{ checkedOn: '2026-04-16', method: 'in-person', cancelled: false }],
  openRequests: [],
  ...values,
});

describe('licenseStatus', () => {
  it('monitors active members with a monitored class or a driver qualification only', () => {
    expect(licenseStatus(input(), ON_OCCASION, AS_OF).monitored).toBe(true);
    expect(licenseStatus(input({ status: 'passive' }), ON_OCCASION, AS_OF).monitored).toBe(false);
    const onlyB = readDriverLicense({ classes: [{ class: 'B' }] });
    expect(licenseStatus(input({ license: onlyB }), ON_OCCASION, AS_OF).monitored).toBe(false);
    expect(licenseStatus(input({ license: onlyB, qualifications: ['machinist'] }), ON_OCCASION, AS_OF).monitored).toBe(true);
    expect(licenseStatus(input({ license: onlyB }), DriverLicenseSettings.parse({ monitoredClasses: ['B', 'BE'] }), AS_OF).monitored).toBe(true);
  });

  it('has no periodic deadline in the on-occasion mode: first check, expiry per class and requests', () => {
    const status = licenseStatus(input(), ON_OCCASION, AS_OF);
    expect(status.dues).toEqual([{ kind: 'driver-license-class-expires', dueOn: '2031-04-16', classes: ['C', 'CE'], inPerson: true }]);
    expect(status.state).toBe('checked');
    expect(status.nextExpiry).toEqual({ dueOn: '2031-04-16', classes: ['C', 'CE'] });

    const withoutCheck = licenseStatus(input({ checks: [] }), ON_OCCASION, AS_OF);
    expect(withoutCheck.dues[0]).toMatchObject({ kind: 'driver-license-first-check', dueOn: AS_OF });
    expect(withoutCheck.state).toBe('first-check-missing');

    const requested = licenseStatus(input({ openRequests: [{ dueOn: '2026-11-11' }] }), ON_OCCASION, AS_OF);
    expect(requested.dues[0]).toMatchObject({ kind: 'driver-license-request', dueOn: '2026-11-11' });
    expect(requested.state).toBe('requested');
  });

  it('keeps the expiry per class: each date its own deadline, a passed one is overdue', () => {
    const license = readDriverLicense({ classes: [{ class: 'C1', expiresOn: '2026-10-01' }, { class: 'CE', expiresOn: '2026-11-04' }, { class: 'B' }] });
    const status = licenseStatus(input({ license }), ON_OCCASION, AS_OF);
    expect(status.dues.map((d) => [d.dueOn, d.classes])).toEqual([['2026-10-01', ['C1']], ['2026-11-04', ['CE']]]);
    expect(status.state).toBe('overdue');
    const soon = licenseStatus(input({ license: readDriverLicense({ classes: [{ class: 'CE', expiresOn: '2026-11-04' }] }) }), ON_OCCASION, AS_OF);
    expect(soon.state).toBe('due');
  });

  it('adds the interval after the latest valid check in the periodic mode; cancelled checks do not count', () => {
    const status = licenseStatus(input({ checks: [{ checkedOn: '2026-04-16', method: 'in-person', cancelled: false }, { checkedOn: '2026-06-01', method: 'in-person', cancelled: true }] }), PERIODIC, AS_OF);
    expect(status.dues[0]).toEqual({ kind: 'driver-license-check-due', dueOn: '2026-10-16', classes: [], inPerson: false });
    expect(status.state).toBe('overdue');
  });

  it('marks persons with a driver qualification but without classes', () => {
    const status = licenseStatus(input({ license: readDriverLicense({}), qualifications: ['machinist'], checks: [] }), ON_OCCASION, AS_OF);
    expect(status.state).toBe('classes-missing');
    expect(status.dues[0].kind).toBe('driver-license-first-check');
  });

  it('allows self-checks only in the periodic mode with self-checks and while the original is not due', () => {
    expect(licenseStatus(input(), ON_OCCASION, AS_OF).selfCheck).toBe('off');
    expect(licenseStatus(input(), PERIODIC, AS_OF).selfCheck).toBe('off');
    const self = licenseStatus(input({ checks: [{ checkedOn: '2026-04-16', method: 'in-person', cancelled: false }, { checkedOn: '2026-10-01', method: 'transponder', cancelled: false }] }), SELF, AS_OF);
    expect(self.selfCheck).toBe('allowed');
    // The self-check postpones the periodic deadline, not the original.
    expect(self.dues.map((d) => [d.kind, d.dueOn])).toEqual([
      ['driver-license-check-due', '2027-04-01'],
      ['driver-license-in-person-due', '2027-04-16'],
      ['driver-license-class-expires', '2031-04-16'],
    ]);
    expect(self.inPersonDueOn).toBe('2027-04-16');
    expect(licenseStatus(input({ checks: [] }), SELF, AS_OF).selfCheck).toBe('in-person');
    expect(licenseStatus(input({ openRequests: [{ dueOn: '2026-12-01' }] }), SELF, AS_OF).selfCheck).toBe('in-person');
    expect(licenseStatus(input({ checks: [{ checkedOn: '2025-10-01', method: 'in-person', cancelled: false }] }), SELF, AS_OF).selfCheck).toBe('in-person');
    const expired = readDriverLicense({ classes: [{ class: 'CE', expiresOn: '2026-10-01' }] });
    expect(licenseStatus(input({ license: expired }), SELF, AS_OF).selfCheck).toBe('in-person');
  });
});

describe('readDriverLicense', () => {
  it('reads old values: texts become classes, the single expiry goes to C1, C1E, C and CE', () => {
    expect(readDriverLicense({ classes: ['B', 'ce'], expiresOn: '2030-01-01', lastCheckedOn: '2024-05-01' })).toEqual({
      classes: [{ class: 'B', expiresOn: null }, { class: 'CE', expiresOn: '2030-01-01' }],
      documentExpiresOn: null,
      lastCheckedOn: '2024-05-01',
      lastCheckMethod: 'legacy',
      legacyCheckedOn: '2024-05-01',
      expiryToVerify: true,
    });
    expect(readDriverLicense({ classes: ['B'], expiresOn: '2030-01-01', lastCheckedOn: null })).toMatchObject({ classes: [{ class: 'B', expiresOn: null }], documentExpiresOn: '2030-01-01', expiryToVerify: false });
    expect(readDriverLicense(null)).toMatchObject({ classes: [], lastCheckedOn: null });
  });
});
