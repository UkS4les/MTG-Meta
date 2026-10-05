/**
 * Normaliza um nome de carta para comparação:
 * sem acentos, minúsculo, apóstrofos unificados e "//" com espaçamento padrão.
 * "Lim-Dûl's Vault" e "lim-dul's vault" viram a mesma chave.
 */
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
