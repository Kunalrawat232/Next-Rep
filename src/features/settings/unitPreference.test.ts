import { describe, expect, it } from 'vitest';
import { isUnitPending, readUnit, setUnitPending, writeUnit } from './unitPreference';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
};

const blocked = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('the unit kept on the device', () => {
  it('is kg when nothing was chosen', () => {
    expect(readUnit(memory(), 'u1')).toBe('kg');
  });

  it('keeps a choice per user', () => {
    const storage = memory();
    writeUnit(storage, 'u1', 'lb');
    expect(readUnit(storage, 'u1')).toBe('lb');
    expect(readUnit(storage, 'u2')).toBe('kg');
  });

  it.each(['', 'LB', 'stone', '1', '<b>'])('reads %j as kg', (value) => {
    const storage = memory();
    storage.setItem('next-rep-unit-u1', value);
    expect(readUnit(storage, 'u1')).toBe('kg');
  });

  it('does not throw when storage is blocked, and reads kg', () => {
    expect(() => writeUnit(blocked, 'u1', 'lb')).not.toThrow();
    expect(readUnit(blocked, 'u1')).toBe('kg');
    expect(isUnitPending(blocked, 'u1')).toBe(false);
    expect(() => setUnitPending(blocked, 'u1', true)).not.toThrow();
  });
});

describe('a choice that has not reached the server', () => {
  it('is marked, and unmarked, per user', () => {
    const storage = memory();
    setUnitPending(storage, 'u1', true);
    expect(isUnitPending(storage, 'u1')).toBe(true);
    expect(isUnitPending(storage, 'u2')).toBe(false);
    setUnitPending(storage, 'u1', false);
    expect(isUnitPending(storage, 'u1')).toBe(false);
  });
});
