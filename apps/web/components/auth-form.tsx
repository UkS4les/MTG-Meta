'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp, type AuthState } from '@/app/actions';

export function AuthForm({ mode }: { mode: 'entrar' | 'cadastro' }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === 'entrar' ? signIn : signUp, {});
  const signingUp = mode === 'cadastro';
  return (
    <form action={action} className="card narrow">
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      <label htmlFor="senha">Senha</label>
      <input id="senha" name="senha" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} required minLength={signingUp ? 8 : undefined} />
      {signingUp && <p className="small muted">Pelo menos 8 caracteres.</p>}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? 'Aguarde…' : signingUp ? 'Criar conta' : 'Entrar'}
        </button>
        {signingUp ? <Link href="/entrar">Já tenho conta</Link> : <Link href="/cadastro">Criar conta</Link>}
      </div>
    </form>
  );
}
