export function normalizeTechName(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9一-龥]+/g, '')
}
