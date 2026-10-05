import type { Metadata } from 'next';
import { isFormatKey, type FormatKey, type Platform } from '@mtg-meta/core';
import { parsePlatform } from '@/lib/api';
import { BuildableDecks } from './buildable';

export const metadata: Metadata = {
  title: 'O que posso montar',
  description: 'Cruze sua coleção com os arquétipos do meta e veja quais decks você está mais perto de completar e quanto custa terminar.',
};

interface Props {
  searchParams: Promise<{ formato?: string | string[]; plataforma?: string | string[] }>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function BuildPage({ searchParams }: Props) {
  const query = await searchParams;
  const formatParam = first(query.formato) ?? '';
  const format: FormatKey = isFormatKey(formatParam) ? formatParam : 'standard';
  const platform: Platform | null = parsePlatform(first(query.plataforma));
  return (
    <>
      <h1>O que posso montar</h1>
      <p className="muted">
        Para cada arquétipo do meta, quanto da lista representativa você já tem e o que falta. Terrenos básicos não contam; main e sideboard
        somam.
      </p>
      <BuildableDecks initialFormat={format} initialPlatform={platform} />
    </>
  );
}
