import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { collectionSummaries, getApiTokenInfo } from '@mtg-meta/db';
import { signOut } from '@/app/actions';
import { integer, PLATFORM_PT } from '@/lib/format';
import { currentUser, getDb } from '@/lib/server';
import { DeleteAccountForm } from './delete-form';
import { TrackerKey } from './tracker-key';

export const metadata: Metadata = { title: 'Conta' };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/entrar');
  const db = await getDb();
  const [collections, trackerKey] = await Promise.all([collectionSummaries(db, user.id), getApiTokenInfo(db, user.id)]);

  return (
    <>
      <h1>Conta</h1>
      <p className="muted">{user.email}</p>

      <div className="card">
        <strong>Coleções salvas</strong>
        {collections.length === 0 ? (
          <p className="muted">Nenhuma ainda.</p>
        ) : (
          <ul>
            {collections.map((c) => (
              <li key={c.platform}>
                {PLATFORM_PT[c.platform]}: {integer(c.copies)} cópias de {integer(c.cards)} cartas
              </li>
            ))}
          </ul>
        )}
        <div className="actions">
          <Link href="/colecao">Importar ou trocar coleção</Link>
          <a href="/api/conta/exportar">Baixar meus dados (JSON)</a>
        </div>
      </div>

      <form action={signOut}>
        <button type="submit" className="button secondary">
          Sair
        </button>
      </form>

      <h2>Tracker do Arena</h2>
      <p className="muted small">
        O tracker é um programa que fica aberto enquanto você joga e envia cada partida terminada para <Link href="/partidas">Minhas partidas</Link>,
        sem você precisar enviar o log. Ele usa uma chave no lugar da sua senha, e a chave só serve para enviar partidas.
      </p>
      <TrackerKey info={trackerKey} />

      <h2>Apagar conta</h2>
      <p className="muted small">Remove o e-mail, a senha, as coleções e as partidas salvas. Não dá para desfazer.</p>
      <DeleteAccountForm />
    </>
  );
}
