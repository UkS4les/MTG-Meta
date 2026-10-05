#!/bin/sh
# Sobe o tracker do Arena com Docker. Na primeira vez pergunta a chave e guarda no arquivo .env.
cd "$(dirname "$0")" || exit 1

fail() {
  printf '\n%s\n' "$1"
  [ -t 0 ] && { printf 'Aperte Enter para fechar.'; read -r _; }
  exit 1
}

touch .env
if ! grep -q '^MTGA_LOG_DIR=.' .env; then
  if [ "$(uname)" = "Darwin" ]; then
    DIR="$HOME/Library/Logs/Wizards Of The Coast/MTGA"
  else
    DIR=""
    for ROOT in "$HOME/.steam/steam" "$HOME/.local/share/Steam" "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam"; do
      CANDIDATE="$ROOT/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA"
      [ -d "$CANDIDATE" ] && DIR="$CANDIDATE" && break
    done
  fi
  [ -d "$DIR" ] || fail "Não encontrei a pasta do log do Arena. Abra o jogo uma vez, ou escreva no arquivo .env a linha:
MTGA_LOG_DIR=/caminho/da/pasta/MTGA"
  printf 'MTGA_LOG_DIR=%s\n' "$DIR" >> .env
fi
if ! grep -q '^MTG_META_CHAVE=.' .env; then
  printf 'Cole a chave do tracker (site → Conta → Gerar chave): '
  read -r CHAVE
  [ -n "$CHAVE" ] || fail "Sem a chave o tracker não consegue enviar partidas."
  printf 'MTG_META_CHAVE=%s\n' "$CHAVE" >> .env
fi

docker compose --profile tracker up -d || fail "O Docker não conseguiu subir o tracker. Rode iniciar.sh antes, se ainda não rodou."
echo "Tracker no ar. Para ver o que ele está fazendo:  docker compose logs -f tracker"
