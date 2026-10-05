/**
 * Dá a um arquétipo o nome que a comunidade usa, no lugar do nome provisório do classificador.
 *
 *   npm run arquetipo:renomear -- 153 "Golgari Midrange"
 *
 * O número é o que aparece no endereço da página do arquétipo (/meta/standard/153).
 * O banco local só aceita um processo por vez: pare o site antes de rodar.
 */
import { getArchetype, openDb, renameArchetype } from '@mtg-meta/db';

async function main(): Promise<void> {
  const [idArg, ...nameParts] = process.argv.slice(2);
  const id = Number(idArg);
  const name = nameParts.join(' ').trim();
  if (!Number.isInteger(id) || id <= 0 || !name) throw new Error('Uso: npm run arquetipo:renomear -- <número> "Novo nome"');
  if (name.length > 80) throw new Error('O nome pode ter no máximo 80 caracteres.');

  const db = await openDb();
  try {
    const archetype = await getArchetype(db, id);
    if (!archetype) throw new Error(`Não existe arquétipo com o número ${id}.`);
    if (!(await renameArchetype(db, id, name))) throw new Error(`Já existe um arquétipo chamado "${name}" em ${archetype.format}.`);
    console.log(`${archetype.format}: "${archetype.name}" agora se chama "${name}".`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
