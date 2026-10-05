/**
 * Leitor do Player.log do MTG Arena: extrai as partidas terminadas, o deck usado em cada uma
 * e as cartas que o oponente mostrou. Não guarda nome nem identificador de oponente.
 *
 * O formato do log não é documentado pela Wizards e muda sem aviso. Por isso o leitor ignora
 * o que não entende em vez de falhar, e devolve contadores para a tela dizer quanto ficou de fora.
 * Roda no navegador: o arquivo não precisa sair do computador da pessoa.
 */

export interface ArenaDeckCard {
  /** Identificador da carta no Arena (grpId). */
  arenaId: number;
  quantity: number;
}

export interface ArenaDeck {
  name: string | null;
  main: ArenaDeckCard[];
  sideboard: ArenaDeckCard[];
  commander: ArenaDeckCard[];
}

export type MatchResult = 'win' | 'loss' | 'draw';

export interface ArenaMatch {
  /** Identificador da partida no Arena: reimportar o mesmo log não duplica. */
  id: string;
  /** Fila ou evento como o Arena chama, ex.: "Ladder", "Traditional_Ladder", "PremierDraft_...". */
  eventId: string;
  /** Início em ISO 8601, ou null quando o log não traz horário legível. */
  startedAt: string | null;
  result: MatchResult;
  gamesWon: number;
  gamesLost: number;
  /** A pessoa começou jogando no primeiro jogo? null = o log não mostrou. */
  onPlay: boolean | null;
  deck: ArenaDeck | null;
  /** grpId das cartas do oponente que ficaram visíveis, sem repetição. */
  opponentCards: number[];
}

export interface ArenaLogResult {
  matches: ArenaMatch[];
  /** O log diz se "Detailed Logs" está ligado; null = a linha não apareceu. */
  detailedLogs: boolean | null;
  /** Partidas que começaram no log mas não têm resultado (jogo fechado no meio, log cortado). */
  unfinished: number;
  /** Partidas com resultado em que não deu para saber qual dos dois lados é a pessoa. */
  unresolved: number;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const asInt = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Só estas linhas interessam; testar o texto antes evita interpretar centenas de MB de JSON à toa. */
const MARKERS = ['matchGameRoomStateChangedEvent', 'greToClientEvent', 'authenticateResponse', 'MainDeck'];

/** Entrega, em ordem, os objetos JSON relevantes do log (de uma linha só ou quebrados em várias). */
function* payloads(text: string): Generator<Json> {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const start = line.indexOf('{');
    if (start < 0) continue;

    if (MARKERS.some((marker) => line.includes(marker))) {
      const parsed = tryParse(line.slice(start));
      if (isObject(parsed)) yield parsed;
      continue;
    }

    // JSON formatado em várias linhas: começa com "{" sozinho e fecha com "}" na primeira coluna.
    if (line.trim() !== '{') continue;
    let end = i + 1;
    while (end < lines.length && end - i < 20_000 && !lines[end]!.startsWith('}') && !lines[end]!.startsWith('[')) end++;
    if (end >= lines.length || !lines[end]!.startsWith('}')) continue;
    const block = lines.slice(i, end + 1).join('\n');
    i = end;
    if (!MARKERS.some((marker) => block.includes(marker))) continue;
    const parsed = tryParse(block);
    if (isObject(parsed)) yield parsed;
  }
}

function toCards(value: unknown): ArenaDeckCard[] {
  const list = asArray(value);
  const merged = new Map<number, number>();
  const add = (arenaId: number | null, quantity: number | null) => {
    if (arenaId !== null && arenaId > 0 && quantity !== null && quantity > 0) merged.set(arenaId, (merged.get(arenaId) ?? 0) + quantity);
  };
  if (list.every((item) => typeof item === 'number')) {
    // Formato antigo: [id, quantidade, id, quantidade, ...].
    for (let i = 0; i + 1 < list.length; i += 2) add(asInt(list[i]), asInt(list[i + 1]));
  } else {
    for (const item of list) {
      if (isObject(item)) add(asInt(item.cardId), asInt(item.quantity));
    }
  }
  return [...merged].map(([arenaId, quantity]) => ({ arenaId, quantity }));
}

