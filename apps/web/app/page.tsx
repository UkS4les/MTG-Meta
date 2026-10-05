import Link from 'next/link';
import { getMeta } from '@mtg-meta/db';
import { CardImage } from '@/components/card-image';
import { MetaView } from '@/components/meta-view';
import { deckLook } from '@/lib/cards-view';
import { cardDb, getDb } from '@/lib/server';

export default async function HomePage() {
  // A carta mais usada de cada um dos três arquétipos do topo ilustra a abertura.
  const cards = cardDb();
  const top = (await getMeta(await getDb(), 'standard', 30))
    .filter((row) => row.archetypeId !== null)
    .slice(0, 3)
    .flatMap((row) => deckLook(Object.entries(row.signature), cards, 1).cards);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
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
        </div>
        {top.length === 3 && (
          <div className="hero-cards" aria-hidden="true">
            {top.map((card) => (
              <CardImage key={card.name} name="" imageId={card.imageId} className="hero-card" />
            ))}
          </div>
        )}
      </section>
      <MetaView format="standard" period={30} />
    </>
  );
}
