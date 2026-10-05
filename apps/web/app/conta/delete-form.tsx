'use client';

import { useActionState } from 'react';
import { deleteAccount, type AuthState } from '@/app/actions';

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="narrow">
      <label htmlFor="senha">Confirme com a sua senha</label>
      <input id="senha" name="senha" type="password" autoComplete="current-password" required />
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button secondary" disabled={pending}>
          {pending ? 'Apagando…' : 'Apagar minha conta'}
        </button>
      </div>
    </form>
  );
}
