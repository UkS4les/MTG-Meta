import type { Metadata } from 'next';
import { CollectionImporter } from './importer';

export const metadata: Metadata = {
  title: 'Minha coleção',
  description: 'Importe sua coleção de Magic em CSV (Moxfield, Manabox, Archidekt, TCGplayer) ou como lista de texto do Arena.',
};

export default function CollectionPage() {
  return (
    <>
      <h1>Minha coleção</h1>
      <p className="muted">Papel e Arena são coleções separadas. Importar de novo substitui a coleção anterior da mesma plataforma.</p>
      <CollectionImporter />
    </>
  );
}
