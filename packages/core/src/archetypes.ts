import type { CardDatabase } from './card-db.ts';
import { COLORS, type CardInfo, type Color, type Decklist } from './types.ts';

/**
 * Cartas não-terreno do main de um deck (ou a média delas em um arquétipo): nome → cópias.
 * Terrenos ficam de fora porque decks de arquétipos diferentes dividem a mesma base de mana.
 */
export type Features = Map<string, number>;

/** Assinatura de um arquétipo como é gravada no banco: nome da carta → média de cópias nas listas. */
export type Signature = Record<string, number>;

/** Similaridade mínima para um deck entrar em um arquétipo. Calibrado com listas reais do MTGO. */
export const DEFAULT_THRESHOLD = 0.4;

export function isLand(card: CardInfo): boolean {
  // Em cartas dupla-face vale a frente: "Instant // Land" é uma mágica.
  return (card.typeLine.split(' // ')[0] ?? '').includes('Land');
}

export function deckFeatures(deck: Decklist, db: CardDatabase): Features {
  const features: Features = new Map();
  for (const entry of deck.main) {
    const card = db.get(entry.name);
    if (card && isLand(card)) continue;
    const name = card?.name ?? entry.name;
    features.set(name, (features.get(name) ?? 0) + entry.quantity);
  }
  return features;
}

/** Uma cor precisa estar em pelo menos esta fração das cópias não-terreno para contar como cor do deck. */
const COLOR_SHARE = 0.1;

/**
 * Cores de um deck a partir das cartas não-terreno (nome → cópias): entram as cores presentes em
 * pelo menos 10% das cópias, para uma carta solta de outra cor não mudar a cor do deck.
 * Serve tanto para uma lista quanto para a assinatura de um arquétipo.
 */
export function deckColors(cards: Iterable<[string, number]>, db: CardDatabase): Color[] {
  const copies = new Map<Color, number>();
  let total = 0;
  for (const [name, quantity] of cards) {
    const card = db.get(name);
    if (!card || isLand(card)) continue;
    total += quantity;
    for (const color of card.colors ?? []) copies.set(color, (copies.get(color) ?? 0) + quantity);
  }
  return COLORS.filter((color) => total > 0 && (copies.get(color) ?? 0) / total >= COLOR_SHARE);
}

/** O deck cabe nas cores escolhidas? Decks incolores cabem em qualquer escolha. */
export function fitsColors(deck: readonly Color[], chosen: readonly Color[]): boolean {
  return deck.every((color) => chosen.includes(color));
}

/** Jaccard ponderada: soma dos mínimos ÷ soma dos máximos, de 0 (nada em comum) a 1 (idênticos). */
export function similarity(a: Features, b: Features): number {
  let min = 0;
  let max = 0;
  for (const [name, quantity] of a) {
    const other = b.get(name) ?? 0;
    min += Math.min(quantity, other);
    max += Math.max(quantity, other);
  }
  for (const [name, quantity] of b) {
    if (!a.has(name)) max += quantity;
  }
  return max === 0 ? 0 : min / max;
}

/** Média de cópias de cada carta entre as listas. Cartas em menos de 10% das listas são ruído e saem. */
export function buildSignature(members: readonly Features[]): Features {
  const totals = new Map<string, { copies: number; decks: number }>();
  for (const member of members) {
    for (const [name, quantity] of member) {
      const total = totals.get(name) ?? { copies: 0, decks: 0 };
      total.copies += quantity;
      total.decks += 1;
      totals.set(name, total);
    }
  }
  const signature: Features = new Map();
  for (const [name, total] of totals) {
    if (total.decks / members.length < 0.1) continue;
    signature.set(name, Math.round((total.copies / members.length) * 100) / 100);
  }
  return signature;
}

