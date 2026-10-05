'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Platform } from '@mtg-meta/core';
import { MAX_COLLECTION_BYTES, type CollectionRequest, type CollectionResponse, type CollectionStatus } from '@/lib/coverage';
import { integer, PLATFORM_PT } from '@/lib/format';
import { clearLocalCollection, errorMessage, readLocalCollection, writeLocalCollection } from '@/lib/local-collection';

const PLATFORMS: Platform[] = ['arena', 'paper'];

const HELP: Record<Platform, string> = {
  arena:
    'O Arena não exporta a coleção. Use um programa que acompanha o jogo para exportá-la, ou cole uma lista com uma carta por linha, como "4 Lightning Strike".',
  paper: 'Envie o CSV exportado do Moxfield, Manabox, Archidekt, TCGplayer ou de uma planilha com colunas de nome e quantidade.',
};

export function CollectionImporter() {
  const [platform, setPlatform] = useState<Platform>('arena');
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(CollectionResponse & { keptLocally: boolean }) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadStatus() {
    try {
      const response = await fetch('/api/colecao');
      if (response.ok) setStatus((await response.json()) as CollectionStatus);
    } catch {
      // Sem o resumo a página continua funcionando para importar.
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  // Ao trocar de plataforma, mostra o que o visitante já tinha guardado no navegador.
  useEffect(() => {
    setText(readLocalCollection(platform) ?? '');
    setResult(null);
    setError(null);
  }, [platform]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_COLLECTION_BYTES) {
      setError('Arquivo grande demais (limite de 5 MB).');
      return;
    }
    setError(null);
    setText(await file.text());
  }

  async function save() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: CollectionRequest = { plataforma: platform, texto: text };
      const response = await fetch('/api/colecao', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const summary = (await response.json()) as CollectionResponse;
      // Com conta, a cópia do navegador deixa de valer; sem conta, ela é a única.
      let keptLocally = false;
      if (summary.saved) clearLocalCollection(platform);
      else keptLocally = writeLocalCollection(platform, text);
      setResult({ ...summary, keptLocally });
      if (summary.saved) setText('');
      if (fileInput.current) fileInput.current.value = '';
      await loadStatus();
    } catch {
      setError('Não consegui falar com o servidor. Verifique a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Apagar a coleção de ${PLATFORM_PT[platform]} salva na sua conta?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/colecao?plataforma=${platform}`, { method: 'DELETE' });
      if (!response.ok) setError(await errorMessage(response));
      setResult(null);
      await loadStatus();
    } catch {
      setError('Não consegui falar com o servidor. Verifique a conexão e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const saved = status?.saved.find((s) => s.platform === platform);

  return (
    <>
      <div className="tabs" role="group" aria-label="Plataforma">
        {PLATFORMS.map((p) => (
          <button key={p} type="button" aria-pressed={p === platform} onClick={() => setPlatform(p)}>
            {PLATFORM_PT[p]}
          </button>
        ))}
      </div>

      {status && !status.loggedIn && (
        <p className="notice">
          Sem conta, a coleção fica guardada só neste navegador. <Link href="/entrar">Entre</Link> ou <Link href="/cadastro">crie uma conta</Link>{' '}
          para salvar e usar em outros aparelhos.
        </p>
      )}

      {saved && (
        <div className="card">
          <strong>
            Coleção salva: {integer(saved.copies)} cópias de {integer(saved.cards)} cartas
          </strong>
          <p className="small muted">Atualizada em {new Date(saved.updatedAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <div className="actions">
            <Link href={`/montar?plataforma=${platform}`} className="button">
              Ver o que posso montar
            </Link>
            <a href={`/api/colecao?plataforma=${platform}`}>Baixar como lista</a>
            <button type="button" className="link-button" onClick={remove} disabled={busy}>
              Apagar
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <p className="small muted">{HELP[platform]}</p>
        <label htmlFor="arquivo">Arquivo (.csv ou .txt)</label>
        <input ref={fileInput} id="arquivo" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={onFile} />
        <label htmlFor="texto">Ou cole a coleção aqui</label>
        <textarea
          id="texto"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={platform === 'arena' ? '4 Lightning Strike\n2 Sheoldred, the Apocalypse\n...' : 'Count,Name,Edition\n4,Lightning Bolt,2xm\n...'}
          spellCheck={false}
        />
        <div className="actions">
          <button type="button" className="button" onClick={save} disabled={busy || text.trim() === ''}>
            {busy ? 'Importando…' : saved ? 'Substituir coleção' : 'Importar coleção'}
          </button>
        </div>

        <div aria-live="polite">
          {error && <p className="error">{error}</p>}
          {result && (
            <>
              <p className="ok">
                {integer(result.copies)} cópias de {integer(result.cards)} cartas reconhecidas.{' '}
                {result.saved ? 'Salvas na sua conta.' : result.keptLocally ? 'Guardadas neste navegador.' : ''}
              </p>
              {!result.saved && !result.keptLocally && (
                <p className="error">O navegador não deixou guardar a coleção. Ela vai se perder ao fechar esta página; crie uma conta para salvá-la.</p>
              )}
              {result.unknown.length > 0 && (
                <p className="small muted">
                  {result.unknown.length === 50 ? '50 ou mais nomes' : `${result.unknown.length} nome(s)`} não reconhecido(s) e deixado(s) de fora:{' '}
                  {result.unknown.slice(0, 12).join(', ')}
                  {result.unknown.length > 12 ? '…' : ''}
                </p>
              )}
              {result.ignoredLines > 0 && <p className="small muted">{integer(result.ignoredLines)} linha(s) sem carta e quantidade foram ignoradas.</p>}
              {!saved && (
                <p>
                  <Link href={`/montar?plataforma=${platform}`}>Ver o que posso montar →</Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
