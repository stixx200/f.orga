import { Injectable } from '@nestjs/common';
import type { Deadline, DeadlineStage, LocalizedText } from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';

/** A deadline as a module computes it from its current data. */
export interface DeadlineInput {
  /** Stable ID, unique per module, e.g. `probation-ends:<person-id>`. */
  id: string;
  kind: string;
  title: LocalizedText;
  subject: { type: string; id: string; label: string };
  dueOn: string;
  /** Days before `dueOn` from which the deadline shows up. */
  leadDays: number;
  /** Departments of the subject; empty = only brigade-wide grants see it. */
  departmentIds: string[];
  /** Users with this permission (or one of these permissions) in one of the departments are responsible. */
  permission: string | readonly string[];
  /** If set, only the users linked to one of these persons are responsible (e.g. the author of a report). */
  personIds?: string[];
  /** Heading in the weekly e-mail, e.g. category and vehicle of an item. */
  group?: LocalizedText;
  /** Page of the app where the task is done (absolute route, e.g. `/equipment/items/<id>`). */
  to?: string;
  /**
   * Says something about the health of the subject (e.g. a medical examination is required): the weekly e-mail names
   * no persons for it (setting `security.mailHealthWithoutNames`), only how many there are.
   */
  health?: boolean;
}

/**
 * Modules provide deadlines computed from their current data (nothing is stored),
 * so a deadline disappears as soon as the new evidence has been recorded.
 */
export interface DeadlineProvider {
  module: string;
  deadlines(asOf: string): Promise<DeadlineInput[]>;
}

const DUE_DAYS = 7;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function stageOf(dueOn: string, asOf: string): DeadlineStage {
  if (dueOn < asOf) return 'overdue';
  return dueOn <= addDays(asOf, DUE_DAYS) ? 'due' : 'upcoming';
}

@Injectable()
export class DeadlineRegistry {
  private readonly providers: DeadlineProvider[] = [];

  register(provider: DeadlineProvider): void {
    this.providers.push(provider);
  }

  /** Deadlines the user is responsible for, already within their lead time, earliest first. */
  async forUser(user: AuthenticatedUser, asOf: string): Promise<Deadline[]> {
    const result: Deadline[] = [];
    for (const provider of this.providers) {
      for (const input of await provider.deadlines(asOf)) {
        if (addDays(input.dueOn, -input.leadDays) > asOf) continue;
        const permissions = typeof input.permission === 'string' ? [input.permission] : input.permission;
        const permitted = permissions.some((permission) =>
          input.departmentIds.length ? input.departmentIds.some((id) => user.can(permission, id)) : user.grant(permission) === 'brigade',
        );
        const responsible = permitted && (!input.personIds || (user.personId !== null && input.personIds.includes(user.personId)));
        if (!responsible) continue;
        result.push({
          id: `${provider.module}.${input.id}`,
          module: provider.module,
          kind: input.kind,
          title: input.title,
          subject: input.subject,
          dueOn: input.dueOn,
          stage: stageOf(input.dueOn, asOf),
          ...(input.group ? { group: input.group } : {}),
          ...(input.to ? { to: input.to } : {}),
          ...(input.health ? { health: true } : {}),
        });
      }
    }
    return result.toSorted((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
  }
}
