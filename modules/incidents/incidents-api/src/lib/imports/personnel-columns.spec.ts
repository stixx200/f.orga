import { statisticsOf, statusOf } from './personnel-columns.js';

describe('statisticsOf', () => {
  it('reads codes and names of the state template', () => {
    expect(statisticsOf({ mainType: 'fire', fireSize: 'Kleinbrand A' }).statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-a', ownMunicipality: true });
    expect(statisticsOf({ mainType: 'Technische Hilfe', technicalCategory: 'rescue-persons', rescued: '2', trafficAccident: 'ja', ownMunicipality: 'nein' }).statistics).toMatchObject({
      mainType: 'technical-assistance',
      technicalCategory: 'rescue-persons',
      rescued: 2,
      trafficAccident: true,
      ownMunicipality: false,
    });
    expect(statisticsOf({ mainType: 'false-alarm', falseAlarmType: 'Brandmeldeanlage' }).statistics).toMatchObject({ falseAlarmType: 'fire-alarm-system' });
  });

  it('has no statistics without main type and reports unknown or incomplete ones', () => {
    expect(statisticsOf({})).toEqual({ statistics: null });
    expect(statisticsOf({ mainType: 'Brand' }).message).toEqual({ code: 'incidents.import.invalidStatistics', params: { field: 'fireSize', value: '' } });
    expect(statisticsOf({ mainType: 'Weltraum' }).message).toEqual({ code: 'incidents.import.invalidStatistics', params: { field: 'mainType', value: 'Weltraum' } });
    expect(statisticsOf({ mainType: 'other', dead: 'viele' }).message).toMatchObject({ params: { field: 'dead' } });
  });
});

describe('statusOf', () => {
  it('reads codes, names and texts', () => {
    expect(statusOf('released-billing')).toBe('released-billing');
    expect(statusOf('Freigabe Entschädigung')).toBe('released-compensation');
    expect(statusOf('zur Abrechnung freigegeben')).toBe('released-billing');
    expect(statusOf('noch nicht abrechnen')).toBe('draft');
    expect(statusOf('')).toBe('draft');
  });
});
