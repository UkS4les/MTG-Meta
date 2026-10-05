'use client';

import { useActionState } from 'react';
import type { ApiTokenInfo } from '@mtg-meta/db';
import { manageTrackerKey, type TrackerKeyState } from '@/app/actions';
import { CopyButton } from '@/components/copy-button';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

export function TrackerKey({ info }: { info: ApiTokenInfo | null }) {
  const [state, action, pending] = useActionState<TrackerKeyState, FormData>(manageTrackerKey, {});
  const exists = state.key !== undefined || (info !== null && !state.revoked);
  const command = state.key ? `npm run tracker -- --servidor ${window.location.origin} --chave ${state.key}` : '';

  return (
    <div className="card">
      {state.key ? (
        <>
          <strong>Chave gerada. Copie agora: ela não aparece de novo.</strong>
          <p className="small muted">Na pasta do projeto, rode uma vez o comando abaixo. Depois basta `npm run tracker`.</p>
          <pre className="command">{command}</pre>
          <div className="actions">
            <CopyButton text={command} label="Copiar comando" />
            <CopyButton text={state.key} label="Copiar só a chave" />
          </div>
        </>
      ) : exists && info ? (
        <p>
          Chave criada em {dateTime.format(new Date(info.createdAt))}.{' '}
          <span className="muted">{info.lastUsedAt ? `Último envio do tracker em ${dateTime.format(new Date(info.lastUsedAt))}.` : 'O tracker ainda não enviou nada com ela.'}</span>
        </p>
      ) : (
        <p className="muted">{state.revoked ? 'Chave revogada. O tracker que a usava não consegue mais enviar partidas.' : 'Você ainda não tem uma chave.'}</p>
      )}

      <form action={action} className="actions">
        <button type="submit" className={exists ? 'button secondary' : 'button'} disabled={pending}>
          {exists ? 'Gerar outra chave (invalida a atual)' : 'Gerar chave'}
        </button>
        {exists && (
          <button type="submit" name="acao" value="revogar" className="link-button" disabled={pending}>
            Revogar
          </button>
        )}
      </form>
    </div>
  );
}
