/**
 * Normaliza um nome de carta para comparação:
 * sem acentos, minúsculo, apóstrofos unificados e "//" com espaçamento padrão.
 * "Lim-Dûl's Vault" e "lim-dul's vault" viram a mesma chave.
 */
/** Nome da carta em forma de endereço: "Fire // Ice" → "fire-ice", "Lim-Dûl's Vault" → "lim-dul-s-vault". */
export function cardSlug(name: string): string {
  return normalizeName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s*\/{2,3}\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim();
}
