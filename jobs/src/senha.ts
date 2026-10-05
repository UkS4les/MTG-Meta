/**
 * Redefine a senha de uma conta pela linha de comando, para quando o administrador esquece a própria.
 *
 *   npm run conta:senha -- pessoa@exemplo.com
 *
 * Mostra uma senha provisória. O banco local só aceita um processo por vez: pare o site antes
 * (no Docker: docker compose stop site, rode com "docker compose run --rm site npm run conta:senha -- e-mail"
 * e suba de novo).
 */
import { findUserByEmail, openDb, setPassword, temporaryPassword } from '@mtg-meta/db';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) throw new Error('Uso: npm run conta:senha -- pessoa@exemplo.com');
  const db = await openDb();
  try {
    const user = await findUserByEmail(db, email);
    if (!user) throw new Error(`Não existe conta com o e-mail ${email}.`);
    const password = temporaryPassword();
    await setPassword(db, user.id, password);
    console.log(`Senha provisória de ${user.email}: ${password}\nEntre com ela e troque em Conta → Trocar senha.`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
