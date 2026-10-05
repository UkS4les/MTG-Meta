'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { FORMATS, FORMAT_KEYS, formatDecklist, type DeckEntry, type Platform } from '@mtg-meta/core';
import { CardImage } from '@/components/card-image';
import { ColorPips } from '@/components/color-pips';
import { CopyButton } from '@/components/copy-button';
import type { CardSuggestion } from '@/lib/cards-shared';
import type { CollectionStatus } from '@/lib/coverage';
import { LOCAL_DECKS_KEY, MAX_DECK_NAME, type AnalyzeRequest, type DeckAnalysis, type DeckInput, type DecksStatus, type SavedDeck } from '@/lib/decks-shared';
import { integer, PLATFORM_PT, RARITY_PLURAL_PT, RARITY_PT, usd, wholePercent } from '@/lib/format';
import { errorMessage, readLocalCollection } from '@/lib/local-collection';
import { useWantedDecks } from '@/lib/wanted';

type Board = 'main' | 'sideboard';
const BOARD_PT: Record<Board, string> = { main: 'Main', sideboard: 'Sideboard' };
const PLATFORMS: Platform[] = ['arena', 'paper'];
const SERVER_DOWN = 'Não consegui falar com o servidor. Verifique a conexão e tente de novo.';

interface Draft extends DeckInput {
  /** null = deck novo, ainda não salvo. */
  id: string | null;
}

const EMPTY: Draft = { id: null, name: '', format: null, main: [], sideboard: [] };
const count = (entries: DeckEntry[]) => entries.reduce((total, entry) => total + entry.quantity, 0);

function readLocalDecks(): SavedDeck[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(LOCAL_DECKS_KEY) ?? '[]');
    return Array.isArray(stored) ? (stored as SavedDeck[]) : [];
  } catch {
    return [];
  }
}

