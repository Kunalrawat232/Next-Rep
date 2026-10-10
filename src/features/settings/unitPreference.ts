import { UnitSchema, type Unit } from '../../domain/schemas';

export const DEFAULT_UNIT: Unit = 'kg';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const unitKey = (userId: string) => `next-rep-unit-${userId}`;
const pendingKey = (userId: string) => `next-rep-unit-pending-${userId}`;

/** Storage can be blocked (some private modes) or full: a preference that cannot be kept is simply not kept. */
function safely<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

/** The unit kept on this device for this user, kg when there is none or it is not a unit. */
export function readUnit(storage: Store, userId: string): Unit {
  const parsed = UnitSchema.safeParse(safely(() => storage.getItem(unitKey(userId)), null));
  return parsed.success ? parsed.data : DEFAULT_UNIT;
}

export function writeUnit(storage: Store, userId: string, unit: Unit): void {
  safely(() => storage.setItem(unitKey(userId), unit), undefined);
}

/** True while a choice made on this device has not reached the server. */
export function isUnitPending(storage: Store, userId: string): boolean {
  return safely(() => storage.getItem(pendingKey(userId)) === 'yes', false);
}

export function setUnitPending(storage: Store, userId: string, pending: boolean): void {
  safely(
    () =>
      pending ? storage.setItem(pendingKey(userId), 'yes') : storage.removeItem(pendingKey(userId)),
    undefined,
  );
}
