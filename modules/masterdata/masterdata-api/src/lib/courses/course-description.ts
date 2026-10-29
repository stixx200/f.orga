import type { Course } from './course.entities.js';

/**
 * Description of an attendance of the course: for a collective course like "other course" (`describe`) the trimmed
 * name of the actual course (at most 200 characters, like the input), `null` when it is missing or only repeats the
 * course itself; empty for other courses.
 */
export function attendanceDescription(course: Pick<Course, 'key' | 'name' | 'describe'>, text: string | null | undefined): string | null {
  if (!course.describe) return '';
  const description = (text ?? '').trim().slice(0, 200);
  if (!description || [course.key, course.name.de, course.name.en].some((n) => n.toLowerCase() === description.toLowerCase())) return null;
  return description;
}
