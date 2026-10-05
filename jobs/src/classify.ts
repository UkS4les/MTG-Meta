import {
  buildSignature,
  classifyDeck,
  clusterDecks,
  deckFeatures,
  fromSignature,
  suggestName,
  toSignature,
  DEFAULT_THRESHOLD,
  similarity,
  type CardDatabase,
  type Features,
} from '@mtg-meta/core';
import { assignArchetypes, createArchetype, listArchetypes, recentDecks, updateArchetype, type Db } from '@mtg-meta/db';

/** Janela de listas que define a assinatura de cada arquétipo: longa o bastante para dar volume, curta para acompanhar o meta. */
export const SIGNATURE_WINDOW_DAYS = 60;
/** Um grupo de decks parecidos só vira arquétipo a partir deste tamanho; abaixo disso fica em "outros". */
export const MIN_ARCHETYPE_DECKS = 3;

export interface ClassifyResult {
  decks: number;
  matched: number;
  newArchetypes: number;
  unclassified: number;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
  taken.add(name);
  return name;
}

/**
 * Classifica os decks recentes do formato que ainda não têm arquétipo:
 * 1. tenta encaixar cada um nos arquétipos existentes;
 * 2. agrupa os que sobraram e cria arquétipos novos para os grupos grandes o bastante;
 * 3. recalcula a assinatura e a lista representativa de cada arquétipo.
 * Deck já classificado não muda de arquétipo.
 */
export async function classifyFormat(db: Db, cards: CardDatabase, format: string): Promise<ClassifyResult> {
  const decks = await recentDecks(db, format, SIGNATURE_WINDOW_DAYS);
  const features = new Map<number, Features>(
    decks.map((d) => [d.id, deckFeatures({ name: '', main: d.main, sideboard: [], commander: [], warnings: [] }, cards)]),
  );
  const archetypes = (await listArchetypes(db, format)).map((a) => ({ id: a.id, name: a.name, features: fromSignature(a.signature) }));
  const members = new Map<number, number[]>(archetypes.map((a) => [a.id, []]));
  for (const deck of decks) {
    if (deck.archetypeId !== null) members.get(deck.archetypeId)?.push(deck.id);
  }

  const assignments: { deckId: number; archetypeId: number; score: number }[] = [];
  const pending: number[] = [];
  for (const deck of decks) {
    if (deck.archetypeId !== null) continue;
    const match = classifyDeck(features.get(deck.id)!, archetypes);
    if (match) {
      assignments.push({ deckId: deck.id, archetypeId: match.id, score: match.score });
      members.get(match.id)!.push(deck.id);
    } else {
      pending.push(deck.id);
    }
  }
  const matched = assignments.length;

  const clusters = clusterDecks(pending.map((id) => features.get(id)!)).filter((c) => c.members.length >= MIN_ARCHETYPE_DECKS);
  const taken = new Set(archetypes.map((a) => a.name));
  const signatures = [...archetypes.map((a) => a.features), ...clusters.map((c) => c.signature)];
  for (const cluster of clusters) {
    const name = uniqueName(suggestName(cluster.signature, signatures.filter((s) => s !== cluster.signature)), taken);
    const id = await createArchetype(db, format, name, toSignature(cluster.signature));
    const deckIds = cluster.members.map((index) => pending[index]!);
    members.set(id, deckIds);
    for (const deckId of deckIds) {
      assignments.push({ deckId, archetypeId: id, score: similarity(features.get(deckId)!, cluster.signature) });
    }
  }
  await assignArchetypes(db, assignments);

  // Assinatura = média das listas da janela; representativa = a lista mais próxima dessa média
  // (em caso de empate, a mais recente).
  const lastSeen = new Map(decks.map((d) => [d.id, d.lastSeen]));
  for (const [archetypeId, deckIds] of members) {
    if (deckIds.length === 0) continue;
    const signature = buildSignature(deckIds.map((id) => features.get(id)!));
    let sample = deckIds[0]!;
    let best = -1;
    for (const id of deckIds) {
      const score = similarity(features.get(id)!, signature);
      if (score > best || (score === best && lastSeen.get(id)! > lastSeen.get(sample)!)) {
        best = score;
        sample = id;
      }
    }
    await updateArchetype(db, archetypeId, toSignature(signature), sample);
  }

  const classified = decks.filter((d) => d.archetypeId !== null).length + assignments.length;
  return { decks: decks.length, matched, newArchetypes: clusters.length, unclassified: decks.length - classified };
}

export { DEFAULT_THRESHOLD };
