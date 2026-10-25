import type { Finding } from '@forga/incidents-contracts';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Text of a finding in the UI language, e.g. "Jonas Keller steht auch im Bericht Ahornfeld." */
export function findingText(finding: Finding, t: T): string {
  const params: Record<string, unknown> = { ...finding.params };
  // Names of report times and person statuses come as keys.
  if (finding.rule === 'times-order') {
    params['first'] = t(`times.${String(params['first'])}`);
    params['second'] = t(`times.${String(params['second'])}`);
  }
  if (finding.rule === 'person-not-operational') params['status'] = t(`personStatus.${String(params['status'])}`);
  return t(`rules.${finding.rule}${finding.rule === 'times-invalid' && finding.params['person'] ? '-person' : ''}`, params);
}

/** Errors other than a missing primary report block submitting; that one is fixed on the incident. */
export const blocking = (findings: Finding[]) => findings.filter((f) => f.level === 'error' && f.rule !== 'primary-missing');
export const openWarnings = (findings: Finding[]) => findings.filter((f) => f.level === 'warning' && !f.acknowledged);
export const findingKey = (f: Pick<Finding, 'rule' | 'subject'>) => `${f.rule}|${f.subject ?? ''}`;

/**
 * One finding per rule and subject: a person overlapping several other incidents gets one warning
 * listing all dispatch numbers. Acknowledgements are kept per rule and subject as well.
 */
export function mergeFindings(findings: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const key = findingKey(finding);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...finding, params: { ...finding.params } });
      continue;
    }
    for (const [name, value] of Object.entries(finding.params)) {
      const values = String(existing.params[name] ?? '').split(', ');
      if (!values.includes(String(value))) existing.params[name] = [...values.filter(Boolean), String(value)].join(', ');
    }
  }
  return [...merged.values()];
}
