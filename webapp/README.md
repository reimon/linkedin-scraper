# 🚀 LinkedIn Profile Scraper Professional

Uma aplicação robusta de extração de dados (fotos de perfil) do LinkedIn, construída com Next.js, Prisma e uma arquitetura focada em resiliência e bypass de restrições (Authwall).

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 14+](https://nextjs.org/) (App Router)
- **Banco de Dados:** [SQLite](https://www.sqlite.org/) com [Prisma ORM](https://www.prisma.io/)
- **Estilização:** CSS Moderno (Vanilla)
- **Extração:** API Interna do LinkedIn (Voyager) & Fallback HTML Parsing
- **Sessão:** Sistema de Injeção e Sincronização de Cookies Reais

---

## ✨ Funcionalidades Principais

- **Importação Inteligente:** Carregamento de perfis via CSV ou entrada de texto.
- **Bypass de Authwall:** Sistema de sincronização de cookies de sessões ativas para evitar telas de login.
- **Fila Persistente (Sprint A):** Enfileiramento de perfis pendentes e processamento por worker.
- **Dashboard em Tempo Real:** Monitoramento de progresso (Sucesso, Erro, Pendente) com logs detalhados.
- **Alta Resolução:** Algoritmo que seleciona automaticamente a maior versão disponível da foto de perfil.
- **Resiliência:** Fallback automático para parsing de HTML público e provider secundário (Apify) em falhas elegíveis.

---

## 🚀 Como Iniciar

### 1. Instalação

```bash
# Clone o repositório e entre na pasta webapp
npm install
```

### Setup Rápido no Ubuntu (recomendado)

```bash
bash scripts/bootstrap-ubuntu.sh
```

Opções úteis:

```bash
# faz setup e já sobe em modo dev
bash scripts/bootstrap-ubuntu.sh --dev

# faz setup e sobe em modo produção
bash scripts/bootstrap-ubuntu.sh --start

# instala Chromium sem instalar deps do sistema via Playwright
bash scripts/bootstrap-ubuntu.sh --skip-playwright-deps

# faz setup e instala servico systemd (auto start no boot)
bash scripts/bootstrap-ubuntu.sh --install-systemd

# customiza o nome do servico systemd
bash scripts/bootstrap-ubuntu.sh --install-systemd --service-name=linkedin-scraper

# remove o servico systemd e logs associados
bash scripts/bootstrap-ubuntu.sh --remove-systemd --service-name=linkedin-scraper
```

### 2. Configuração do Banco de Dados

Crie um arquivo `.env` na raiz da pasta `webapp`:

```env
DATABASE_URL="file:./prisma/dev.db"

# Opcional (provider secundário/fallback)
APIFY_TOKEN="seu_token"
APIFY_ACTOR_ID="seu_actor_id"
```

Execute as migrações:

```bash
npx prisma generate
npx prisma db push
```

### 3. Execução

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 📖 Fluxo de Uso Recomendado

1.  **Sincronização de Cookies (Obrigatório):**
    - Faça login no LinkedIn no seu navegador.
    - Abra o console do desenvolvedor (F12) e digite `document.cookie`.
    - Copie o resultado, vá na aba **Cookies** do Webapp e salve.
2.  **Upload de Dados:**
    - Na aba principal, faça upload de um CSV com as colunas `Name` e `LinkedInURL`.
3.  **Processamento:**
    - Defina a quantidade de perfis por lote e clique em **Iniciar Scraping**.
    - O app enfileira o lote e dispara um tick do worker (`/api/scrape/worker`).

---

## 📁 Estrutura de Arquivos

- `src/app/api/scrape/route.js`: Enfileira perfis pendentes para processamento.
- `src/app/api/scrape/worker/route.js`: Processa jobs da fila em lote (worker tick).
- `src/app/api/scrape/jobs/route.js`: Resumo de estado da fila.
- `src/app/api/cookies/sync/route.js`: Gerenciamento e validação de sessões.
- `src/app/api/upload/route.js`: Parser de CSV e ingestão no banco.
- `SCRAPING_DOCS.md`: Documentação técnica aprofundada sobre o funcionamento do scraper.
- `QUEUE_ADAPTER_BLUEPRINT.md`: Blueprint de evolução para fila persistente, worker assíncrono e adapters de providers de mercado.

---

## 🔒 Segurança e Boas Práticas

Este sistema foi projetado para uso educacional e de automação de workflow pessoal.

- **Fila + Worker:** O processamento foi desacoplado da requisição principal para reduzir falha em escala.
- **Headers:** Requisições assinam `User-Agent`, `Csrf-Token` e `X-Li-Track` para mimetizar um humano.

Para detalhes técnicos avançados, consulte o arquivo [SCRAPING_DOCS.md](./SCRAPING_DOCS.md).
Para o plano de escalabilidade (MCP + providers + fila), consulte [QUEUE_ADAPTER_BLUEPRINT.md](./QUEUE_ADAPTER_BLUEPRINT.md).

---

_Mantido por Antigravity AI._