function toDeck(deck: unknown, summary: unknown): ArenaDeck | null {
  if (!isObject(deck)) return null;
  const main = toCards(deck.MainDeck);
  if (main.length === 0) return null;
  return {
    name: isObject(summary) ? asString(summary.Name) : null,
    main,
    // O companheiro fica no sideboard, como na exportação do Arena.
    sideboard: toCards([...asArray(deck.Sideboard), ...asArray(deck.Companions)]),
    commander: toCards(deck.CommandZone),
  };
}

/** O log traz horários como milissegundos desde 1970 ou como "ticks" do .NET (100 ns desde o ano 1). */
function toIso(value: unknown): string | null {
  const text = typeof value === 'number' ? String(Math.trunc(value)) : asString(value);
  if (!text || !/^\d{12,19}$/.test(text)) return null;
  const ms = text.length >= 17 ? Number((BigInt(text) - 621_355_968_000_000_000n) / 10_000n) : Number(text);
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  return Number.isFinite(ms) && year >= 2018 && year <= 2100 ? date.toISOString() : null;
}

interface OpenMatch {
  id: string;
  eventId: string;
  startedAt: string | null;
  deck: ArenaDeck | null;
  localSeat: number | null;
  /** Lugar → time. No 1x1 costumam ser iguais, mas o resultado vem por time. */
  teams: Map<number, number>;
  /** Número do jogo → lugar de quem jogou o primeiro turno. */
  starters: Map<number, number>;
  gameNumber: number;
  /** Lugar do dono → grpId das cartas dele que apareceram. */
  seen: Map<number, Set<number>>;
}

