import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacidade', description: 'O que este site guarda sobre você, onde fica e como apagar.' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacidade</h1>
      <p className="muted">O que este site guarda sobre você, onde fica e como apagar.</p>

      <h2>Sem conta</h2>
      <p>
        Nada sobre você fica no servidor. Coleção, decks, partidas, cores preferidas e decks marcados como objetivo ficam guardados no seu navegador,
        neste aparelho. Limpar os dados do site no navegador apaga tudo.
      </p>

      <h2>Com conta</h2>
      <p>O servidor desta instalação guarda:</p>
      <ul>
        <li>seu e-mail e a senha, esta em forma embaralhada (ninguém consegue ler a senha, nem quem administra);</li>
        <li>as coleções que você importar, os decks que salvar e as partidas que enviar;</li>
        <li>a chave do tracker, também embaralhada, se você gerar uma.</li>
      </ul>
      <p>
        Das partidas ficam o resultado, o deck que você usou e as cartas que o oponente mostrou. O nome e o identificador do oponente nunca são
        guardados, e o arquivo de log do Arena não sai do seu computador: só o resumo de cada partida é enviado.
      </p>

      <h2>Onde ficam os dados</h2>
      <p>
        No computador de quem instalou este site, e em nenhum outro lugar. Não há envio para terceiros, anúncios nem rastreamento. Quem administra a
        instalação tem acesso ao banco de dados e pode redefinir a senha de uma conta, mas não ver a senha.
      </p>

      <h2>O que vem de fora</h2>
      <p>
        As imagens das cartas são carregadas direto do Scryfall e as fontes do site, do Google Fonts no momento em que o site é montado. Ao abrir uma
        página com imagens de cartas, seu navegador faz pedidos ao Scryfall, que vê seu endereço IP como qualquer site.
      </p>

      <h2>Baixar ou apagar</h2>
      <p>
        Na página <Link href="/conta">Conta</Link> você baixa tudo o que o site guarda sobre você em um arquivo e pode apagar a conta, o que remove
        e-mail, senha, coleções, decks, partidas e a chave do tracker de uma vez.
      </p>
    </>
  );
}
