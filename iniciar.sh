#!/bin/sh
# Sobe o site com Docker e abre no navegador. Linux e macOS (no macOS, dois cliques em iniciar.command).
cd "$(dirname "$0")" || exit 1

fail() {
  printf '\n%s\n' "$1"
  # Aberto por dois cliques, o terminal fecharia antes de dar tempo de ler.
  [ -t 0 ] && { printf 'Aperte Enter para fechar.'; read -r _; }
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "O Docker não está instalado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/) e tente de novo."
docker info >/dev/null 2>&1 || fail "O Docker está instalado mas não respondeu. Abra o Docker Desktop e espere ele terminar de iniciar.
No Linux, seu usuário precisa estar no grupo docker:  sudo usermod -aG docker \$USER  (e entrar de novo na sessão)."

PORTA=$(grep -s '^PORTA=' .env | cut -d= -f2)
URL="http://localhost:${PORTA:-3000}"

echo "Preparando o site. A primeira vez leva alguns minutos (monta a imagem, baixa as cartas e um mês de torneios)."
docker compose up -d --build || fail "O Docker não conseguiu subir o site. A mensagem de erro está logo acima."

printf 'Esperando o site responder'
until docker compose exec -T site node -e "fetch('http://127.0.0.1:3000/api/colecao').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  [ -n "$(docker compose ps -q --status running site 2>/dev/null)" ] || fail "O site parou de rodar. Veja o motivo com:  docker compose logs site"
  printf '.'
  sleep 5
done

printf '\n\nNo ar em %s\nEm outro aparelho da mesma rede (celular, tablet), use o IP deste computador no lugar de "localhost".\nPara parar: parar.sh (ou parar.command / parar.bat).\n' "$URL"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then open "$URL"
fi
