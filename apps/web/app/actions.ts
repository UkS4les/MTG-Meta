'use server';

import { revalidatePath } from 'next/cache';
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
  renameArchetype,
  revokeApiToken,
  setPassword,
  temporaryPassword,
  verifyLogin,
} from '@mtg-meta/db';
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from '@/lib/rate-limit';
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
  const wait = loginBlockedFor(email);
  if (wait > 0) return { error: `Muitas tentativas para este e-mail. Tente de novo em ${wait} ${wait === 1 ? 'minuto' : 'minutos'}.`, email };
  const user = email && password ? await verifyLogin(db, email, password) : null;
  if (!user) {
    if (email) recordLoginFailure(email);
    return { error: 'E-mail ou senha incorretos.', email };
  }
  clearLoginFailures(email);
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

export interface PasswordState {
  error?: string;
  done?: boolean;
}

export async function changePassword(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await currentUser();
  if (!user) redirect('/entrar');
  const current = form.get('atual');
  const next = form.get('nova');
  if (typeof current !== 'string' || typeof next !== 'string') return { error: 'Preencha os dois campos.' };
  if (next.length < MIN_PASSWORD_LENGTH) return { error: `A senha nova precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (next.length > 200) return { error: 'A senha pode ter no máximo 200 caracteres.' };
  const db = await getDb();
  if (!(await verifyLogin(db, user.email, current))) return { error: 'A senha atual está incorreta.' };
  await setPassword(db, user.id, next);
  // Trocar a senha encerra todas as sessões; esta aqui é reaberta para a pessoa não cair fora.
  await setSessionCookie(await createSession(db, user.id));
  return { done: true };
}

export interface ResetState {
  error?: string;
  /** A senha provisória recém-gerada e de quem é. Só aparece nesta resposta. */
  password?: string;
  email?: string;
}

/** Só o administrador: gera uma senha provisória para outra conta (não há e-mail para recuperar senha). */
export async function resetUserPassword(_previous: ResetState, form: FormData): Promise<ResetState> {
  const admin = await currentUser();
  if (!admin) redirect('/entrar');
  if (!admin.isAdmin) return { error: 'Só o administrador pode redefinir senhas.' };
  const userId = form.get('conta');
  const email = form.get('email');
  if (typeof userId !== 'string' || typeof email !== 'string') return { error: 'Conta inválida.' };
  if (userId === admin.id) return { error: 'Para a sua própria conta, use "Trocar senha".' };
  const password = temporaryPassword();
  if (!(await setPassword(await getDb(), userId, password))) return { error: 'Essa conta não existe mais.' };
  clearLoginFailures(email);
  return { password, email };
}

export interface RenameState {
  error?: string;
  done?: boolean;
}

/** Só o administrador: dá a um arquétipo o nome que a comunidade usa. */
export async function renameArchetypeAction(_previous: RenameState, form: FormData): Promise<RenameState> {
  const admin = await currentUser();
  if (!admin?.isAdmin) return { error: 'Só o administrador pode renomear arquétipos.' };
  const id = Number(form.get('arquetipo'));
  const name = String(form.get('nome') ?? '').trim();
  if (!Number.isInteger(id) || id <= 0) return { error: 'Arquétipo inválido.' };
  if (name.length < 2 || name.length > 80) return { error: 'O nome precisa ter entre 2 e 80 caracteres.' };
  if (!(await renameArchetype(await getDb(), id, name))) return { error: 'Já existe outro arquétipo com esse nome neste formato.' };
  revalidatePath('/', 'layout');
  return { done: true };
}
