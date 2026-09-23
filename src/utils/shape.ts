/** True when `value` has the same type as `template` (for objects: the same keys with the same types). */
export function hasSameShape(value: unknown, template: unknown): boolean {
  if (typeof value !== typeof template || value === null) return false;
  if (typeof template !== 'object' || template === null) return true;
  const record = value as Record<string, unknown>;
  return Object.entries(template as Record<string, unknown>).every(
    ([key, expected]) => hasSameShape(record[key], expected),
  );
}
