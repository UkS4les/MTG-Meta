'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { fitsColors, FORMATS, FORMAT_KEYS, type FormatKey, type Platform, type SortBy } from '@mtg-meta/core';
import { CardImage } from '@/components/card-image';
import { CardLink } from '@/components/card-link';
import { ColorFilter } from '@/components/color-filter';
import { ColorPips } from '@/components/color-pips';
import { WantButton } from '@/components/want-button';
import { useWantedDecks } from '@/lib/wanted';
import { useColorPreference } from '@/lib/color-preference';
import type { CollectionStatus, CoverageDeck, CoverageRequest, CoverageResponse } from '@/lib/coverage';
import { integer, percent, PLATFORM_PT, RARITY_PLURAL_PT, RARITY_PT, usd, wholePercent } from '@/lib/format';
import { errorMessage, readLocalCollection } from '@/lib/local-collection';

const PLATFORMS: Platform[] = ['arena', 'paper'];

/** De onde vem a coleção de cada plataforma: da conta, do navegador ou de lugar nenhum. */
type Source = { kind: 'account' } | { kind: 'browser'; text: string } | { kind: 'none' };
type Sources = Record<Platform, Source>;

type State = { status: 'loading' } | { status: 'empty' } | { status: 'error'; message: string } | { status: 'ready'; data: CoverageResponse };

function effort(deck: CoverageDeck, platform: Platform): string {
  if (deck.missingCopies === 0) return 'Completo';
  const copies = `Faltam ${integer(deck.missingCopies)} ${deck.missingCopies === 1 ? 'cópia' : 'cópias'}`;
  if (platform === 'paper') {
    return `${copies} · ${usd(deck.costUsd)}${deck.unpricedMissing.length > 0 ? ' + cartas sem preço' : ''}`;
  }
  if (deck.notOnArena.length > 0) return `${copies} · tem cartas que não existem no Arena`;
  const wildcards = (['mythic', 'rare', 'uncommon', 'common'] as const)
    .filter((rarity) => deck.wildcards[rarity] > 0)
    .map((rarity) => `${deck.wildcards[rarity]} ${deck.wildcards[rarity] === 1 ? RARITY_PT[rarity] : RARITY_PLURAL_PT[rarity]}`);
  return `${copies} · curingas: ${wildcards.join(', ')}`;
}

