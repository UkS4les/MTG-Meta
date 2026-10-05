/** Formatos do MVP. A chave é a que aparece nas URLs e no banco. */
export const FORMATS = {
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  pauper: 'Pauper',
} as const;

export type FormatKey = keyof typeof FORMATS;

export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

export function isFormatKey(value: string): value is FormatKey {
  return Object.hasOwn(FORMATS, value);
}
