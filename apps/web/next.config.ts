import type { NextConfig } from 'next';

const config: NextConfig = {
  // Os pacotes do monorepo são TypeScript puro, sem etapa de build própria.
  transpilePackages: ['@mtg-meta/core', '@mtg-meta/db', '@mtg-meta/jobs'],
  // O PGlite carrega arquivos .wasm do próprio pacote; empacotá-lo quebra esses caminhos.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default config;
