import type { Metadata } from 'next';
import { Cinzel, Inter } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '@/components/nav-links';
import { currentUser, getCards } from '@/lib/server';
import './globals.css';

const display = Cinzel({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MTG Meta — meta do Magic e o que você consegue montar', template: '%s — MTG Meta' },
  description:
    'Arquétipos mais jogados nos torneios do Magic Online por formato, e quanto falta para você montar cada um com a sua coleção de papel ou do Arena.',
};

// Todas as páginas leem do banco a cada visita; nada é gerado no build.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const { real } = getCards();
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="backdrop" aria-hidden="true" />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="pips" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              MTG Meta
            </Link>
            <NavLinks loggedIn={user !== null} />
          </div>
        </header>
        <main className="container">
          {!real && (
            <p className="notice">
              O site está usando o banco de cartas de exemplo: raridades e preços não são reais. Rode <code>npm run cartas:baixar</code> no
              servidor.
            </p>
          )}
          {children}
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>
              MTG Meta é Conteúdo de Fã não oficial, permitido pela Política de Conteúdo de Fã. Não é aprovado nem endossado pela Wizards.
              Partes dos materiais usados são propriedade da Wizards of the Coast. ©Wizards of the Coast LLC.
            </p>
            <p>
              Dados de cartas e preços: <a href="https://scryfall.com">Scryfall</a>. Listas de torneios: <a href="https://www.mtgo.com/decklists">mtgo.com</a>,
              via <a href="https://github.com/modometa/modometa-mtgo-data">modometa-mtgo-data</a>. Gratuito, sem cadastro obrigatório.{' '}
              <Link href="/privacidade">Privacidade</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
