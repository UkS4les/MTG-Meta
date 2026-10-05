import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MTGA = ['Wizards Of The Coast', 'MTGA'];
/** Número do MTG Arena na Steam: é o nome da pasta do jogo dentro do Proton. */
const STEAM_APP_ID = '2141910';

/** Pastas onde o Arena costuma gravar o log, em ordem de tentativa, para o sistema atual. */
export function logDirCandidates(platform = process.platform, home = homedir(), env = process.env): string[] {
  if (platform === 'win32') return [join(env.USERPROFILE ?? home, 'AppData', 'LocalLow', ...MTGA)];
  if (platform === 'darwin') return [join(home, 'Library', 'Logs', ...MTGA)];
  // No Linux o jogo roda pela Steam com Proton, e o "Windows" dele fica dentro da biblioteca da Steam.
  const steamRoots = [join(home, '.steam', 'steam'), join(home, '.local', 'share', 'Steam'), join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')];
  return steamRoots.map((root) => join(root, 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'LocalLow', ...MTGA));
}

/** Primeira pasta candidata que existe, ou null se o Arena não parece instalado no lugar padrão. */
export function findLogDir(candidates = logDirCandidates()): string | null {
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

/** Onde o tracker guarda a configuração (servidor e chave) e a lista do que já enviou. */
export function configDir(platform = process.platform, home = homedir(), env = process.env): string {
  if (platform === 'win32') return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'mtg-meta-tracker');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'mtg-meta-tracker');
  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'mtg-meta-tracker');
}
