import type { Metadata } from 'next';
import { DeckBuilder } from './builder';

export const metadata: Metadata = {
  title: 'Meus decks',
  description: 'Monte e salve seus decks de Magic: busque cartas, cole uma lista, veja as cores, o arquétipo parecido no meta e quanto da sua coleção já cobre.',
};

export default function DecksPage() {
  return <DeckBuilder />;
}
