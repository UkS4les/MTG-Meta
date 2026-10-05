'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createApiToken,
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  revokeApiToken,
  verifyLogin,
} from '@mtg-meta/db';
import { currentUser, getDb, SESSION_COOKIE, setSessionCookie } from '@/lib/server';

export interface AuthState {
  error?: string;
  email?: string;
}

function credentials(form: FormData): { email: string; password: string } {
  const email = form.get('email');
  const password = form.get('senha');
  return { email: typeof email === 'string' ? normalizeEmail(email) : '', password: typeof password === 'string' ? password : '' };
}

export async function signUp(_previous: AuthState, form: FormData): Promise<AuthState> {
  const { email, password } = credentials(form);
  if (!isValidEmail(email)) return { error: 'Informe um e-mail válido.', email };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`, email };
  if (password.length > 200) return { error: 'A senha pode ter no máximo 200 caracteres.', email };

  const db = await getDb();
  const user = await createUser(db, email, password);
  if (!user) return { error: 'Já existe uma conta com este e-mail. Entre com ela.', email };
  await setSessionCookie(await createSession(db, user.id));
  redirect('/colecao');
}

export async function signIn(_previous: AuthState, form: FormData): Promise<AuthState> {
  const { email, password } = credentials(form);
  const db = await getDb();
  const user = email && password ? await verifyLogin(db, email, password) : null;
  if (!user) return { error: 'E-mail ou senha incorretos.', email };
  await setSessionCookie(await createSession(db, user.id));
  redirect('/montar');
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  store.delete(SESSION_COOKIE);
  redirect('/');
}

export async function deleteAccount(_previous: AuthState, form: FormData): Promise<AuthState> {
  const user = await currentUser();
  if (!user) redirect('/entrar');
  const password = form.get('senha');
  const db = await getDb();
  // A senha de novo impede que alguém com o computador aberto apague a conta de outra pessoa.
  if (typeof password !== 'string' || !(await verifyLogin(db, user.email, password))) return { error: 'Senha incorreta.' };
  await deleteUser(db, user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/');
}

export interface TrackerKeyState {
  /** A chave recém-gerada. Só aparece nesta resposta; depois não há como ver de novo. */
  key?: string;
  revoked?: boolean;
}

export async function manageTrackerKey(_previous: TrackerKeyState, form: FormData): Promise<TrackerKeyState> {
  const user = await currentUser();
  if (!user) redirect('/entrar');
  const db = await getDb();
  if (form.get('acao') === 'revogar') {
    await revokeApiToken(db, user.id);
    return { revoked: true };
  }
  return { key: await createApiToken(db, user.id) };
}
