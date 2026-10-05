import type { Color, DeckEntry, Platform, Rarity } from '@mtg-meta/core';
import type { CardRef } from './cards-shared';

/** Um deck criado pela pessoa, como o site lista. Sem conta, fica guardado no navegador com esta mesma forma. */
export interface SavedDeck {
  id: string;
  name: string;
  format: string | null;
  main: DeckEntry[];
  sideboard: DeckEntry[];
  updatedAt: string;
  colors: Color[];
  /** Carta que ilustra o deck na lista. */
  cover: CardRef | null;
}

/** Corpo de POST /api/decks e PUT /api/decks/:id. */
export interface DeckInput {
  name: string;
  format: string | null;
  main: DeckEntry[];
  sideboard: DeckEntry[];
}

export interface DecksStatus {
  loggedIn: boolean;
  decks: SavedDeck[];
  /** Os decks iniciais que o Arena dá a todo jogador. Só para abrir uma cópia; não são da pessoa. */
  starters: SavedDeck[];
}

/** Corpo de POST /api/decks/analisar: a lista em edição, ou um texto colado para virar lista. */
export interface AnalyzeRequest {
  main?: DeckEntry[];
  sideboard?: DeckEntry[];
  /** Decklist colada (formato do Arena, do MTGO ou "4 Nome"). Quando vem, substitui main e sideboard. */
  texto?: string;
  formato?: string | null;
  plataforma: Platform;
  /** Coleção guardada no navegador; sem ela, vale a da conta. */
  colecao?: string;
}

export interface AnalyzedCard extends CardRef {
  quantity: number;
  /** false = nome que não está no banco de cartas. */
  known: boolean;
  land: boolean;
  /** Cópias na coleção; null quando não há coleção para comparar. */
  owned: number | null;
}

export interface DeckAnalysis {
  /** A lista com os nomes oficiais das cartas, pronta para salvar. */
  main: AnalyzedCard[];
  sideboard: AnalyzedCard[];
  colors: Color[];
  cover: CardRef | null;
  unknown: string[];
  /** Linhas do texto colado que não deram para ler. */
  ignoredLines: number;
  /** Arquétipo do meta mais parecido, se o formato tiver meta e algum passar do limite. */
  archetype: { id: number; name: string; format: string } | null;
  /** null = a pessoa não tem coleção desta plataforma. */
  coverage: {
    coverage: number;
    missingCopies: number;
    wildcards: Record<Rarity, number>;
    costUsd: number;
    unpriced: number;
    notOnArena: string[];
  } | null;
}

export const LOCAL_DECKS_KEY = 'mtg-meta:decks';
export const MAX_DECK_NAME = 80;
