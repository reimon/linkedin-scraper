# Queue + Adapter Blueprint (MCP + Market Providers)

## 1) Objetivo

Objetivo do projeto: obter `profilePictureUrl` para perfis ja cadastrados no banco com maior taxa de sucesso, menor bloqueio e operacao previsivel.

Problema atual: pipeline sincrono por request HTTP. Em escala, isso degrada por rate limit/authwall e dificulta governanca de custo/sucesso por provider.

## 2) Estrategia recomendada

Arquitetura alvo em 3 camadas:

1. Ingestao de jobs:

- API enfileira perfis pendentes em uma fila persistente.

2. Worker de enriquecimento:

- Worker processa jobs fora do ciclo HTTP, com retry/backoff e timeout.

3. Adapter de providers:

- Um contrato unico de provider (`resolveProfilePhoto`) para plugar:
  - provider local (Voyager/fallback HTML, ja existente)
  - provider de mercado A (ex.: Apify)
  - provider de mercado B (ex.: Bright Data)
- Se provider principal falhar, fallback automatico por politica.

MCP entra como camada de orquestracao/politica:

- seleciona provider por score (sucesso recente, latencia, custo)
- aplica fallback por tipo de erro
- centraliza telemetria e decisao

## 3) Decisao de execucao (curto vs medio prazo)

### Fase 1 (rapida, sem nova infra)

Usar fila baseada em banco (SQLite) com tabela de jobs e endpoint de worker "tick".

- Pratico para validar arquitetura agora.
- Mantem setup simples local.
- Menos robusto para alta concorrencia.

### Fase 2 (producao)

Migrar para BullMQ + Redis.

- Concorrencia e retries nativos.
- Melhor observabilidade.
- Mais robustez para escala.

## 4) Contrato de provider (padrao)

Criar um contrato unico para todos os provedores.

```js
// src/lib/scraping/providers/types.js
export const ProviderErrorCode = {
  RATE_LIMIT: "RATE_LIMIT",
  AUTHWALL: "AUTHWALL",
  NOT_FOUND: "NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  UNKNOWN: "UNKNOWN",
};

export class ProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// assinatura esperada por provider
// input: { profileId, linkedinUrl, context }
// output: { ok, photoUrl?, errorCode?, diagnostics }
```

Resposta normalizada por provider:

```json
{
  "ok": true,
  "photoUrl": "https://media.licdn.com/...",
  "diagnostics": {
    "provider": "local-voyager",
    "latencyMs": 842,
    "source": "voyager"
  }
}
```

Resposta de falha normalizada:

```json
{
  "ok": false,
  "errorCode": "RATE_LIMIT",
  "diagnostics": {
    "provider": "local-voyager",
    "status": 429,
    "retryAfterMs": 4000
  }
}
```

## 5) Politica de orquestracao (MCP/policy engine)

Criar politica simples e explicita:

1. Tentar provider primario (`local-voyager`).
2. Se `RATE_LIMIT` ou `AUTHWALL`, fallback para provider secundario.
3. Se `NOT_FOUND`, encerrar sem fallback (evita custo inutil).
4. Se `NETWORK/TIMEOUT`, retry curto e fallback.

Score recomendado por provider:

`score = (successRate7d * 0.55) - (p95LatencyNorm * 0.20) - (costPer1kNorm * 0.25)`

- Selecionar provider com maior score.
- Guardar score por janela (1h/24h/7d).

## 6) Modelo de dados proposto (Prisma)

Adicionar tabelas para fila e telemetria:

```prisma
model ScrapeJob {
  id            String   @id @default(uuid())
  profileId     String
  status        String   @default("QUEUED") // QUEUED, RUNNING, SUCCESS, RETRY, FAILED
  priority      Int      @default(0)
  attempts      Int      @default(0)
  maxAttempts   Int      @default(5)
  nextRunAt     DateTime @default(now())
  lockedAt      DateTime?
  lockToken     String?
  providerHint  String?
  lastErrorCode String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([status, nextRunAt, priority])
  @@index([profileId])
}

model ScrapeJobAttempt {
  id           String   @id @default(uuid())
  jobId         String
  provider      String
  success       Boolean
  errorCode     String?
  latencyMs     Int?
  httpStatus    Int?
  retryAfterMs  Int?
  diagnostics   String?
  createdAt     DateTime @default(now())

  @@index([jobId, createdAt])
  @@index([provider, createdAt])
}

model ProviderStat {
  id            String   @id @default(uuid())
  provider      String
  window        String   // 1h, 24h, 7d
  successRate   Float
  p95LatencyMs  Int
  costPer1k     Float
  updatedAt     DateTime @updatedAt

  @@unique([provider, window])
}
```

