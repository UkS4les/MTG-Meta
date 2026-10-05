'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/meta/standard', label: 'Meta', match: (path: string) => path === '/' || path.startsWith('/meta') },
  { href: '/cartas', label: 'Cartas', match: (path: string) => path.startsWith('/cartas') },
  { href: '/montar', label: 'O que posso montar', match: (path: string) => path.startsWith('/montar') },
  { href: '/colecao', label: 'Coleção', match: (path: string) => path.startsWith('/colecao') },
  { href: '/decks', label: 'Decks', match: (path: string) => path.startsWith('/decks') },
  { href: '/partidas', label: 'Partidas', match: (path: string) => path.startsWith('/partidas') },
];

export function NavLinks({ loggedIn }: { loggedIn: boolean }) {
  const path = usePathname();
  const account = loggedIn ? { href: '/conta', label: 'Conta' } : { href: '/entrar', label: 'Entrar' };
  const onAccount = ['/conta', '/entrar', '/cadastro'].some((p) => path.startsWith(p));
  return (
    <nav aria-label="Principal">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.match(path) ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
      <Link href={account.href} className="account" aria-current={onAccount ? 'page' : undefined}>
        {account.label}
      </Link>
    </nav>
  );
}