/** Devolve false se o navegador recusou guardar. */
function writeLocalDecks(decks: SavedDeck[]): boolean {
  try {
    window.localStorage.setItem(LOCAL_DECKS_KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

function effort(coverage: NonNullable<DeckAnalysis['coverage']>, platform: Platform): string {
  if (coverage.missingCopies === 0) return 'Você já tem todas as cartas.';
  const copies = `Faltam ${integer(coverage.missingCopies)} ${coverage.missingCopies === 1 ? 'cópia' : 'cópias'}`;
  if (platform === 'paper') return `${copies} · ${usd(coverage.costUsd)}${coverage.unpriced > 0 ? ' + cartas sem preço' : ''}`;
  if (coverage.notOnArena.length > 0) return `${copies} · ${coverage.notOnArena.length === 1 ? 'uma carta não existe' : `${coverage.notOnArena.length} cartas não existem`} no Arena`;
  const wildcards = (['mythic', 'rare', 'uncommon', 'common'] as const)
    .filter((rarity) => coverage.wildcards[rarity] > 0)
    .map((rarity) => `${coverage.wildcards[rarity]} ${coverage.wildcards[rarity] === 1 ? RARITY_PT[rarity] : RARITY_PLURAL_PT[rarity]}`);
  return `${copies} · curingas: ${wildcards.join(', ')}`;
}

function DeckCard({ deck, index, onOpen }: { deck: SavedDeck; index: number; onOpen: () => void }) {
  return (
    <button type="button" className="deck-card" style={{ '--i': Math.min(index, 20) } as CSSProperties} onClick={onOpen}>
      <CardImage name="" imageId={deck.cover?.imageId ?? null} size="small" />
      <span className="deck-card-text">
        <strong>{deck.name}</strong>
        <ColorPips colors={deck.colors} />
        <span className="small muted">
          {deck.format && FORMATS[deck.format as keyof typeof FORMATS] ? `${FORMATS[deck.format as keyof typeof FORMATS]} · ` : ''}
          {count(deck.main)} cartas{deck.sideboard.length > 0 ? ` + ${count(deck.sideboard)} no sideboard` : ''}
        </span>
      </span>
    </button>
  );
}

export function DeckBuilder() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [starters, setStarters] = useState<SavedDeck[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [platform, setPlatform] = useState<Platform>('arena');
  const [browserCollections, setBrowserCollections] = useState<Partial<Record<Platform, string>>>({});
  const [analysis, setAnalysis] = useState<DeckAnalysis | null>(null);
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [target, setTarget] = useState<Board>('main');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const { wanted, toggle: toggleWanted } = useWantedDecks();

  // Decks salvos e de onde vem a coleção de cada plataforma (conta ou navegador).
  useEffect(() => {
    (async () => {
      let logged = false;
      try {
        const response = await fetch('/api/decks');
        if (response.ok) {
          const status = (await response.json()) as DecksStatus;
          logged = status.loggedIn;
          if (logged) setDecks(status.decks);
          setStarters(status.starters);
        }
      } catch {
        // Sem servidor ainda dá para ver os decks guardados no navegador.
      }
      if (!logged) setDecks(readLocalDecks());
      setLoggedIn(logged);

      let saved: Platform[] = [];
      try {
        const response = await fetch('/api/colecao');
        if (response.ok) saved = ((await response.json()) as CollectionStatus).saved.map((s) => s.platform);
      } catch {
        // Sem a coleção o editor funciona, só não mostra a cobertura.
      }
      const local: Partial<Record<Platform, string>> = {};
      for (const p of PLATFORMS) {
        const text = saved.includes(p) ? null : readLocalCollection(p);
        if (text) local[p] = text;
      }
      setBrowserCollections(local);
      if (!saved.includes('arena') && !local.arena && (saved.includes('paper') || local.paper)) setPlatform('paper');
    })();
  }, []);

  const remember = (cards: { name: string; imageId: string | null }[]) =>
    setImages((current) => {
      const next = { ...current };
      for (const card of cards) next[card.name] = card.imageId;
      return next;
    });

  async function analyze(body: AnalyzeRequest, signal?: AbortSignal): Promise<DeckAnalysis | null> {
    const response = await fetch('/api/decks/analisar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) {
      setError(await errorMessage(response));
      return null;
    }
    const result = (await response.json()) as DeckAnalysis;
    remember([...result.main, ...result.sideboard]);
    return result;
  }

  // Reanalisa a lista pouco depois de cada mudança, para não disparar um pedido por clique.
  const draftKey = draft ? JSON.stringify([draft.main, draft.sideboard, draft.format]) : null;
  useEffect(() => {
    if (!draft) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      analyze({ main: draft.main, sideboard: draft.sideboard, formato: draft.format, plataforma: platform, colecao: browserCollections[platform] }, controller.signal)
        .then((result) => result && setAnalysis(result))
        .catch(() => {
          // Pedido cancelado por uma mudança mais nova, ou servidor fora do ar: a lista em edição continua intacta.
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, platform, browserCollections]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/cartas?q=${encodeURIComponent(text)}`, { signal: controller.signal })
        .then(async (response) => response.ok && setSuggestions((await response.json()) as CardSuggestion[]))
        .catch(() => {
          // Busca cancelada pela digitação seguinte.
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function open(next: Draft) {
    setDraft(next);
    setAnalysis(null);
    setError(null);
    setNote(null);
    setQuery('');
    setPasted('');
    window.scrollTo({ top: 0 });
  }

  function change(board: Board, name: string, delta: number) {
    setNote(null);
    setDraft((current) => {
      if (!current) return current;
      const list = current[board];
      const existing = list.find((entry) => entry.name === name);
      const quantity = (existing?.quantity ?? 0) + delta;
      const next = quantity <= 0 ? list.filter((entry) => entry.name !== name) : existing ? list.map((entry) => (entry.name === name ? { ...entry, quantity } : entry)) : [...list, { name, quantity }];
      return { ...current, [board]: next };
    });
  }

  function add(card: CardSuggestion) {
    remember([card]);
    change(target, card.name, 1);
    setQuery('');
    setSuggestions([]);
    searchInput.current?.focus();
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && suggestions[0]) {
      event.preventDefault();
      add(suggestions[0]);
    }
    if (event.key === 'Escape') setQuery('');
  }

  async function importPasted() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const result = await analyze({ texto: pasted, formato: draft.format, plataforma: platform, colecao: browserCollections[platform] });
      if (!result) return;
      if (result.main.length === 0) {
        setError('Não reconheci nenhuma carta nesse texto. Use linhas como "4 Lightning Bolt", com o sideboard depois de uma linha em branco.');
        return;
      }
      const toEntries = (cards: DeckAnalysis['main']) => cards.map((card) => ({ name: card.name, quantity: card.quantity }));
      setDraft({ ...draft, main: toEntries(result.main), sideboard: toEntries(result.sideboard) });
      setAnalysis(result);
      setPasted('');
      setNote(`Lista importada: ${count(toEntries(result.main))} cartas no main${result.ignoredLines > 0 ? `, ${result.ignoredLines} linha(s) ignorada(s)` : ''}.`);
    } catch {
      setError(SERVER_DOWN);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setError('Dê um nome ao deck.');
    if (draft.main.length === 0) return setError('O deck está vazio: adicione pelo menos uma carta.');
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const input: DeckInput = { name, format: draft.format, main: draft.main, sideboard: draft.sideboard };
      if (loggedIn) {
        const response = await fetch(draft.id ? `/api/decks/${draft.id}` : '/api/decks', {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          setError(await errorMessage(response));
          return;
        }
        const saved = (await response.json()) as SavedDeck;
        setDecks((current) => [saved, ...current.filter((deck) => deck.id !== saved.id)]);
        setDraft({ ...draft, id: saved.id, name });
        setNote('Deck salvo na sua conta.');
      } else {
        const saved: SavedDeck = { ...input, id: draft.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString(), colors: analysis?.colors ?? [], cover: analysis?.cover ?? null };
        const all = [saved, ...readLocalDecks().filter((deck) => deck.id !== saved.id)];
        if (!writeLocalDecks(all)) {
          setError('O navegador não deixou guardar o deck. Crie uma conta para salvá-lo.');
          return;
        }
        setDecks(all);
        setDraft({ ...draft, id: saved.id, name });
        setNote('Deck guardado neste navegador.');
      }
    } catch {
      setError(SERVER_DOWN);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Apagar o deck "${draft.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (loggedIn) {
        const response = await fetch(`/api/decks/${draft.id}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          setError(await errorMessage(response));
          return;
        }
        setDecks((current) => current.filter((deck) => deck.id !== draft.id));
      } else {
        const all = readLocalDecks().filter((deck) => deck.id !== draft.id);
        writeLocalDecks(all);
        setDecks(all);
      }
      setDraft(null);
    } catch {
      setError(SERVER_DOWN);
    } finally {
      setBusy(false);
    }
  }

  const owned = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const card of [...(analysis?.main ?? []), ...(analysis?.sideboard ?? [])]) map.set(card.name, card.owned);
    return map;
  }, [analysis]);

  // ---------- Lista de decks ----------
  if (!draft) {
    return (
      <>
        <h1>Meus decks</h1>
        <p className="muted">Monte seus decks buscando cartas ou colando uma lista, e veja as cores, o arquétipo parecido no meta e quanto da sua coleção já cobre.</p>
        {loggedIn === false && (
          <p className="notice">
            Sem conta, os decks ficam guardados só neste navegador. <Link href="/entrar">Entre</Link> ou <Link href="/cadastro">crie uma conta</Link> para
            salvar e usar em outros aparelhos.
          </p>
        )}
        <div className="actions">
          <button type="button" className="button" onClick={() => open(EMPTY)}>
            Criar deck
          </button>
        </div>
        {loggedIn !== null && decks.length === 0 && <p className="muted">Você ainda não criou nenhum deck.</p>}
        <div className="deck-cards">
          {decks.map((deck, index) => (
            <DeckCard key={deck.id} deck={deck} index={index} onOpen={() => open({ id: deck.id, name: deck.name, format: deck.format, main: deck.main, sideboard: deck.sideboard })} />
          ))}
        </div>

        {starters.length > 0 && (
          <>
            <h2>Decks iniciais do Arena</h2>
            <p className="muted small">
              Os 15 decks que o Arena dá a todo jogador. Abrir um deles cria uma cópia sua, com as cartas em imagem e a cobertura da sua coleção; o
              original não muda.
            </p>
            <div className="deck-cards">
              {starters.map((deck, index) => (
                // id nulo: o editor trata como deck novo, e salvar cria uma cópia em "Meus decks".
                <DeckCard key={deck.id} deck={deck} index={index} onOpen={() => open({ id: null, name: deck.name, format: deck.format, main: deck.main, sideboard: deck.sideboard })} />
              ))}
            </div>
          </>
        )}

        <h2>Decks do meta que eu quero montar</h2>
        {wanted.length === 0 ? (
          <p className="muted small">
            Nenhum ainda. Abra um arquétipo no <Link href="/meta/standard">meta</Link> ou em <Link href="/montar">O que posso montar</Link> e clique em
            “Marcar como objetivo”.
          </p>
        ) : (
          <>
            <ul className="wanted-list">
              {wanted.map((deck) => (
                <li key={deck.id}>
                  <span className="want-star" aria-hidden="true">
                    ★
                  </span>
                  <Link href={`/meta/${deck.format}/${deck.id}`}>{deck.name}</Link>
                  <span className="tag">{FORMATS[deck.format as keyof typeof FORMATS] ?? deck.format}</span>
                  <button type="button" className="link-button small" onClick={() => toggleWanted(deck)}>
                    tirar
                  </button>
                </li>
              ))}
            </ul>
            <p className="small">
              <Link href="/montar">Ver quanto falta para cada um →</Link>
            </p>
          </>
        )}
      </>
    );
  }

  // ---------- Editor ----------
  const hasCollection = analysis?.coverage != null;
  const percentOwned = analysis?.coverage ? Math.floor(analysis.coverage.coverage * 100) : 0;
  const level = percentOwned >= 100 ? 'full' : percentOwned >= 70 ? 'high' : percentOwned >= 35 ? 'mid' : 'low';

  const board = (which: Board) => {
    const entries = draft[which];
    return (
      <>
        <h2>
          {BOARD_PT[which]} <span className="muted small">({count(entries)})</span>
        </h2>
        {entries.length === 0 ? (
          <p className="muted small">{which === 'main' ? 'Busque uma carta acima ou cole uma lista para começar.' : 'Vazio. Escolha "Sideboard" na busca para adicionar cartas aqui.'}</p>
        ) : (
          <div className="card-grid editing">
            {entries.map((entry, index) => {
              const have = owned.get(entry.name);
              const short = have != null && have < entry.quantity ? entry.quantity - have : 0;
              return (
                <div key={entry.name} className={`card-tile${short > 0 ? ' short' : ''}`} style={{ '--i': Math.min(index, 30) } as CSSProperties}>
                  <CardImage name={entry.name} imageId={images[entry.name] ?? null} />
                  <span className="qty-badge">{entry.quantity}×</span>
                  {short > 0 && <span className="short-badge">{short === 1 ? 'falta 1' : `faltam ${short}`}</span>}
                  <span className="tile-controls">
                    <button type="button" aria-label={`Tirar uma cópia de ${entry.name}`} onClick={() => change(which, entry.name, -1)}>
                      −
                    </button>
                    <button type="button" aria-label={`Mais uma cópia de ${entry.name}`} onClick={() => change(which, entry.name, 1)}>
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <p className="small">
        <button type="button" className="link-button" onClick={() => setDraft(null)}>
          ← Meus decks
        </button>
      </p>
      <h1>{draft.id ? 'Editar deck' : 'Novo deck'}</h1>

      <div className="card builder-head">
        <div>
          <label htmlFor="nome">Nome</label>
          <input id="nome" type="text" value={draft.name} maxLength={MAX_DECK_NAME} placeholder="Ex.: Gruul Aggro" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div>
          <label htmlFor="formato">Formato</label>
          <select id="formato" value={draft.format ?? ''} onChange={(event) => setDraft({ ...draft, format: event.target.value || null })}>
            <option value="">Sem formato</option>
            {FORMAT_KEYS.map((key) => (
              <option key={key} value={key}>
                {FORMATS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card deck-summary">
        {hasCollection && analysis?.coverage ? (
          <span className={`ring level-${level}`} style={{ '--p': percentOwned } as CSSProperties}>
            <span>{wholePercent(percentOwned / 100)}</span>
          </span>
        ) : null}
        <div className="deck-summary-text">
          <strong>
            {draft.name.trim() || 'Deck sem nome'} <ColorPips colors={analysis?.colors ?? []} />
          </strong>
          <span className="small muted">
            {count(draft.main)} no main · {count(draft.sideboard)} no sideboard
            {analysis?.archetype && (
              <>
                {' · parecido com '}
                <Link href={`/meta/${analysis.archetype.format}/${analysis.archetype.id}`}>{analysis.archetype.name}</Link>
              </>
            )}
          </span>
          {analysis?.coverage ? (
            <span className="small">{effort(analysis.coverage, platform)}</span>
          ) : (
            analysis && (
              <span className="small muted">
                <Link href="/colecao">Importe sua coleção de {PLATFORM_PT[platform]}</Link> para ver quanto dela cobre este deck.
              </span>
            )
          )}
          {analysis && analysis.unknown.length > 0 && (
            <span className="small error">
              {analysis.unknown.length === 1 ? 'Nome não reconhecido' : 'Nomes não reconhecidos'}: {analysis.unknown.slice(0, 6).join(', ')}
              {analysis.unknown.length > 6 ? '…' : ''}
            </span>
          )}
        </div>
        <div className="tabs" role="group" aria-label="Comparar com a coleção de">
          {PLATFORMS.map((p) => (
            <button key={p} type="button" aria-pressed={p === platform} onClick={() => setPlatform(p)}>
              {PLATFORM_PT[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="search-row">
          <div className="search-box">
            <label htmlFor="busca">Adicionar carta</label>
            <input
              ref={searchInput}
              id="busca"
              type="search"
              value={query}
              placeholder="Digite o nome da carta (em inglês)"
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="sugestoes"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKey}
            />
            {suggestions.length > 0 && (
              <ul id="sugestoes" className="suggestions" role="listbox">
                {suggestions.map((card) => (
                  <li key={card.name} role="option" aria-selected={false}>
                    <button type="button" onClick={() => add(card)}>
                      <CardImage name="" imageId={card.imageId} size="small" />
                      <span>
                        <strong>{card.name}</strong> <ColorPips colors={card.colors} />
                        <span className="small muted">{card.typeLine}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="tabs" role="group" aria-label="Adicionar em">
            {(['main', 'sideboard'] as const).map((b) => (
              <button key={b} type="button" aria-pressed={b === target} onClick={() => setTarget(b)}>
                {BOARD_PT[b]}
              </button>
            ))}
          </div>
        </div>
        <details className="help">
          <summary>Ou cole uma lista pronta</summary>
          <label htmlFor="colar" className="sr-only">
            Decklist
          </label>
          <textarea id="colar" value={pasted} spellCheck={false} placeholder={'4 Lightning Bolt\n20 Mountain\n\n2 Smash to Smithereens'} onChange={(event) => setPasted(event.target.value)} />
          <div className="actions">
            <button type="button" className="button secondary" onClick={importPasted} disabled={busy || pasted.trim() === ''}>
              {draft.main.length > 0 ? 'Substituir o deck por esta lista' : 'Importar lista'}
            </button>
          </div>
        </details>
      </div>

      {board('main')}
      {board('sideboard')}

      <div className="actions sticky-actions">
        <button type="button" className="button" onClick={save} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar deck'}
        </button>
        {draft.main.length > 0 && <CopyButton text={formatDecklist({ name: draft.name, main: draft.main, sideboard: draft.sideboard, commander: [], warnings: [] })} label="Copiar lista (Arena e MTGO)" />}
        {draft.id && (
          <button type="button" className="link-button" onClick={remove} disabled={busy}>
            Apagar deck
          </button>
        )}
        <span aria-live="polite">
          {error && <span className="error">{error}</span>}
          {note && <span className="ok">{note}</span>}
        </span>
      </div>
    </>
  );
}
