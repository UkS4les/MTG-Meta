import type { Platform, Rarity } from '@mtg-meta/core';

export const RARITY_PT: Record<Rarity, string> = { common: 'comum', uncommon: 'incomum', rare: 'rara', mythic: 'mítica' };
/** Para contagens: "2 raras", "1 comum". */
export const RARITY_PLURAL_PT: Record<Rarity, string> = { common: 'comuns', uncommon: 'incomuns', rare: 'raras', mythic: 'míticas' };
export const PLATFORM_PT: Record<Platform, string> = { arena: 'Arena', paper: 'Papel' };

const percentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholePercentFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const usdFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const integerFormat = new Intl.NumberFormat('pt-BR');
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const percent = (value: number) => percentFormat.format(value);
export const wholePercent = (value: number) => wholePercentFormat.format(value);
export const usd = (value: number) => usdFormat.format(value);
export const integer = (value: number) => integerFormat.format(value);

/** "2026-10-03" → "3 de out. de 2026". */
export const date = (isoDate: string) => dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));

export const scryfallUrl = (cardName: string) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${cardName}"`)}`;
