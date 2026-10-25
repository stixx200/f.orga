import { likeWord, searchWords, wordsWhere } from './search-words.js';

describe('search words', () => {
  it('splits names written in any order', () => {
    expect(searchWords('Funke, Felix')).toEqual(['Funke', 'Felix']);
    expect(searchWords('  Felix   Funke ')).toEqual(['Felix', 'Funke']);
    expect(searchWords(' , ')).toEqual([]);
  });

  it('takes wildcards literally', () => {
    expect(likeWord('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });

  it('requires every word in one of the fields', () => {
    expect(wordsWhere('Funke, Felix', ['firstName', 'lastName'])).toEqual({
      $and: [
        { $or: [{ firstName: { $ilike: '%Funke%' } }, { lastName: { $ilike: '%Funke%' } }] },
        { $or: [{ firstName: { $ilike: '%Felix%' } }, { lastName: { $ilike: '%Felix%' } }] },
      ],
    });
    expect(wordsWhere('', ['name'])).toBeNull();
  });
});