## 7) Blueprint por arquivo

### 7.1 Backend core

Criar:

- `src/lib/scraping/providers/types.js`
- `src/lib/scraping/providers/localVoyagerProvider.js`
- `src/lib/scraping/providers/apifyProvider.js`
- `src/lib/scraping/providers/brightDataProvider.js`
- `src/lib/scraping/providerRegistry.js`
- `src/lib/scraping/providerPolicy.js`
- `src/lib/scraping/jobQueueDb.js`
- `src/lib/scraping/worker.js`
- `src/lib/scraping/metrics.js`

Alterar:

- `src/app/api/scrape/route.js`
  - trocar "processamento do lote" por "enqueue" e retorno de job summary.

Criar endpoint de worker:

- `src/app/api/scrape/worker/route.js`
  - executa N jobs pendentes por chamada (cron/manual).

Criar endpoint de jobs:

- `src/app/api/scrape/jobs/route.js`
  - lista status agregado (`queued/running/retry/failed/success`).

### 7.2 API contract

`POST /api/scrape` (enqueue)

Input:

```json
{ "count": 50, "priority": 0 }
```

Output:

```json
{
  "enqueued": 50,
  "alreadyQueued": 12,
  "queueDepth": 431
}
```

`POST /api/scrape/worker` (tick)

Input:

```json
{ "maxJobs": 20 }
```

Output:

```json
{
  "processed": 20,
  "success": 13,
  "retry": 5,
  "failed": 2,
  "providers": {
    "local-voyager": 15,
    "apify": 5
  }
}
```

## 8) Politica de retry/requeue recomendada

- `RATE_LIMIT`: requeue com backoff exponencial + jitter.
- `AUTHWALL`: fallback para outro provider + reduzir prioridade.
- `TIMEOUT/NETWORK`: retry rapido (max 2) antes de fallback.
- `NOT_FOUND`: marcar falha final sem retry longo.

Backoff sugerido:

`nextRunAt = now + min(2^attempt * 30s + jitter, 30m)`

## 9) Integracao com providers de mercado

### Apify adapter

Variaveis:

- `APIFY_TOKEN`
- `APIFY_ACTOR_ID`

Fluxo:

1. dispara run com `linkedinUrl`
2. aguarda dataset
3. normaliza avatar URL

### Bright Data adapter

Variaveis:

- `BRIGHTDATA_TOKEN`
- `BRIGHTDATA_DATASET_ID`

Fluxo:

1. envia perfil para collector/dataset
2. consulta resultado
3. normaliza avatar URL

## 10) Seguranca e compliance (minimo)

- Criptografar cookies em repouso (antes de persistir).
- Nao logar cookie bruto em nenhuma excecao.
- Auditoria de acesso aos endpoints de scrape/worker.
- Revisar termos de uso e base legal antes de escalar volume.

## 11) Plano de implementacao (sprints)

Sprint A (2-3 dias):

- schema de jobs + enqueue + worker DB local
- extrair provider local atual para adapter
- manter resultado em `Profile`

Sprint B (3-5 dias):

- provider secundario (Apify ou Bright Data)
- policy de fallback
- metricas por provider

Sprint C (2-3 dias):

- endpoint de monitoramento de fila
- dashboard simples de operacao
- tuning de retry/backoff

## 12) Checklist de pronto

- [ ] `POST /api/scrape` apenas enfileira
- [ ] worker processa jobs fora do ciclo UI
- [ ] adapters plugaveis por contrato unico
- [ ] fallback automatico por tipo de erro
- [ ] telemetria por provider gravada
- [ ] retries persistentes com `nextRunAt`
- [ ] endpoint de health da fila
- [ ] docs atualizadas

## 13) Delta imediato no projeto atual

Como primeiro passo concreto neste repo:

1. Extrair funcoes de `src/app/api/scrape/route.js` para `src/lib/scraping/providers/localVoyagerProvider.js`.
2. Trocar `src/app/api/scrape/route.js` para modo enqueue.
3. Criar `src/app/api/scrape/worker/route.js` com processamento em lote e lock por job.
4. Adicionar modelos `ScrapeJob` e `ScrapeJobAttempt` no schema Prisma.
5. Expor resumo da fila em novo endpoint de jobs para a UI.

Isso ja remove o maior gargalo operacional sem exigir mudanca radical de stack.
