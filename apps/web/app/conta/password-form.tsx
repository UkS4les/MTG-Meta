'use client';

import { useActionState } from 'react';
import { changePassword, type PasswordState } from '@/app/actions';

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="card narrow">
      <label htmlFor="atual">Senha atual</label>
      <input id="atual" name="atual" type="password" autoComplete="current-password" required />
      <label htmlFor="nova">Senha nova</label>
      <input id="nova" name="nova" type="password" autoComplete="new-password" minLength={8} required />
      <p className="small muted">Pelo menos 8 caracteres. Os outros aparelhos em que você entrou serão desconectados.</p>
      <div aria-live="polite">
        {state.error && <p className="error">{state.error}</p>}
        {state.done && <p className="ok">Senha trocada.</p>}
      </div>
      <div className="actions">
        <button type="submit" className="button secondary" disabled={pending}>
          {pending ? 'Trocando…' : 'Trocar senha'}
        </button>
      </div>
    </form>
  );
}