function DeckRow({ deck, format, platform, index, dim, wanted }: { deck: CoverageDeck; format: FormatKey; platform: Platform; index: number; dim: boolean; wanted: boolean }) {
  const whole = Math.floor(deck.coverage * 100);
  const level = whole >= 100 ? 'full' : whole >= 70 ? 'high' : whole >= 35 ? 'mid' : 'low';
  return (
    <details className={`deck-row with-thumbs level-${level}${dim ? ' dim' : ''}`} style={{ '--i': Math.min(index, 16), '--p': whole } as CSSProperties}>
      <summary>
        <span className="thumbs" aria-hidden="true">
          {deck.cards.map((card) => (
            <CardImage key={card.name} name="" imageId={card.imageId} size="small" />
          ))}
        </span>
        <span className="deck-name">
          {wanted && (
            <span className="want-star" role="img" aria-label="Quero montar">
              ★
            </span>
          )}
          {deck.name}
          <ColorPips colors={deck.colors} />
          <span className="tag">{percent(deck.share)} do meta</span>
        </span>
        <span className="coverage ring">
          <span>{wholePercent(whole / 100)}</span>
        </span>
        <span className="effort">{effort(deck, platform)}</span>
      </summary>
      <div className="details">
        {deck.missing.length === 0 ? (
          <p>Você já tem todas as cartas desta lista.</p>
        ) : (
          <ul className="missing">
            {deck.missing.map((card) => (
              <li key={card.name}>
                <span className="num">{card.missing}×</span>
                <span>
                  <CardLink name={card.name} imageId={card.imageId} />{' '}
                  {card.rarity && <span className={`small rarity-${card.rarity}`}>{RARITY_PT[card.rarity]}</span>}
                  {platform === 'arena' && deck.notOnArena.includes(card.name) && <span className="tag">não existe no Arena</span>}
                  {platform === 'paper' && (
                    <span className="small muted"> · {card.unitPriceUsd === null ? 'sem preço' : `${usd(card.unitPriceUsd)} cada`}</span>
                  )}
                </span>
                <span className="have small">
                  tem {card.owned} de {card.needed}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="actions small">
          <WantButton deck={{ id: deck.archetypeId, format, name: deck.name }} />
          <Link href={`/meta/${format}/${deck.archetypeId}`}>Ver a lista completa →</Link>
        </p>
      </div>
    </details>
  );
}

export function BuildableDecks({ initialFormat, initialPlatform }: { initialFormat: FormatKey; initialPlatform: Platform | null }) {
  const [format, setFormat] = useState<FormatKey>(initialFormat);
  const [platform, setPlatform] = useState<Platform | null>(initialPlatform);
  const [sortBy, setSortBy] = useState<SortBy>('coverage');
  const [sources, setSources] = useState<Sources | null>(null);
  const [state, setState] = useState<State>({ status: 'loading' });

  // Descobre onde está a coleção de cada plataforma e, se a URL não escolheu, abre na que tem coleção.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let status: CollectionStatus = { loggedIn: false, saved: [] };
      try {
        const response = await fetch('/api/colecao');
        if (response.ok) status = (await response.json()) as CollectionStatus;
      } catch {
        // Sem resposta do servidor ainda dá para tentar com a coleção do navegador.
      }
      if (cancelled) return;
      const sourceFor = (p: Platform): Source => {
        if (status.saved.some((s) => s.platform === p)) return { kind: 'account' };
        const text = readLocalCollection(p);
        return text ? { kind: 'browser', text } : { kind: 'none' };
      };
      const found: Sources = { arena: sourceFor('arena'), paper: sourceFor('paper') };
      setSources(found);
      setPlatform((current) => current ?? PLATFORMS.find((p) => found[p].kind !== 'none') ?? 'arena');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sources || !platform) return;
    const source = sources[platform];
    if (source.kind === 'none') {
      setState({ status: 'empty' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const body: CoverageRequest = { formato: format, plataforma: platform, ordenar: sortBy, colecao: source.kind === 'browser' ? source.text : undefined };
    fetch('/api/cobertura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) setState({ status: 'error', message: await errorMessage(response) });
        else setState({ status: 'ready', data: (await response.json()) as CoverageResponse });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error', message: 'Não consegui falar com o servidor. Verifique a conexão e tente de novo.' });
      });
    return () => controller.abort();
  }, [sources, platform, format, sortBy]);

  const shown = platform ?? 'arena';
  const [preference, setPreference] = useColorPreference();
  const decks = state.status === 'ready' ? state.data.decks : [];
  const fits = (deck: CoverageDeck) => fitsColors(deck.colors, preference.colors);
  const filtering = preference.colors.length > 0;
  const { wanted, isWanted } = useWantedDecks();
  const [onlyWanted, setOnlyWanted] = useState(false);
  const wantedHere = decks.filter((deck) => isWanted(deck.archetypeId)).length;
  const visible = decks.filter((deck) => (!filtering || !preference.only || fits(deck)) && (!onlyWanted || wantedHere === 0 || isWanted(deck.archetypeId)));

  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Plataforma">
          {PLATFORMS.map((p) => (
            <button key={p} type="button" aria-pressed={p === shown} onClick={() => setPlatform(p)}>
              {PLATFORM_PT[p]}
            </button>
          ))}
        </div>
        <div className="tabs" role="group" aria-label="Formato">
          {FORMAT_KEYS.map((key) => (
            <button key={key} type="button" aria-pressed={key === format} onClick={() => setFormat(key)}>
              {FORMATS[key]}
            </button>
          ))}
        </div>
        <div className="tabs" role="group" aria-label="Ordenar por">
          <button type="button" aria-pressed={sortBy === 'coverage'} onClick={() => setSortBy('coverage')}>
            Mais completos
          </button>
          <button type="button" aria-pressed={sortBy === 'cost'} onClick={() => setSortBy('cost')}>
            {shown === 'arena' ? 'Menos curingas' : 'Mais baratos'}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <div role="status">
            <span className="sr-only">Calculando…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" aria-hidden="true" />
            ))}
          </div>
        )}
        {state.status === 'error' && <p className="error">{state.message}</p>}
        {state.status === 'empty' && (
          <div className="card">
            <p>Você ainda não importou uma coleção de {PLATFORM_PT[shown]}.</p>
            <div className="actions">
              <Link href="/colecao" className="button">
                Importar coleção
              </Link>
            </div>
          </div>
        )}
        {state.status === 'ready' && (
          <>
            <p className="small muted">
              Coleção de {PLATFORM_PT[shown]}: {integer(state.data.collection.copies)} cópias de {integer(state.data.collection.cards)} cartas (
              {state.data.collection.saved ? 'salva na conta' : 'guardada neste navegador'}) · <Link href="/colecao">trocar</Link>
            </p>
            {shown === 'arena' && (format === 'modern' || format === 'pauper') && (
              <p className="notice">
                O Arena não tem {FORMATS[format]}. As listas aparecem, mas as que usam cartas fora do Arena não podem ser montadas lá e ficam no
                fim.
              </p>
            )}
            {state.data.decks.length > 0 && (
              <ColorFilter preference={preference} onChange={setPreference} matching={decks.filter(fits).length} total={decks.length} />
            )}
            {wantedHere > 0 && (
              <label className="check">
                <input type="checkbox" checked={onlyWanted} onChange={(event) => setOnlyWanted(event.target.checked)} />
                <span className="want-star" aria-hidden="true">
                  ★
                </span>
                Mostrar só os que eu quero montar ({wantedHere})
              </label>
            )}
            {wanted.length === 0 && state.data.decks.length > 0 && (
              <p className="small muted">Abra um deck e marque-o como objetivo para acompanhar só os que você quer montar.</p>
            )}
            {state.data.decks.length === 0 ? (
              <div className="card">
                <p>Ainda não há arquétipos de {FORMATS[format]} no banco.</p>
              </div>
            ) : (
              visible.map((deck, index) => (
                <DeckRow key={deck.archetypeId} deck={deck} format={format} platform={shown} index={index} dim={filtering && !fits(deck)} wanted={isWanted(deck.archetypeId)} />
              ))
            )}
            {filtering && preference.only && visible.length === 0 && decks.length > 0 && (
              <p className="muted">Nenhum arquétipo deste formato cabe só nas cores escolhidas.</p>
            )}
            {shown === 'paper' && <p className="small muted">Preços em dólar da impressão mais barata no Scryfall, atualizados uma vez por dia.</p>}
          </>
        )}
      </div>
    </>
  );
}
