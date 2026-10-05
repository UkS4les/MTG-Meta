import type { ArenaMatch } from '@mtg-meta/core';
import type { MatchRecord } from '@mtg-meta/db';

export type { MatchRecord };

/** Corpo de POST /api/partidas: as partidas que o navegador leu do Player.log. */
export interface MatchesRequest {
  partidas: ArenaMatch[];
}

export interface MatchesResponse {
  /** false = visitante sem conta: nada foi gravado no servidor. */
  saved: boolean;
  /** Quantas das partidas enviadas ainda não estavam salvas (só com conta). */
  added: number;
  /** As partidas enviadas, já com nomes de cartas e arquétipos. */
  partidas: MatchRecord[];
}

export interface MatchesStatus {
  loggedIn: boolean;
  partidas: MatchRecord[];
}

/** Onde as partidas de quem não tem conta ficam guardadas no navegador. */
export const LOCAL_MATCHES_KEY = 'mtg-meta:partidas';