export function parseArenaLog(text: string): ArenaLogResult {
  const result: ArenaLogResult = { matches: [], detailedLogs: null, unfinished: 0, unresolved: 0 };
  const detailed = text.match(/DETAILED LOGS: (ENABLED|DISABLED)/);
  if (detailed) result.detailedLogs = detailed[1] === 'ENABLED';

  let localUserId: string | null = null;
  const decks = new Map<string, ArenaDeck>();
  let lastDeck: ArenaDeck | null = null;
  let open: OpenMatch | null = null;
  const done = new Set<string>();

  const rememberDeck = (eventName: unknown, deck: ArenaDeck | null) => {
    if (!deck) return;
    lastDeck = deck;
    const name = asString(eventName);
    if (name) decks.set(name, deck);
  };

  const readDecks = (payload: Json) => {
    // Envio do deck ao entrar na fila: o pedido vem como texto JSON dentro do campo "request".
    const request = typeof payload.request === 'string' ? tryParse(payload.request) : payload;
    if (isObject(request)) rememberDeck(request.EventName, toDeck(request.Deck, request.Summary));
    // Eventos em andamento (drafts, por exemplo) listam o deck registrado em cada um.
    for (const course of asArray(payload.Courses)) {
      if (isObject(course)) rememberDeck(course.InternalEventName, toDeck(course.CourseDeck, course.CourseDeckSummary));
    }
  };

  const readRoom = (payload: Json, room: Json) => {
    const config = isObject(room.gameRoomConfig) ? room.gameRoomConfig : {};
    const final = isObject(room.finalMatchResult) ? room.finalMatchResult : null;
    const id = asString(config.matchId) ?? (final ? asString(final.matchId) : null);
    if (!id || done.has(id)) return;

    if (!open || open.id !== id) {
      if (open) result.unfinished++;
      open = { id, eventId: '', startedAt: toIso(payload.timestamp), deck: null, localSeat: null, teams: new Map(), starters: new Map(), gameNumber: 1, seen: new Map() };
    }
    const match = open;
    for (const player of asArray(config.reservedPlayers)) {
      if (!isObject(player)) continue;
      const seat = asInt(player.systemSeatId);
      if (seat === null) continue;
      match.teams.set(seat, asInt(player.teamId) ?? seat);
      match.eventId ||= asString(player.eventId) ?? '';
      if (localUserId !== null && player.userId === localUserId) match.localSeat = seat;
    }
    match.eventId = asString(config.eventId) ?? match.eventId;
    match.deck ??= decks.get(match.eventId) ?? lastDeck;

    if (!final) return;
    open = null;
    done.add(id);
    const localTeam = match.localSeat === null ? null : (match.teams.get(match.localSeat) ?? match.localSeat);
    if (localTeam === null) {
      result.unresolved++;
      return;
    }

    let gamesWon = 0;
    let gamesLost = 0;
    let matchResult: MatchResult | null = null;
    for (const entry of asArray(final.resultList)) {
      if (!isObject(entry)) continue;
      const winner = asInt(entry.winningTeamId);
      const outcome: MatchResult = entry.result === 'ResultType_Draw' || winner === null ? 'draw' : winner === localTeam ? 'win' : 'loss';
      if (entry.scope === 'MatchScope_Game') {
        if (outcome === 'win') gamesWon++;
        else if (outcome === 'loss') gamesLost++;
      } else if (entry.scope === 'MatchScope_Match') {
        matchResult = outcome;
      }
    }
    // Sem a linha do resultado da partida, vale o placar dos jogos.
    matchResult ??= gamesWon > gamesLost ? 'win' : gamesLost > gamesWon ? 'loss' : gamesWon + gamesLost > 0 ? 'draw' : null;
    if (matchResult === null) {
      result.unresolved++;
      return;
    }

    const starter = match.starters.get(1);
    const opponentCards = new Set<number>();
    for (const [seat, cards] of match.seen) {
      if (seat !== match.localSeat) for (const card of cards) opponentCards.add(card);
    }
    result.matches.push({
      id,
      eventId: match.eventId || 'desconhecido',
      startedAt: match.startedAt,
      result: matchResult,
      gamesWon,
      gamesLost,
      onPlay: starter === undefined ? null : starter === match.localSeat,
      deck: match.deck,
      opponentCards: [...opponentCards].sort((a, b) => a - b),
    });
  };

  const readGre = (event: Json) => {
    if (!open) return;
    const match = open;
    for (const message of asArray(event.greToClientMessages)) {
      if (!isObject(message)) continue;
      // Cada mensagem diz a quem foi endereçada; neste log, sempre ao lugar da própria pessoa.
      const seats = asArray(message.systemSeatIds);
      if (match.localSeat === null && seats.length === 1) match.localSeat = asInt(seats[0]);

      const state = isObject(message.gameStateMessage) ? message.gameStateMessage : null;
      if (!state) continue;
      if (isObject(state.gameInfo)) match.gameNumber = asInt(state.gameInfo.gameNumber) ?? match.gameNumber;
      if (isObject(state.turnInfo)) {
        const turn = asInt(state.turnInfo.turnNumber);
        const active = asInt(state.turnInfo.activePlayer);
        if (turn === 1 && active !== null && !match.starters.has(match.gameNumber)) match.starters.set(match.gameNumber, active);
      }
      for (const object of asArray(state.gameObjects)) {
        // Só cartas: fichas e habilidades na pilha não dizem que deck é.
        if (!isObject(object) || object.type !== 'GameObjectType_Card') continue;
        const owner = asInt(object.ownerSeatId);
        const grpId = asInt(object.grpId);
        if (owner === null || grpId === null || grpId <= 0) continue;
        const cards = match.seen.get(owner);
        if (cards) cards.add(grpId);
        else match.seen.set(owner, new Set([grpId]));
      }
    }
  };

  for (const payload of payloads(text)) {
    if (isObject(payload.authenticateResponse)) localUserId = asString(payload.authenticateResponse.clientId) ?? localUserId;
    readDecks(payload);
    const roomEvent = payload.matchGameRoomStateChangedEvent;
    if (isObject(roomEvent) && isObject(roomEvent.gameRoomInfo)) readRoom(payload, roomEvent.gameRoomInfo);
    if (isObject(payload.greToClientEvent)) readGre(payload.greToClientEvent);
  }
  if (open) result.unfinished++;
  return result;
}

