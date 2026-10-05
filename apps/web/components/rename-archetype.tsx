'use client';

import { useActionState } from 'react';
import { renameArchetypeAction, type RenameState } from '@/app/actions';

/** Formulário do administrador para trocar o nome de um arquétipo. */
export function RenameArchetype({ id, name, autoNamed }: { id: number; name: string; autoNamed: boolean }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameArchetypeAction, {});
  return (
    <details className="help">
      <summary>{autoNamed ? 'Dar o nome que a comunidade usa' : 'Renomear'} (administrador)</summary>
      <form action={action} className="rename-form">
        <input type="hidden" name="arquetipo" value={id} />
        <label htmlFor="novo-nome" className="sr-only">
          Novo nome
        </label>
        <input id="novo-nome" name="nome" type="text" defaultValue={autoNamed ? '' : name} placeholder="Ex.: Izzet Prowess" maxLength={80} required />
        <button type="submit" className="button secondary" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar nome'}
        </button>
        <span aria-live="polite">
          {state.error && <span className="error">{state.error}</span>}
          {state.done && <span className="ok">Nome salvo.</span>}
        </span>
      </form>
    </details>
  );
}
