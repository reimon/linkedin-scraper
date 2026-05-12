#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_MODE="none"
SKIP_PLAYWRIGHT_DEPS="false"
INSTALL_SYSTEMD="false"
REMOVE_SYSTEMD="false"
SERVICE_NAME="linkedin-scraper"

for arg in "$@"; do
  case "$arg" in
    --dev)
      RUN_MODE="dev"
      ;;
    --start)
      RUN_MODE="start"
      ;;
    --skip-playwright-deps)
      SKIP_PLAYWRIGHT_DEPS="true"
      ;;
    --install-systemd)
      INSTALL_SYSTEMD="true"
      ;;
    --remove-systemd)
      REMOVE_SYSTEMD="true"
      ;;
    --service-name=*)
      SERVICE_NAME="${arg#*=}"
      ;;
    *)
      echo "Argumento desconhecido: $arg"
      echo "Uso: bash scripts/bootstrap-ubuntu.sh [--dev|--start] [--skip-playwright-deps] [--install-systemd|--remove-systemd] [--service-name=nome]"
      exit 1
      ;;
  esac
done

if [[ "$INSTALL_SYSTEMD" == "true" && "$REMOVE_SYSTEMD" == "true" ]]; then
  echo "Use apenas uma opcao: --install-systemd ou --remove-systemd"
  exit 1
fi

if [[ -z "$SERVICE_NAME" ]]; then
  echo "Nome de servico invalido."
  exit 1
fi

echo "[1/8] Validando dependencias de sistema..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale Node 20+ antes de continuar."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm nao encontrado. Instale npm antes de continuar."
  exit 1
fi

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

echo "[2/8] Garantindo arquivo .env..."
if [[ ! -f .env ]]; then
  cat > .env <<'EOF'
DATABASE_URL="file:./prisma/dev.db"

# Opcional (provider secundario/fallback)
# APIFY_TOKEN="seu_token"
# APIFY_ACTOR_ID="seu_actor_id"
EOF
  echo "Arquivo .env criado com valores padrao."
else
  echo "Arquivo .env ja existe; sem sobrescrita."
fi

echo "[3/8] Instalando dependencias Node..."
npm ci

echo "[4/8] Instalando navegador do Playwright..."
if [[ "$SKIP_PLAYWRIGHT_DEPS" == "true" ]]; then
  if ! npx playwright install chromium; then
    echo "Aviso: Chromium do Playwright indisponivel neste sistema. Tentando Firefox..."
    if ! npx playwright install firefox; then
      echo "Aviso: Firefox do Playwright tambem indisponivel neste sistema."
      echo "Continue com um navegador do sistema e defina PLAYWRIGHT_BROWSER_NAME=firefox ou PLAYWRIGHT_BROWSER_CHANNEL=chrome no .env."
    fi
  fi
else
  if ! npx playwright install --with-deps chromium; then
    echo "Aviso: falha ao instalar Chromium com --with-deps; tentando sem dependencias de SO..."
    if ! npx playwright install chromium; then
      echo "Aviso: Chromium do Playwright nao suportado neste SO. Tentando Firefox..."
      if ! npx playwright install --with-deps firefox; then
        if ! npx playwright install firefox; then
          echo "Aviso: Firefox do Playwright tambem nao suportado neste SO."
          echo "O setup vai continuar; instale um navegador no sistema e configure PLAYWRIGHT_BROWSER_NAME=firefox ou PLAYWRIGHT_BROWSER_CHANNEL=chrome."
        fi
      fi
    fi
  fi
fi

echo "[5/8] Gerando Prisma Client..."
npx prisma generate

echo "[6/8] Sincronizando schema no banco..."
npx prisma db push

echo "[7/8] Validando build de producao..."
npm run build

echo "[8/8] Setup concluido."
echo ""
echo "Comandos uteis:"
echo "- Dev:   npm run dev"
echo "- Prod:  npm run start"

if [[ "$INSTALL_SYSTEMD" == "true" ]]; then
  if [[ ! -d /run/systemd/system && ! -d /etc/systemd/system ]]; then
    echo "Systemd nao encontrado neste ambiente. Pulando instalacao do servico."
  else
    SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
    echo "Instalando unidade systemd em $SERVICE_PATH"

    SUDO_CMD=""
    if [[ "$(id -u)" -ne 0 ]]; then
      if command -v sudo >/dev/null 2>&1; then
        SUDO_CMD="sudo"
      else
        echo "sudo nao encontrado e usuario atual nao e root. Nao foi possivel instalar o servico systemd."
        echo "Rode como root ou instale sudo e execute novamente com --install-systemd."
        SUDO_CMD=""
      fi
    fi

    if [[ -n "$SUDO_CMD" || "$(id -u)" -eq 0 ]]; then
      APP_USER="${SUDO_USER:-$USER}"

      TMP_SERVICE_FILE="$(mktemp)"
      cat > "$TMP_SERVICE_FILE" <<EOF
[Unit]
Description=LinkedIn Scraper Next.js Service
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$ROOT_DIR
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=append:/var/log/${SERVICE_NAME}.log
StandardError=append:/var/log/${SERVICE_NAME}.error.log

[Install]
WantedBy=multi-user.target
EOF

      $SUDO_CMD cp "$TMP_SERVICE_FILE" "$SERVICE_PATH"
      rm -f "$TMP_SERVICE_FILE"

      $SUDO_CMD touch "/var/log/${SERVICE_NAME}.log" "/var/log/${SERVICE_NAME}.error.log"
      $SUDO_CMD chown "$APP_USER":"$APP_USER" "/var/log/${SERVICE_NAME}.log" "/var/log/${SERVICE_NAME}.error.log"

      $SUDO_CMD systemctl daemon-reload
      $SUDO_CMD systemctl enable "$SERVICE_NAME"
      $SUDO_CMD systemctl restart "$SERVICE_NAME"

      echo "Servico systemd instalado e habilitado: ${SERVICE_NAME}.service"
      echo "Ver status: $SUDO_CMD systemctl status ${SERVICE_NAME}"
      echo "Ver logs:   tail -f /var/log/${SERVICE_NAME}.log"
    fi
  fi
fi

if [[ "$REMOVE_SYSTEMD" == "true" ]]; then
  SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
  SUDO_CMD=""

  if [[ "$(id -u)" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO_CMD="sudo"
    else
      echo "sudo nao encontrado e usuario atual nao e root. Nao foi possivel remover o servico systemd."
      exit 1
    fi
  fi

  echo "Removendo servico systemd: ${SERVICE_NAME}.service"
  $SUDO_CMD systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  $SUDO_CMD systemctl disable "$SERVICE_NAME" 2>/dev/null || true

  if [[ -f "$SERVICE_PATH" ]]; then
    $SUDO_CMD rm -f "$SERVICE_PATH"
  fi

  $SUDO_CMD systemctl daemon-reload

  $SUDO_CMD rm -f "/var/log/${SERVICE_NAME}.log" "/var/log/${SERVICE_NAME}.error.log" 2>/dev/null || true

  echo "Servico removido: ${SERVICE_NAME}.service"
fi

if [[ "$RUN_MODE" == "dev" ]]; then
  echo "Iniciando em modo desenvolvimento..."
  npm run dev
elif [[ "$RUN_MODE" == "start" ]]; then
  echo "Iniciando em modo producao (necessita build concluido)..."
  npm run start
fi
