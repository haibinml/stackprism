export const normalizeTechName = (name: unknown): string =>
  String(name ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9一-龥]+/g, '')