export interface ArenaQueue {
  /** Nome para mostrar, ex.: "Standard ranqueado (MD3)". */
  label: string;
  /** Formato do meta do MTGO que serve para reconhecer arquétipos nesta fila, se houver. */
  metaFormat: 'standard' | 'pioneer' | null;
}

const QUEUES: [RegExp, string, ArenaQueue['metaFormat']][] = [
  [/draft/i, 'Draft', null],
  [/sealed/i, 'Selado', null],
  [/brawl/i, 'Brawl', null],
  [/^AIBotMatch/i, 'Contra o bot', null],
  [/^DirectGame/i, 'Desafio direto', null],
  [/alchemy/i, 'Alchemy', null],
  [/historic/i, 'Historic', null],
  [/timeless/i, 'Timeless', null],
  [/explorer|pioneer/i, 'Pioneer', 'pioneer'],
  [/^(Traditional_)?Ladder$|^Play$|^Constructed_BestOf3$|standard/i, 'Standard', 'standard'],
];

/** Traduz o nome interno da fila. Filas desconhecidas aparecem com o nome original, sem sublinhados. */
export function describeQueue(eventId: string): ArenaQueue {
  const known = QUEUES.find(([pattern]) => pattern.test(eventId));
  if (!known) return { label: eventId.replace(/_/g, ' '), metaFormat: null };
  const [, name, metaFormat] = known;
  const constructed = !['Draft', 'Selado', 'Contra o bot', 'Desafio direto'].includes(name);
  const ranked = constructed && /ladder/i.test(eventId) ? ' ranqueado' : '';
  const bestOf3 = constructed && /traditional|bestof3/i.test(eventId) ? ' (MD3)' : '';
  return { label: `${name}${ranked}${bestOf3}`, metaFormat };
}

export interface WinRate {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  /** Vitórias ÷ partidas decididas (empates fora), de 0 a 1; null sem partidas decididas. */
  rate: number | null;
  /** Intervalo de Wilson de 95%: com poucas partidas ele é largo, e é isso que ele serve para mostrar. */
  low: number | null;
  high: number | null;
}

export function winRate(results: readonly MatchResult[]): WinRate {
  const wins = results.filter((r) => r === 'win').length;
  const losses = results.filter((r) => r === 'loss').length;
  const decided = wins + losses;
  const base = { matches: results.length, wins, losses, draws: results.length - decided };
  if (decided === 0) return { ...base, rate: null, low: null, high: null };
  const z = 1.96;
  const p = wins / decided;
  const denominator = 1 + (z * z) / decided;
  const center = (p + (z * z) / (2 * decided)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / decided + (z * z) / (4 * decided * decided))) / denominator;
  return { ...base, rate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export interface WinRateGroup extends WinRate {
  key: string;
}

/** Agrupa as partidas por uma chave (deck, fila, arquétipo do oponente...) e ordena por volume. */
export function winRateBy<T extends { result: MatchResult }>(matches: readonly T[], keyOf: (match: T) => string | null): WinRateGroup[] {
  const groups = new Map<string, MatchResult[]>();
  for (const match of matches) {
    const key = keyOf(match);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(match.result);
    else groups.set(key, [match.result]);
  }
  return [...groups]
    .map(([key, results]) => ({ key, ...winRate(results) }))
    .sort((a, b) => b.matches - a.matches || a.key.localeCompare(b.key));
}
