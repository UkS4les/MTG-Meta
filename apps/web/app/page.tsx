import Link from 'next/link';
import { MetaView } from '@/components/meta-view';

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Papel · Arena · Magic Online</p>
        <p className="hero-title">
          Quais decks do meta você <em>já consegue montar</em>?
        </p>
        <p className="hero-text">
          Importe sua coleção e veja, para cada arquétipo, quanto você já tem e o que falta: curingas no Arena, dólares no papel.
        </p>
        <div className="actions">
          <Link href="/colecao" className="button">
            Importar coleção
          </Link>
          <Link href="/montar" className="button secondary">
            Ver o que posso montar
          </Link>
        </div>
      </section>
      <MetaView format="standard" period={30} />
    </>
  );
}
