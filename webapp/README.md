# LinkedIn Scraper Webapp

Aplicacao Next.js para importar perfis via CSV, executar scraping de avatar com Playwright e acompanhar estatisticas em tempo real.

## Stack

- Next.js (App Router)
- React
- Prisma
- SQLite
- Playwright

## Requisitos

- Node.js 20+
- npm

## Configuracao

1. Instale as dependencias:

```bash
npm install
```

2. Crie o arquivo `.env` na raiz de `webapp`:

```env
DATABASE_URL="file:./prisma/dev.db"
```

3. Gere o cliente Prisma:

```bash
npx prisma generate
```

4. Sincronize o schema com o banco local:

```bash
npx prisma db push
```

## Executar localmente

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Fluxo da aplicacao

1. Aba Upload CSV
2. Envie um CSV com colunas `Name` e `LinkedInURL`
3. Aba Execucao
4. Defina a quantidade de perfis e inicie a extracao
5. Consulte os cards de estatistica e o painel de logs

## Endpoints

- `POST /api/upload`: importa perfis do CSV para banco
- `POST /api/scrape`: processa perfis pendentes com Playwright
- `GET /api/stats`: retorna total, pendentes, sucesso e erro

## Scripts

- `npm run dev`: desenvolvimento
- `npm run build`: build de producao
- `npm run start`: executa build de producao
- `npm run lint`: analise estatic de codigo

## Estrutura relevante

- `src/app/page.js`: interface e interacoes principais
- `src/app/api/upload/route.js`: importacao de CSV
- `src/app/api/scrape/route.js`: scraping dos perfis
- `src/app/api/stats/route.js`: metricas da operacao
- `src/lib/prisma.js`: singleton do Prisma Client
- `prisma/schema.prisma`: schema de dados

## Observacoes operacionais

- O scraping depende de acesso aos perfis do LinkedIn e pode falhar por bloqueios/captcha/alteracoes no HTML da pagina.
- Para uso em producao, recomenda-se mover o scraping para um worker assíncrono com fila.
