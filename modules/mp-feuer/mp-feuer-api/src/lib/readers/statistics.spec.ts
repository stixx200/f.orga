import { statisticsColumns, statisticsFromMpFeuer } from './statistics.js';

describe('statisticsFromMpFeuer', () => {
  it('reads fires by size', () => {
    expect(statisticsFromMpFeuer('#L Kleinbrände A')).toMatchObject({ mainType: 'fire', fireSize: 'small-a' });
    expect(statisticsFromMpFeuer('#L Kleinbrände B')).toMatchObject({ mainType: 'fire', fireSize: 'small-b' });
    expect(statisticsFromMpFeuer('#L Mittelbrände')).toMatchObject({ mainType: 'fire', fireSize: 'medium' });
    expect(statisticsFromMpFeuer('#L Großbrände')).toMatchObject({ mainType: 'fire', fireSize: 'large' });
  });

  it('reads technical assistance with counts and traffic accidents', () => {
    expect(statisticsFromMpFeuer('#L TH1-Menschenrettung\n', { rescued: '2', dead: '1', incidentType: 'Verkehrsunfall' })).toMatchObject({
      mainType: 'technical-assistance',
      technicalCategory: 'rescue-persons',
      rescued: 2,
      dead: 1,
      trafficAccident: true,
      ownMunicipality: true,
    });
    expect(statisticsFromMpFeuer('#L TH4-Tierrettung ohne 5', { animalsRescued: '1' })).toMatchObject({ technicalCategory: 'animal-rescue', animalsRescued: 1 });
    expect(statisticsFromMpFeuer('#L TH8-sonstiger Art')).toMatchObject({ technicalCategory: 'other' });
    expect(statisticsFromMpFeuer('#L TH-Überlandhilfe')).toMatchObject({ technicalCategory: 'other', ownMunicipality: false });
  });

  it('reads false alarms and other incidents', () => {
    expect(statisticsFromMpFeuer('#L Fehlalarm.BMA')).toMatchObject({ mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' });
    expect(statisticsFromMpFeuer('#L Fehlalarm.Täuschungsalarm')).toMatchObject({ falseAlarmType: 'good-faith' });
    expect(statisticsFromMpFeuer('#L Sonstige Einsätze')).toMatchObject({ mainType: 'other' });
  });

  it('ignores empty and unknown keys', () => {
    expect(statisticsFromMpFeuer('')).toBeNull();
    expect(statisticsFromMpFeuer('#L Irgendwas')).toBeNull();
    expect(statisticsFromMpFeuer('#L Fehlalarm.Unbekannt')).toBeNull();
  });
});

describe('statisticsColumns', () => {
  it('gives the columns of the profile incidents.personnel', () => {
    expect(statisticsColumns('#L TH-Überlandhilfe', { rescued: '1' })).toMatchObject({ mainType: 'technical-assistance', technicalCategory: 'other', ownMunicipality: 'nein', rescued: '1' });
    expect(statisticsColumns('')).toEqual({});
  });
});
