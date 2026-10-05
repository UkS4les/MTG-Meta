import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { currentUser } from '@/lib/server';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function SignUpPage() {
  if (await currentUser()) redirect('/conta');
  return (
    <>
      <h1>Criar conta</h1>
      <p className="muted">Gratuita. Guardamos só o e-mail, as coleções e as partidas que você importar, e você pode baixar ou apagar tudo quando quiser.</p>
      <AuthForm mode="cadastro" />
    </>
  );
}
