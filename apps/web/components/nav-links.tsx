'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/meta/standard', label: 'Meta', match: (path: string) => path === '/' || path.startsWith('/meta') },
  { href: '/montar', label: 'O que posso montar', match: (path: string) => path.startsWith('/montar') },
  { href: '/colecao', label: 'Minha coleção', match: (path: string) => path.startsWith('/colecao') },
  { href: '/partidas', label: 'Minhas partidas', match: (path: string) => path.startsWith('/partidas') },
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