export function toSignature(features: Features): Signature {
  return Object.fromEntries([...features].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function fromSignature(signature: Signature): Features {
  return new Map(Object.entries(signature));
}

export interface ArchetypeMatch<Id> {
  id: Id;
  score: number;
}

/** Arquétipo mais parecido com o deck, ou null se nenhum passar do limite. */
export function classifyDeck<Id>(
  features: Features,
  archetypes: Iterable<{ id: Id; features: Features }>,
  threshold = DEFAULT_THRESHOLD,
): ArchetypeMatch<Id> | null {
  let best: ArchetypeMatch<Id> | null = null;
  for (const archetype of archetypes) {
    const score = similarity(features, archetype.features);
    if (score >= threshold && (!best || score > best.score)) best = { id: archetype.id, score };
  }
  return best;
}

/** Mínimo de cartas não-terreno diferentes vistas para arriscar um palpite sobre o deck do oponente. */
export const MIN_SEEN_CARDS = 3;
/** Fração mínima das cartas vistas que o arquétipo precisa explicar. */
export const PARTIAL_THRESHOLD = 0.6;

/**
 * Palpite do arquétipo a partir de uma lista parcial, como as cartas que o oponente mostrou.
 * A nota é a fração das cartas vistas que aparecem na assinatura (peso pela frequência nas listas):
 * ver 5 cartas que todo deck do arquétipo usa vale mais do que 5 que só algumas listas usam.
 */
export function classifyPartial<Id>(
  seen: Iterable<string>,
  archetypes: Iterable<{ id: Id; features: Features }>,
  threshold = PARTIAL_THRESHOLD,
): ArchetypeMatch<Id> | null {
  const names = [...new Set(seen)];
  if (names.length < MIN_SEEN_CARDS) return null;
  let best: ArchetypeMatch<Id> | null = null;
  for (const archetype of archetypes) {
    let explained = 0;
    for (const name of names) explained += Math.min(1, archetype.features.get(name) ?? 0);
    const score = explained / names.length;
    if (score >= threshold && (!best || score > best.score)) best = { id: archetype.id, score };
  }
  return best;
}

export interface Cluster {
  /** Índices dos decks na lista de entrada. */
  members: number[];
  signature: Features;
}

/**
 * Agrupa decks parecidos sem saber os arquétipos de antemão.
 * Cada deck entra no grupo mais parecido que passar do limite, ou abre um grupo novo;
 * depois os decks são redistribuídos algumas vezes contra as assinaturas já estabilizadas
 * e grupos que ficaram parecidos entre si são unidos.
 * O resultado depende da ordem de entrada, então quem chama deve passar os decks em ordem fixa.
 */
export function clusterDecks(decks: readonly Features[], threshold = DEFAULT_THRESHOLD, passes = 3): Cluster[] {
  let centers: Features[] = [];
  let assignment: number[] = [];

  for (let pass = 0; pass <= passes; pass++) {
    const next: number[] = [];
    const groups: number[][] = centers.map(() => []);
    decks.forEach((deck, index) => {
      const match = classifyDeck(deck, centers.map((features, id) => ({ id, features })), threshold);
      if (match) {
        groups[match.id]!.push(index);
        next.push(match.id);
      } else if (pass === 0) {
        // Só a primeira passada abre grupos; as seguintes apenas redistribuem.
        centers.push(new Map(deck));
        groups.push([index]);
        next.push(centers.length - 1);
      } else {
        next.push(-1);
      }
      // Na primeira passada a assinatura acompanha o grupo enquanto ele cresce.
      const group = next[index]!;
      if (pass === 0 && group >= 0) centers[group] = buildSignature(groups[group]!.map((i) => decks[i]!));
    });

    const stable = pass > 0 && next.every((group, index) => group === assignment[index]);
    assignment = next;
    centers = groups.map((members, group) => (members.length > 0 ? buildSignature(members.map((i) => decks[i]!)) : centers[group]!));
    if (stable) break;
  }

  const grouped = new Map<number, number[]>();
  assignment.forEach((group, index) => {
    if (group < 0) return;
    const members = grouped.get(group);
    if (members) members.push(index);
    else grouped.set(group, [index]);
  });
  const toCluster = (members: number[]): Cluster => ({ members, signature: buildSignature(members.map((i) => decks[i]!)) });
  const bySize = (a: Cluster, b: Cluster) => b.members.length - a.members.length || a.members[0]! - b.members[0]!;
  const clusters = [...grouped.values()].map(toCluster).sort(bySize);

  // A ordem de entrada pode abrir dois grupos para o mesmo arquétipo; grupos cujas assinaturas
  // passam do limite entre si são o mesmo arquétipo, e o menor entra no maior.
  for (let merged = true; merged; ) {
    merged = false;
    search: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (similarity(clusters[i]!.signature, clusters[j]!.signature) < threshold) continue;
        const union = [...clusters[i]!.members, ...clusters[j]!.members].sort((a, b) => a - b);
        clusters.splice(j, 1);
        clusters[i] = toCluster(union);
        clusters.sort(bySize);
        merged = true;
        break search;
      }
    }
  }
  return clusters;
}

/**
 * Nome provisório para um arquétipo novo: as cartas que mais o distinguem dos outros do formato
 * (muitas cópias aqui, poucas listas alheias). Serve até alguém dar o nome que a comunidade usa.
 */
export function suggestName(signature: Features, others: readonly Features[], cards = 2): string {
  const scored = [...signature].map(([name, copies]) => {
    const alsoIn = others.filter((other) => (other.get(name) ?? 0) >= 1).length;
    const rarity = Math.log((others.length + 2) / (alsoIn + 1));
    return { name, score: Math.min(copies, 4) * rarity };
  });
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const names = scored.slice(0, cards).map((s) => s.name.split(' // ')[0]!);
  return names.length > 0 ? names.join(' / ') : 'Sem cartas-chave';
}

/** Texto canônico da lista (main e sideboard ordenados): dois decks iguais geram a mesma chave. */
export function deckKey(deck: Decklist): string {
  const part = (entries: Decklist['main']) =>
    entries
      .map((e) => `${e.quantity} ${e.name}`)
      .sort()
      .join('\n');
  return `${part(deck.main)}\n--\n${part(deck.sideboard)}\n--\n${part(deck.commander)}`;
}
