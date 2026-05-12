# Documentação Técnica: LinkedIn Profile Scraper

Este documento detalha o funcionamento interno do sistema de scraping desenvolvido para extrair fotos de perfil do LinkedIn de forma eficiente e resiliente.

---

## 1. Visão Geral do Sistema

O sistema é uma aplicação web full-stack construída com **Next.js**, com processamento em lote no backend da própria API e gerenciamento de sessões reais para contornar proteções do LinkedIn (Authwall).

### Tecnologias Utilizadas:

- **Frontend/Backend:** Next.js (App Router).
- **Banco de Dados:** SQLite (via Prisma ORM).
- **Autenticação:** Injeção de Cookies de sessões ativas.
- **Extração de Dados:** Consumo da API interna do LinkedIn (Voyager) com fallback para parsing de HTML.
- **Resiliência Operacional:** Backoff adaptativo, retry com jitter e rotação de cookies ativos.

---

## 2. O Mecanismo de Scraping

Diferente de scrapers tradicionais que apenas "leem" a página, este sistema utiliza as mesmas rotas de dados que o aplicativo oficial do LinkedIn usa.

### A. Extração do Identificador

O sistema primeiro limpa a URL fornecida para extrair o `public_id` (username) do perfil.

- **Exemplo:** `linkedin.com/in/nome-usuario/` -> `nome-usuario`.

### B. Consumo da API Voyager

O motor principal faz requisições para a **API Voyager** do LinkedIn. Esta API é muito mais leve que o site completo e retorna dados estruturados em JSON.

- **Endpoint Principal:** `https://www.linkedin.com/voyager/api/identity/profiles/{username}/profileView`
- **Headers Críticos:**
  - `Csrf-Token`: Extraído do cookie `JSESSIONID`.
  - `X-Li-Track`: Identifica o cliente como um navegador moderno.
  - `X-Restli-Protocol-Version`: Necessário para a API Voyager 2.0.

### C. Fallback para HTML Público

Caso a API interna falhe (ex: perfil privado ou restrição de rede), o sistema tenta acessar a página pública e utiliza **Expressões Regulares (Regex)** para localizar a URL da imagem em metatags `og:image` ou em blocos de script de pré-carregamento.

### D. Classificação de Falhas

Durante a coleta, as falhas são classificadas para orientar o tratamento:

- `RATE_LIMIT`: respostas `429` ou `999`.
- `AUTHWALL`: respostas `401` ou `403`.
- `NOT_FOUND`: perfil não encontrado após tentativas e fallback.

---

## 3. Gerenciamento de Sessão e Cookies

O maior desafio do scraping de LinkedIn é o "Authwall" (tela de login forçada).

### Login Automatizado (Playwright)

Além da inserção manual de cookie, o sistema também permite login por conta cadastrada:

1.  O usuário informa email/senha na aba de contas.
2.  O backend autentica com **Playwright** em `https://www.linkedin.com/login`.
3.  Com login válido, o sistema extrai e salva cookies de sessão (`li_at`, `JSESSIONID`, `lidc`, etc.).
4.  O scraping permanece via **API Voyager** para manter velocidade e baixo consumo.

Esse desenho separa aquisição de sessão e coleta de dados:

- **Playwright:** login e renovação de sessão.
- **Voyager:** scraping de perfis.

### Rotação e Validação

As requisições de scraping são assinadas com esses cookies, fazendo o LinkedIn acreditar que é uma navegação humana legítima.

### Rotação de Sessões Ativas

Quando há múltiplos cookies ativos salvos no banco, o sistema alterna entre eles ao processar o lote. Isso reduz pressão em uma única sessão e diminui chance de bloqueio concentrado.

### Logout por Conta

Cada conta possui ação de logout no painel. Ao executar:

1.  O cookie vinculado é marcado como inativo.
2.  A conta volta para estado pendente.
3.  O worker deixa de usar essa sessão na rotação.

### Renovação de Cookie

O painel suporta renovação de sessão de duas formas:

