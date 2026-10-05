import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { currentUser } from '@/lib/server';

export const metadata: Metadata = { title: 'Entrar' };

export default async function SignInPage() {
  if (await currentUser()) redirect('/conta');
  return (
    <>
      <h1>Entrar</h1>
      <p className="muted">A conta serve para salvar sua coleção e suas partidas. O meta e as listas são abertos a todos.</p>
      <AuthForm mode="entrar" />
    </>
  );
}
