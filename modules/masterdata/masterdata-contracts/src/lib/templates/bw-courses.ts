import type { CourseInput } from '../course.js';

/**
 * Course catalog template for Baden-Württemberg (VwV Feuerwehrausbildung, Anlage 1).
 * Keys of granted qualifications match the BW catalog template.
 */
const COURSES: CourseInput[] = [
  { key: 'truppmann-1', name: { de: 'Truppmann Teil 1', en: 'Basic training part 1' }, level: 'district', grantsQualifications: ['truppmann-1'] },
  { key: 'truppmann-2', name: { de: 'Truppmann Teil 2', en: 'Basic training part 2' }, level: 'municipal', grantsQualifications: ['truppmann-2'], prerequisites: ['truppmann-1'] },
  { key: 'radio-operator', name: { de: 'Sprechfunker', en: 'Radio operator' }, level: 'district', grantsQualifications: ['radio-operator'], prerequisites: ['truppmann-1'] },
  { key: 'breathing-apparatus', name: { de: 'Atemschutzgeräteträger', en: 'Breathing apparatus wearer' }, level: 'district', grantsQualifications: ['breathing-apparatus'], prerequisites: ['truppmann-1'] },
  { key: 'machinist', name: { de: 'Maschinisten', en: 'Pump operator' }, level: 'district', grantsQualifications: ['machinist'], prerequisites: ['truppmann-1'] },
  { key: 'squad-leader', name: { de: 'Truppführer', en: 'Squad leader' }, level: 'district', grantsQualifications: ['squad-leader'], prerequisites: ['truppmann-2'] },
  { key: 'group-leader', name: { de: 'Gruppenführer', en: 'Group leader' }, level: 'state-school', grantsQualifications: ['group-leader'], prerequisites: ['squad-leader'] },
  { key: 'platoon-leader', name: { de: 'Zugführer', en: 'Platoon leader' }, level: 'state-school', grantsQualifications: ['platoon-leader'], prerequisites: ['group-leader'] },
  { key: 'unit-leader', name: { de: 'Verbandsführer', en: 'Unit leader' }, level: 'state-school', grantsQualifications: ['unit-leader'], prerequisites: ['platoon-leader'] },
  { key: 'chemical-suit', name: { de: 'CSA-Träger', en: 'Chemical protection suit wearer' }, level: 'district', grantsQualifications: ['chemical-suit'], prerequisites: ['breathing-apparatus'] },
  { key: 'aerial-ladder-operator', name: { de: 'Fachkunde Maschinisten Drehleiter', en: 'Aerial ladder operator' }, level: 'state-school', grantsQualifications: ['aerial-ladder-operator'], prerequisites: ['machinist'] },
  { key: 'equipment-officer', name: { de: 'Gerätewart', en: 'Equipment officer' }, level: 'state-school', grantsQualifications: ['equipment-officer'] },
  { key: 'breathing-apparatus-officer', name: { de: 'Atemschutzgerätewart', en: 'Breathing apparatus officer' }, level: 'state-school', grantsQualifications: ['breathing-apparatus-officer'], prerequisites: ['breathing-apparatus'] },
  { key: 'youth-group-leader', name: { de: 'Jugendgruppenleiter', en: 'Youth group leader' }, level: 'district', grantsQualifications: ['youth-group-leader'] },
];

export const BW_COURSE_TEMPLATE: CourseInput[] = COURSES.map((course, index) => ({
  ...course,
  sortOrder: (index + 1) * 10,
}));
