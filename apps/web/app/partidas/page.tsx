import type { Metadata } from 'next';
import { MatchTracker } from './tracker';

export const metadata: Metadata = {
  title: 'Minhas partidas',
  description: 'Envie o Player.log do MTG Arena e veja seu histórico: taxa de vitória por deck, por fila, jogando ou comprando primeiro e contra cada arquétipo.',
};

export default function MatchesPage() {
  return (
    <>
      <h1>Minhas partidas</h1>
      <p className="muted">
        Seu histórico do Arena, lido do arquivo de log do jogo. O arquivo é lido aqui no navegador: só o resumo de cada partida vai para o
        servidor, sem o nome de nenhum oponente.
      </p>
      <MatchTracker />
    </>
  );
}
