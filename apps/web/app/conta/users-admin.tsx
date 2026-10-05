'use client';

import { useActionState } from 'react';
import type { UserSummary } from '@mtg-meta/db';
import { resetUserPassword, type ResetState } from '@/app/actions';
import { CopyButton } from '@/components/copy-button';

const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

/** Lista de contas desta instalação, para o administrador redefinir a senha de quem esqueceu. */
export function UsersAdmin({ users, selfId }: { users: UserSummary[]; selfId: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetUserPassword, {});
  return (
    <div className="card">
      {state.password && (
        <div className="notice">
          <strong>Senha provisória de {state.email}:</strong>
          <pre className="command">{state.password}</pre>
          <div className="actions">
            <CopyButton text={state.password} label="Copiar senha" />
            <span className="small">Passe para a pessoa e peça que ela troque em Conta. A senha não aparece de novo.</span>
          </div>
        </div>
      )}
      {state.error && <p className="error">{state.error}</p>}
      <ul className="wanted-list">
        {users.map((user) => (
          <li key={user.id}>
            <span>{user.email}</span>
            {user.isAdmin && <span className="tag">administrador</span>}
            <span className="small muted">desde {date.format(new Date(user.createdAt))}</span>
            {user.id !== selfId && (
              <form action={action}>
                <input type="hidden" name="conta" value={user.id} />
                <input type="hidden" name="email" value={user.email} />
                <button type="submit" className="link-button small" disabled={pending}>
                  Gerar senha provisória
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
