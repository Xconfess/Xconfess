let sequence = 0;

const next = () => {
  sequence += 1;
  return sequence;
};

const hexChars = '0123456789abcdef';
const alphaNumChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function repeatFrom(chars: string, length: number): string {
  return Array.from({ length }, (_, index) => chars[(next() + index) % chars.length]).join('');
}

export const faker = {
  string: {
    uuid: () => `00000000-0000-4000-8000-${String(next()).padStart(12, '0')}`,
    hexadecimal: ({ length = 8, prefix = '', case: letterCase = 'lower' } = {}) => {
      const value = repeatFrom(hexChars, length);
      return `${prefix}${letterCase === 'upper' ? value.toUpperCase() : value}`;
    },
    alphanumeric: ({ length = 8 } = {}) => repeatFrom(alphaNumChars, length),
  },
  number: {
    int: ({ min = 0, max = 9999 } = {}) => min + (next() % (max - min + 1)),
    float: ({ min = 0, max = 1 } = {}) => {
      const ratio = (next() % 1000) / 1000;
      return min + (max - min) * ratio;
    },
  },
  lorem: {
    paragraph: () => `Test paragraph ${next()}`,
  },
  datatype: {
    boolean: () => next() % 2 === 0,
  },
  date: {
    past: () => new Date('2024-01-15T10:30:00.000Z'),
    recent: () => new Date('2026-03-25T10:30:00.000Z'),
  },
  helpers: {
    arrayElement: <T>(items: T[]) => items[next() % items.length],
    enumValue: <T extends Record<string, unknown>>(items: T) => {
      const values = Object.values(items);
      return values[next() % values.length];
    },
  },
};