1.  **Renovar por conta:** refaz login Playwright para atualizar o cookie da conta.
2.  **Renovar em lote:** seleciona contas antigas/instáveis para renovação sequencial.

Critérios recomendados de renovação:

- último login acima de uma janela de staleness (ex.: 90 minutos);
- contas com erro recente;
- contas que exigem nova verificação (`NEEDS_2FA`) para ação manual.

---

## 4. Banco de Dados e Processamento em Lote

Para garantir persistência e processamento incremental, utilizamos um banco relacional.

### Estados do Perfil:

- `PENDING`: Perfil carregado mas ainda não processado.
- `SUCCESS`: Foto extraída com sucesso.
- `ERROR_AUTHWALL`: Falha por sessão bloqueada/expirada.
- `ERROR`: Falha final após tentativas ou perfil não encontrado.

### Fluxo de Execução:

1.  **Upload:** Nomes/URLs são inseridos na tabela `Profile`.
2.  **Seleção de Lote:** O backend busca registros `PENDING` com limite de lote (`count`) e teto de segurança.
3.  **Pacing Adaptativo:** Antes de cada perfil, aplica delay com jitter, variando entre limites mínimos/máximos.
4.  **Tentativas por Perfil:** Executa múltiplas tentativas com retry controlado.
5.  **Backoff por Bloqueio:** Em `RATE_LIMIT`, aumenta delay e respeita `Retry-After` quando disponível.
6.  **Persistência de Resultado:** Atualiza `profilePictureUrl`, `status` e `scratchAttempts`.
7.  **Deferred em Rate Limit:** Se ainda houver margem de tentativas, mantém o perfil em `PENDING` (incrementando tentativa) para nova rodada.

---

## 5. Resiliência e Anti-Bot

O sistema implementa várias técnicas para evitar detecção:

1.  **User-Agent Real:** Simula um navegador Chrome moderno em Windows.
2.  **API Interna vs Scraping Visual:** Ao usar a API Voyager, evitamos carregar CSS, Imagens e Scripts pesados que acionariam scripts de detecção de bots (como o Arkose Labs).
3.  **Extração de Alta Resolução:** O sistema analisa a árvore de imagens retornada pelo LinkedIn e escolhe automaticamente a versão com a maior largura (`displaySize.width`), garantindo fotos de alta qualidade.
4.  **Backoff Adaptativo:** Ritmo de requisição desacelera automaticamente sob sinal de throttling.
5.  **Retry com Jitter:** Evita padrão fixo entre tentativas, reduzindo comportamento robótico.
6.  **Rotação de Cookies:** Distribui carga entre sessões ativas.

### Métricas Retornadas pela API de Scrape

Além de `processed` e `success`, a rota retorna:

- `error`: total com falha final.
- `deferred`: perfis adiados (continuam `PENDING`).
- `authwall`: ocorrências de bloqueio/autenticação.
- `rateLimited`: ocorrências de limitação de taxa.
- `activeCookies`: quantidade de cookies ativos utilizados no lote.

---

## 6. Como Usar

1.  **Cadastrar Contas:** Na aba de contas, adicione email/senha e rótulo opcional.
2.  **Logar com Playwright:** Clique em login para gerar cookies automaticamente.
3.  **Verificar Sessão:** Confira status, último login e tokens mascarados salvos.
4.  **Carregar Perfis:** Use upload CSV/texto para inserir perfis.
5.  **Rodar em Lotes:** Execute a coleta (Voyager API) no volume desejado.
6.  **Renovar Sessões:** Use renovação por conta ou em lote quando necessário.
7.  **Exportar:** Exporte os resultados com as URLs de foto.

---

## 7. Limites Atuais e Próximos Passos

O modelo atual é síncrono por chamada HTTP. Para escala maior, o recomendado é migrar para worker/queue externa (ex.: job queue) com:

- processamento assíncrono desacoplado da requisição HTTP;
- controle de concorrência global;
- retries persistentes por job;
- observabilidade e alertas por fila.

---

_Documentação atualizada para o projeto LinkedIn Scraper - 2026._
