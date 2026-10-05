import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FORMATS, isFormatKey } from '@mtg-meta/core';
import { MetaView, parsePeriod } from '@/components/meta-view';

interface Props {
  params: Promise<{ formato: string }>;
  searchParams: Promise<{ dias?: string | string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { formato } = await params;
  if (!isFormatKey(formato)) return {};
  return {
    title: `Meta de ${FORMATS[formato]}`,
    description: `Arquétipos mais presentes nos Challenges e Ligas de ${FORMATS[formato]} do Magic Online, atualizados várias vezes por dia.`,
  };
}

export default async function MetaPage({ params, searchParams }: Props) {
  const { formato } = await params;
  if (!isFormatKey(formato)) notFound();
  return <MetaView format={formato} period={parsePeriod((await searchParams).dias)} />;
}
