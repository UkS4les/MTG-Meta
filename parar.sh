#!/bin/sh
# Para o site e o tracker. Os dados ficam guardados para a próxima vez.
cd "$(dirname "$0")" || exit 1
docker compose --profile tracker down && echo "Parado. Os dados continuam guardados."
