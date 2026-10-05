import { createReadStream } from 'node:fs';

/**
 * Lê um arquivo JSON no formato `[ {...}, {...} ]` entregando um objeto por vez,
 * sem carregar o arquivo inteiro na memória (o bulk do Scryfall passa de 400 MB).
 */
export async function* readJsonArray<T>(path: string): AsyncGenerator<T> {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let started = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let buffer = '';
  let capturing = false;

  for await (const chunk of stream as AsyncIterable<string>) {
    let start = capturing ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (!started) {
        if (c === '[') started = true;
        continue;
      }
      if (c === '{') {
        if (depth === 0) {
          start = i;
          capturing = true;
        }
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          buffer += chunk.slice(start, i + 1);
          yield JSON.parse(buffer) as T;
          buffer = '';
          capturing = false;
          start = -1;
        }
      }
    }
    if (capturing) buffer += chunk.slice(start);
  }
  if (depth !== 0 || capturing) throw new Error(`JSON incompleto em ${path}`);
}
