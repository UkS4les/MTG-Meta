'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { describeQueue, parseArenaLog, winRate, winRateBy, type ArenaMatch, type MatchResult, type WinRate, type WinRateGroup } from '@mtg-meta/core';
import { integer, wholePercent } from '@/lib/format';
import { errorMessage } from '@/lib/local-collection';
import { LOCAL_MATCHES_KEY, type MatchRecord, type MatchesRequest, type MatchesResponse, type MatchesStatus } from '@/lib/matches-shared';

const RESULT_PT: Record<MatchResult, string> = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' };
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
const SERVER_DOWN = 'Não consegui falar com o servidor. Verifique a conexão e tente de novo.';

function readLocal(): MatchRecord[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(LOCAL_MATCHES_KEY) ?? '[]');
    return Array.isArray(stored) ? (stored as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

/** Devolve false se o navegador recusou guardar. */
function writeLocal(matches: MatchRecord[]): boolean {
  try {
    if (matches.length === 0) window.localStorage.removeItem(LOCAL_MATCHES_KEY);
    else window.localStorage.setItem(LOCAL_MATCHES_KEY, JSON.stringify(matches));
    return true;
  } catch {
    return false;
  }
}

function byDate(a: MatchRecord, b: MatchRecord): number {
  if (a.startedAt === b.startedAt) return a.id.localeCompare(b.id);
  if (a.startedAt === null) return 1;
  if (b.startedAt === null) return -1;
  return b.startedAt.localeCompare(a.startedAt);
}

const record = (rate: WinRate) => `${rate.wins}–${rate.losses}${rate.draws > 0 ? `–${rate.draws}` : ''}`;
const range = (rate: WinRate) => (rate.low === null || rate.high === null ? '' : `entre ${wholePercent(rate.low)} e ${wholePercent(rate.high)}`);

function Tile({ label, rate, hint }: { label: string; rate: WinRate; hint?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{rate.rate === null ? '—' : wholePercent(rate.rate)}</span>
      <span className="small muted">
        {record(rate)}
        {rate.rate !== null && ` · ${range(rate)}`}
      </span>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

function RateTable({ title, hint, column, groups }: { title: string; hint?: string; column: string; groups: WinRateGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <>
      <h2>{title}</h2>
      {hint && <p className="small muted">{hint}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{column}</th>
              <th className="num">Partidas</th>
              <th className="num">V–D</th>
              <th className="num">Vitórias</th>
              <th aria-hidden="true" />
              <th className="num">Margem</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => (
              <tr key={group.key} style={{ '--i': Math.min(index, 24) } as CSSProperties}>
                <td>{group.key}</td>
                <td className="num">{integer(group.matches)}</td>
                <td className="num">{record(group)}</td>
                <td className="num">{group.rate === null ? '—' : wholePercent(group.rate)}</td>
                <td className="bar-cell" aria-hidden="true">
                  <div className="bar">
                    <span style={{ width: `${(group.rate ?? 0) * 100}%` }} />
                  </div>
                </td>
                <td className="num small muted">{group.low === null || group.high === null ? '—' : `${wholePercent(group.low)}–${wholePercent(group.high)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MatchRow({ match, index }: { match: MatchRecord; index: number }) {
  const queue = describeQueue(match.eventId);
  const guess = match.opponentArchetype;
  return (
    <details className={`deck-row match-row result-${match.result}`} style={{ '--i': Math.min(index, 16) } as CSSProperties}>
      <summary>
        <span className="deck-name">
          <span className={`badge ${match.result}`}>{RESULT_PT[match.result]}</span>
          {match.deckName ?? 'Deck desconhecido'}
          {match.deckArchetype && <span className="tag">{match.deckArchetype.name}</span>}
        </span>
        <span className="score">
          {match.gamesWon}–{match.gamesLost}
        </span>
        <span className="effort">
          {queue.label}
          {match.onPlay !== null && ` · ${match.onPlay ? 'jogou primeiro' : 'comprou primeiro'}`}
          {guess && ` · contra ${guess.name}`}
          {match.startedAt && ` · ${dateTime.format(new Date(match.startedAt))}`}
        </span>
      </summary>
      <div className="details">
        {guess && (
          <p>
            Deck do oponente: <Link href={`/meta/${guess.format}/${guess.id}`}>{guess.name}</Link>{' '}
            <span className="small muted">(palpite: {wholePercent(guess.confidence)} das cartas vistas batem com o arquétipo)</span>
          </p>
        )}
        {match.opponentCards.length === 0 ? (
          <p className="muted">O log não mostrou cartas do oponente nesta partida.</p>
        ) : (
          <>
            <p className="small muted">Cartas que o oponente mostrou ({match.opponentCards.length})</p>
            <p>{match.opponentCards.join(' · ')}</p>
          </>
        )}
      </div>
    </details>
  );
}

interface ImportNote {
  read: number;
  added: number | null;
  saved: boolean;
  keptLocally: boolean;
  detailedOff: boolean;
  unfinished: number;
  unresolved: number;
}

export function MatchTracker() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<ImportNote | null>(null);
  const [shown, setShown] = useState(20);
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const response = await fetch('/api/partidas');
      if (!response.ok) throw new Error();
      const status = (await response.json()) as MatchesStatus;
      setLoggedIn(status.loggedIn);
      setMatches(status.loggedIn ? status.partidas : readLocal().sort(byDate));
    } catch {
      // Sem servidor ainda dá para ver o que está guardado no navegador.
      setLoggedIn(false);
      setMatches(readLocal().sort(byDate));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Com conta, as partidas podem chegar pelo tracker enquanto a página está aberta: confere de tempos em tempos.
  useEffect(() => {
    if (!loggedIn) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 20_000);
    return () => clearInterval(timer);
  }, [loggedIn]);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const parsed = new Map<string, ArenaMatch>();
      let detailedOff = false;
      let unfinished = 0;
      let unresolved = 0;
      for (const file of files) {
        const result = parseArenaLog(await file.text());
        for (const match of result.matches) parsed.set(match.id, match);
        detailedOff ||= result.detailedLogs === false;
        unfinished += result.unfinished;
        unresolved += result.unresolved;
      }

      const summary: ImportNote = { read: parsed.size, added: null, saved: false, keptLocally: false, detailedOff, unfinished, unresolved };
      if (parsed.size > 0) {
        const body: MatchesRequest = { partidas: [...parsed.values()] };
        const response = await fetch('/api/partidas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) {
          setError(await errorMessage(response));
          return;
        }
        const data = (await response.json()) as MatchesResponse;
        summary.saved = data.saved;
        if (data.saved) {
          summary.added = data.added;
          await load();
        } else {
          // Sem conta, junta com o que já estava no navegador; a leitura nova vale sobre a antiga.
          const merged = new Map(readLocal().map((m) => [m.id, m]));
          const before = merged.size;
          for (const match of data.partidas) merged.set(match.id, match);
          summary.added = merged.size - before;
          const all = [...merged.values()].sort(byDate);
          summary.keptLocally = writeLocal(all);
          setMatches(all);
        }
      }
      setNote(summary);
    } catch {
      setError(SERVER_DOWN);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function clear() {
    if (!window.confirm(`Apagar as ${matches.length} partidas ${loggedIn ? 'salvas na sua conta' : 'guardadas neste navegador'}?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (loggedIn) {
        const response = await fetch('/api/partidas', { method: 'DELETE' });
        if (!response.ok) {
          setError(await errorMessage(response));
          return;
        }
      } else {
        writeLocal([]);
      }
      setMatches([]);
      setNote(null);
    } catch {
      setError(SERVER_DOWN);
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const results = (list: MatchRecord[]) => list.map((m) => m.result);
    return {
      overall: winRate(results(matches)),
      onPlay: winRate(results(matches.filter((m) => m.onPlay === true))),
      onDraw: winRate(results(matches.filter((m) => m.onPlay === false))),
      byDeck: winRateBy(matches, (m) => m.deckName ?? 'Deck desconhecido'),
      byQueue: winRateBy(matches, (m) => describeQueue(m.eventId).label),
      byOpponent: winRateBy(matches, (m) => m.opponentArchetype?.name ?? null),
    };
  }, [matches]);

  return (
    <>
      {loggedIn === false && (
        <p className="notice">
          Sem conta, as partidas ficam guardadas só neste navegador. <Link href="/entrar">Entre</Link> ou <Link href="/cadastro">crie uma conta</Link>{' '}
          para salvar o histórico.
        </p>
      )}

      <div className="card">
        <label htmlFor="log">Enviar o log do Arena (Player.log e Player-prev.log)</label>
        <input ref={fileInput} id="log" type="file" accept=".log,.txt,text/plain" multiple onChange={onFiles} disabled={busy} />
        <details className="help">
          <summary>Onde fica o arquivo e o que precisa estar ligado</summary>
          <ol>
            <li>
              No Arena, abra <strong>Options → Account</strong> e marque <strong>Detailed Logs (Plugin Support)</strong>. Sem isso o jogo não
              registra as partidas. Reinicie o jogo depois de marcar.
            </li>
            <li>
              Windows: <code>%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\</code>
            </li>
            <li>
              macOS: <code>~/Library/Logs/Wizards Of The Coast/MTGA/</code>
            </li>
            <li>
              Linux (Steam): dentro da pasta do jogo no Proton, em{' '}
              <code>steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/</code>
            </li>
            <li>
              O jogo apaga o <code>Player.log</code> toda vez que abre e guarda a sessão anterior em <code>Player-prev.log</code>. Envie os dois,
              de preferência logo depois de jogar. Enviar o mesmo arquivo de novo não duplica partidas.
            </li>
          </ol>
        </details>

        <div aria-live="polite">
          {busy && <p className="muted">Lendo o log…</p>}
          {error && <p className="error">{error}</p>}
          {note && note.read > 0 && (
            <p className="ok">
              {integer(note.read)} {note.read === 1 ? 'partida lida' : 'partidas lidas'}
              {note.added !== null && `, ${integer(note.added)} ${note.added === 1 ? 'nova' : 'novas'}`}.{' '}
              {note.saved ? 'Salvas na sua conta.' : note.keptLocally ? 'Guardadas neste navegador.' : ''}
            </p>
          )}
          {note && note.read > 0 && !note.saved && !note.keptLocally && (
            <p className="error">O navegador não deixou guardar as partidas. Elas vão se perder ao fechar esta página; crie uma conta para salvá-las.</p>
          )}
          {note && note.read === 0 && (
            <p className="error">
              Não encontrei nenhuma partida terminada neste arquivo.{' '}
              {note.detailedOff
                ? 'O log diz que “Detailed Logs” está desligado: ligue a opção no Arena, reinicie o jogo e jogue de novo.'
                : 'Confira se é o Player.log do Arena e se “Detailed Logs” estava ligado quando você jogou.'}
            </p>
          )}
          {note && note.unfinished > 0 && (
            <p className="small muted">
              {integer(note.unfinished)} {note.unfinished === 1 ? 'partida ficou' : 'partidas ficaram'} de fora por não ter resultado no log (jogo
              fechado no meio ou ainda em andamento).
            </p>
          )}
          {note && note.unresolved > 0 && (
            <p className="small muted">
              {integer(note.unresolved)} {note.unresolved === 1 ? 'partida ficou' : 'partidas ficaram'} de fora porque o log não deixa claro qual dos
              dois lados era você.
            </p>
          )}
        </div>
      </div>

      {loggedIn && (
        <p className="small muted">
          Para não precisar enviar o arquivo, use o tracker: ele acompanha o jogo e manda cada partida assim que termina. A chave dele é gerada
          na página <Link href="/conta">Conta</Link>. Esta página se atualiza sozinha.
        </p>
      )}

      {matches.length > 0 && (
        <>
          <div className="tiles">
            <Tile label="Taxa de vitória" rate={stats.overall} hint={`${integer(stats.overall.matches)} ${stats.overall.matches === 1 ? 'partida' : 'partidas'}`} />
            <Tile label="Jogando primeiro" rate={stats.onPlay} />
            <Tile label="Comprando primeiro" rate={stats.onDraw} />
          </div>
          <p className="small muted">
            Ao lado de cada taxa vai a margem em que a taxa real provavelmente está (intervalo de 95%). Com poucas partidas a margem é larga:
            5 vitórias em 6 ainda é compatível com um deck que ganha metade das vezes.
          </p>

          <RateTable title="Por deck" column="Deck" groups={stats.byDeck} />
          <RateTable title="Por fila" column="Fila" groups={stats.byQueue} />
          <RateTable
            title="Contra cada arquétipo"
            column="Arquétipo do oponente"
            hint="Palpite a partir das cartas que o oponente mostrou, comparadas com o meta do MTGO. Só para Standard e Pioneer, e só quando há cartas suficientes."
            groups={stats.byOpponent}
          />

          <h2>Partidas</h2>
          {matches.slice(0, shown).map((match, index) => (
            <MatchRow key={match.id} match={match} index={index} />
          ))}
          <div className="actions">
            {matches.length > shown && (
              <button type="button" className="button secondary" onClick={() => setShown(shown + 50)}>
                Mostrar mais ({integer(matches.length - shown)} restantes)
              </button>
            )}
            <button type="button" className="link-button" onClick={clear} disabled={busy}>
              Apagar todas as partidas
            </button>
          </div>
        </>
      )}
    </>
  );
}
