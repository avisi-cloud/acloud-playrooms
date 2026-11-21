import { suggestPlayroomName } from './playroom-name';

describe('suggestPlayroomName', () => {
  it.each([
    ['My_API Room', 'my-api-room'],
    ['--Hello!@ World_--', 'hello-world'],
    ['api-v2', 'api-v2'],
    ['', ''],
    ['!@#$%', ''],
    ['  ___  ', ''],
    ['UPPER  CASE', 'upper-case'],
    ['Café room', 'caf-room'],
  ])('cleans %s to %s', (text, expected) => {
    expect(suggestPlayroomName(text)).toBe(expected);
  });
});
