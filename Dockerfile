# Site do mtg-meta com tudo dentro: banco embutido, cartas e ingestão de torneios.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Só os manifestos primeiro: a instalação das dependências fica em cache enquanto eles não mudam.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY jobs/package.json jobs/
COPY apps/web/package.json apps/web/
COPY apps/tracker/package.json apps/tracker/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000 MTG_DATA_DIR=/app/data
# A pasta de dados nasce com o dono certo para o volume herdar; o site não roda como root.
RUN mkdir -p /app/data /home/node/.config && chown -R node:node /app/data /home/node/.config /app/apps/web/.next
USER node
VOLUME /app/data
EXPOSE 3000

# A primeira subida baixa as cartas e um mês de torneios antes de abrir a porta: daí o prazo longo.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15m --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/colecao').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "docker/iniciar.mjs"]
