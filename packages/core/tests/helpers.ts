import { CardDatabase } from '../src/card-db.ts';
import type { CardInfo } from '../src/types.ts';

export function card(name: string, overrides: Partial<CardInfo> = {}): CardInfo {
  return {
    name,
    faceNames: [],
    typeLine: 'Creature',
    freeBasic: false,
    anyNumber: false,
    arenaRarity: 'common',
    paperRarity: 'common',
    priceUsd: 0.1,
    ...overrides,
  };
}

export function testDb(): CardDatabase {
  return new CardDatabase([
    card('Mountain', { typeLine: 'Basic Land — Mountain', freeBasic: true, priceUsd: 0.05 }),
    card('Snow-Covered Island', { typeLine: 'Basic Snow Land — Island', priceUsd: 0.2 }),
    card('Monastery Swiftspear', { arenaRarity: 'uncommon', paperRarity: 'uncommon', priceUsd: 0.5 }),
    card('Bloodthirsty Adversary', { arenaRarity: 'mythic', paperRarity: 'mythic', priceUsd: 6 }),
    card('Eidolon of the Great Revel', { arenaRarity: 'rare', paperRarity: 'rare', priceUsd: 2.5 }),
    card('Kumano Faces Kakkazan // Etching of Kumano', {
      faceNames: ['Kumano Faces Kakkazan', 'Etching of Kumano'],
      arenaRarity: 'uncommon',
      paperRarity: 'uncommon',
      priceUsd: 0.4,
    }),
    card('Force of Will', { arenaRarity: null, paperRarity: 'mythic', priceUsd: 80 }),
    card('Persistent Petitioners', { anyNumber: true, priceUsd: 0.3 }),
    card('Carta Sem Preço', { arenaRarity: 'rare', paperRarity: 'rare', priceUsd: null }),
    card("Lim-Dûl's Vault", { arenaRarity: null, paperRarity: 'uncommon', priceUsd: 1 }),
  ]);
}
