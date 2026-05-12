"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [banner, setBanner] = useState(null);

  const [stats, setStats] = useState({
    total: 0,
    missingAvatar: 0,
    success: 0,
    error: 0,
    scratched: 0,
    totalScratchAttempts: 0,
  });
  const [scrapeCount, setScrapeCount] = useState(5);
  const [scraping, setScraping] = useState(false);
  const [logs, setLogs] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsFilter, setRecordsFilter] = useState("SUCCESS");
  const [newCookieValue, setNewCookieValue] = useState("");

  // Accounts
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loginLoadingId, setLoginLoadingId] = useState(null);
  const [logoutLoadingId, setLogoutLoadingId] = useState(null);
  const [loginAllLoading, setLoginAllLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");

  const PAGE_SIZE = 25;
  const TABS = [
    { id: "upload", label: "Upload" },
    { id: "execution", label: "Execução" },
    { id: "records", label: "Registros" },
    { id: "accounts", label: "Contas" },
    { id: "config", label: "Sessão" },
  ];

  const accountSummary = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === "OK").length;
    const pending = accounts.filter((a) => a.status === "PENDING").length;
    const issues = accounts.filter(
      (a) => a.status === "ERROR" || a.status === "NEEDS_2FA",
    ).length;
    return { total, active, pending, issues };
  }, [accounts]);

  const showBanner = (type, text) => setBanner({ type, text });

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [statsRes, accountsRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/accounts"),
        ]);

        const statsData = await statsRes.json().catch(() => null);
        const accountsData = await accountsRes.json().catch(() => null);

        if (statsRes.ok && statsData) {
          setStats((prev) => ({ ...prev, ...statsData }));
        }
        if (accountsRes.ok && accountsData?.accounts) {
          setAccounts(accountsData.accounts);
        }
      } catch {
        // Ignore bootstrap failures; tabs load data on demand.
      }
    };

    bootstrap();
  }, []);

  const fetchStats = async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao buscar estatísticas.");
    setStats((prev) => ({ ...prev, ...data }));
  };

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (res.ok) setAccounts(data.accounts);
      else throw new Error(data.error || "Falha ao carregar contas.");
    } catch (error) {
      showBanner("error", error.message || "Falha ao carregar contas.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newEmail.trim() || !newPassword.trim()) return;
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          label: newAccountLabel.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar conta.");

      setNewEmail("");
      setNewPassword("");
      setNewAccountLabel("");
      await fetchAccounts();
      showBanner("success", "Conta salva com sucesso.");
    } catch (error) {
      showBanner("error", error.message || "Falha ao salvar conta.");
    }
  };

  const handleDeleteAccount = async (id) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao excluir conta.");

      await fetchAccounts();
      showBanner("success", "Conta removida.");
    } catch (error) {
      showBanner("error", error.message || "Falha ao excluir conta.");
    }
  };

  const handleLoginAccount = async (id) => {
    setLoginLoadingId(id);
    try {
      const res = await fetch(`/api/accounts/${id}/login`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha no login da conta.");

      await fetchAccounts();
      showBanner("success", "Sessão renovada com sucesso.");
    } catch (error) {
      showBanner("error", error.message || "Falha no login da conta.");
    } finally {
      setLoginLoadingId(null);
    }
  };

  const handleLoginAll = async () => {
    setLoginAllLoading(true);
    try {
      const pending = accounts.filter((a) => a.status !== "OK");
      for (const a of pending) {
        setLoginLoadingId(a.id);
        await fetch(`/api/accounts/${a.id}/login`, { method: "POST" });
      }
      setLoginLoadingId(null);
      await fetchAccounts();
      showBanner("success", "Login em lote concluído.");
    } catch (error) {
      showBanner("error", error.message || "Falha no login em lote.");
    } finally {
      setLoginAllLoading(false);
      setLoginLoadingId(null);
    }
  };

  const handleLogoutAccount = async (id) => {
    setLogoutLoadingId(id);
    try {
      const res = await fetch(`/api/accounts/${id}/logout`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao fazer logout.");

      await fetchAccounts();
      showBanner("success", "Logout aplicado na conta.");
    } catch (error) {
      showBanner("error", error.message || "Falha ao fazer logout.");
    } finally {
      setLogoutLoadingId(null);
    }
  };

  const handleRenewStale = async () => {
    setRenewLoading(true);
    try {
      const planRes = await fetch("/api/accounts/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staleMinutes: 90, maxAccounts: 20 }),
      });
      const planData = await planRes.json();
      if (!planRes.ok)
        throw new Error(planData.error || "Falha no plano de renovação.");

      for (const id of planData.accountIds || []) {
        setLoginLoadingId(id);
        await fetch(`/api/accounts/${id}/login`, { method: "POST" });
      }
      setLoginLoadingId(null);
      await fetchAccounts();
      showBanner(
        "success",
        `${planData.accountIds?.length || 0} conta(s) renovada(s).`,
      );
    } catch (error) {
      showBanner("error", error.message || "Falha na renovação de cookies.");
    } finally {
      setRenewLoading(false);
      setLoginLoadingId(null);
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    setBanner(null);
    if (tab === "execution") await fetchStats();
    if (tab === "records") await fetchRecords(1, false, recordsFilter);
    if (tab === "accounts") await fetchAccounts();
  };

  const handleAddCookie = async () => {
    if (!newCookieValue.trim()) return;
    try {
      const res = await fetch("/api/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newCookieValue }),
      });
      if (res.ok) {
        setNewCookieValue("");
        showBanner("success", "Cookie manual salvo.");
      }
    } catch (e) {
      showBanner("error", e.message || "Falha ao salvar cookie manual.");
    }
  };

  const fetchRecords = async (page = 1, append = false, status = "SUCCESS") => {
    setLoadingRecords(true);
    try {
      const url = `/api/records?page=${page}&pageSize=${PAGE_SIZE}${status ? `&status=${status}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro.");
      setRecords((prev) =>
        append ? [...prev, ...data.records] : data.records,
      );
      setRecordsPage(data.page);
      setRecordsHasMore(data.hasMore);
    } catch (error) {
      showBanner("error", error.message || "Falha ao carregar registros.");
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleFilterChange = (newStatus) => {
    setRecordsFilter(newStatus);
    fetchRecords(1, false, newStatus);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no upload.");
      showBanner("success", "Importação concluída.");
    } catch (e) {
      showBanner("error", e.message || "Falha no upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Iniciando...`,
    ]);
    try {
      const enqueueRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: scrapeCount }),
      });
      const enqueueData = await enqueueRes.json();

      if (!enqueueRes.ok) {
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Erro ao enfileirar: ${enqueueData.error}`,
        ]);
        showBanner("error", enqueueData.error || "Falha ao enfileirar.");
        return;
      }

      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Enfileirados: ${enqueueData.enqueued}`,
      ]);

      const workerRes = await fetch("/api/scrape/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs: scrapeCount }),
      });
      const workerData = await workerRes.json();

      if (workerRes.ok) {
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Processados: ${workerData.processed} | Sucesso: ${workerData.success} | Retry: ${workerData.retry} | Falha: ${workerData.failed}`,
        ]);
        showBanner("success", "Lote processado.");
      } else {
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Erro no worker: ${workerData.error}`,
        ]);
        showBanner("error", workerData.error || "Falha no worker.");
      }

      await fetchStats();
    } catch (e) {
      setLogs((prev) => [...prev, `Erro fatal.`]);
      showBanner("error", e.message || "Falha na execução.");
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="noise-layer" />
      <div className="container">
        <header className="hero">
          <div className="hero-grid">
            <div className="hero-main">
              <p className="eyebrow">LinkedIn Data Console</p>
              <h1>Painel de scraping via Voyager com sessão Playwright</h1>
              <p className="subtitle">
                Gerencie contas, renove cookies e rode lotes com observabilidade
                operacional em tempo real.
              </p>
              <div className="hero-stats">
                <div className="hero-stat">
                  <span>Contas ativas</span>
                  <strong>{accountSummary.active}</strong>
                </div>
                <div className="hero-stat">
                  <span>Pendentes</span>
                  <strong>{accountSummary.pending}</strong>
                </div>
                <div className="hero-stat">
                  <span>Com alerta</span>
                  <strong>{accountSummary.issues}</strong>
                </div>
              </div>
            </div>

            <aside className="hero-aside">
              <div className="hero-aside-block">
                <span className="aside-label">Pipeline hoje</span>
                <strong>{stats.total}</strong>
                <small>
                  {stats.success} sucesso | {stats.error} erro
                </small>
              </div>

              <div className="hero-aside-block">
                <span className="aside-label">Modos ativos</span>
                <ul className="quick-list">
                  <li className="quick-item">Playwright login</li>
                  <li className="quick-item">Voyager scraping</li>
                  <li className="quick-item">Rotação de sessão</li>
                </ul>
              </div>

              <div className="hero-aside-block mono">
                <span className="aside-label">Endpoints</span>
                <small>/api/accounts</small>
                <small>/api/scrape/worker</small>
              </div>
            </aside>
          </div>
        </header>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            <span>VOYAGER MODE</span>
            <span>COOKIE ROTATION</span>
            <span>PLAYWRIGHT LOGIN</span>
            <span>QUEUE READY</span>
            <span>OBSERVABILITY</span>
            <span>VOYAGER MODE</span>
            <span>COOKIE ROTATION</span>
            <span>PLAYWRIGHT LOGIN</span>
            <span>QUEUE READY</span>
            <span>OBSERVABILITY</span>
          </div>
        </div>

        <nav className="tabs" aria-label="Navegação do painel">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {banner && (
          <div
            className={`banner ${banner.type === "error" ? "error" : "success"}`}
          >
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)}>
              Fechar
            </button>
          </div>
        )}

        {activeTab === "upload" && (
          <section className="card">
            <h2>Importar perfis</h2>
            <p className="section-desc">
              Faça upload do CSV e prepare o lote para processamento.
            </p>
            <div className="upload-box">
              <input type="file" accept=".csv" onChange={handleFileChange} />
              <button
                className="btn"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? "Importando..." : "Importar CSV"}
              </button>
            </div>
          </section>
        )}

        {activeTab === "execution" && (
          <section className="card">
            <div className="records-header">
              <h2>Execução do lote</h2>
              <button className="btn btn-secondary" onClick={fetchStats}>
                Atualizar métricas
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-label">Total</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Faltando</div>
                <div className="stat-value warning">{stats.missingAvatar}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Sucesso</div>
                <div className="stat-value success">{stats.success}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Erros</div>
                <div className="stat-value error">{stats.error}</div>
              </div>
            </div>

            <div className="execution-row">
              <div className="input-group">
                <label htmlFor="scrapeCount">Quantidade por rodada</label>
                <input
                  id="scrapeCount"
                  type="number"
                  min="1"
                  max="100"
                  value={scrapeCount}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    setScrapeCount(
                      Number.isFinite(value) && value > 0 ? value : 1,
                    );
                  }}
                />
              </div>

              <button
                className="btn"
                onClick={handleScrape}
                disabled={scraping}
              >
                {scraping ? "Processando..." : "Iniciar lote"}
              </button>
            </div>

            <div className="log-panel">
              {logs.length === 0 ? (
                <div className="log-empty">
                  Os logs da execução aparecem aqui.
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={`${l}-${i}`} className="log-entry">
                    {l}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "records" && (
          <section className="card">
            <div className="records-header">
              <h2>Resultados da coleta</h2>
              <div className="filter-group">
                <button
                  className={`btn-compact ${recordsFilter === "SUCCESS" ? "active" : ""}`}
                  onClick={() => handleFilterChange("SUCCESS")}
                >
                  Com foto
                </button>
                <button
                  className={`btn-compact ${recordsFilter === "ERROR" ? "active" : ""}`}
                  onClick={() => handleFilterChange("ERROR")}
                >
                  Com erro
                </button>
                <button
                  className={`btn-compact ${recordsFilter === "" ? "active" : ""}`}
                  onClick={() => handleFilterChange("")}
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="records-list">
              {records.length === 0 && !loadingRecords ? (
                <p className="records-empty">
                  Nenhum registro encontrado para este filtro.
                </p>
              ) : (
                records.map((r) => (
                  <article key={r.id} className="record-item">
                    <div className="record-photo-wrapper">
                      {r.profilePictureUrl ? (
                        <Image
                          src={r.profilePictureUrl}
                          alt={r.name}
                          width={88}
                          height={88}
                          className="record-photo"
                          unoptimized
                        />
                      ) : (
                        <div className="record-no-photo">Sem foto</div>
                      )}
                    </div>

                    <div className="record-content">
                      <div className="record-name">{r.name}</div>
                      <div className="record-meta">Status: {r.status}</div>
                      <a
                        href={r.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="record-link"
                      >
                        Abrir perfil
                      </a>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="records-actions">
              <button
                className="btn btn-secondary"
                onClick={() => fetchRecords(1, false, recordsFilter)}
                disabled={loadingRecords}
              >
                Atualizar
              </button>
              <button
                className="btn"
                onClick={() =>
                  fetchRecords(recordsPage + 1, true, recordsFilter)
                }
                disabled={loadingRecords || !recordsHasMore}
              >
                Ver mais
              </button>
            </div>
          </section>
        )}

        {activeTab === "accounts" && (
          <section className="card">
            <div className="records-header">
              <h2>Contas LinkedIn</h2>
              <div className="filter-group">
                <button
                  className="btn"
                  onClick={handleLoginAll}
                  disabled={
                    loginAllLoading ||
                    renewLoading ||
                    loginLoadingId !== null ||
                    logoutLoadingId !== null
                  }
                >
                  {loginAllLoading ? "Executando..." : "Login em todas"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleRenewStale}
                  disabled={
                    renewLoading ||
                    loginAllLoading ||
                    loginLoadingId !== null ||
                    logoutLoadingId !== null
                  }
                >
                  {renewLoading ? "Renovando..." : "Renovar cookies"}
                </button>
              </div>
            </div>

            <p className="section-desc">
              Login e renovação são feitos via Playwright. O scraping usa
              somente a API Voyager.
            </p>

            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="newEmail">Email</label>
                <input
                  id="newEmail"
                  type="email"
                  placeholder="email@dominio.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label htmlFor="newPassword">Senha</label>
                <input
                  id="newPassword"
                  type="password"
                  placeholder="Informe a senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label htmlFor="newAccountLabel">Rótulo</label>
                <input
                  id="newAccountLabel"
                  type="text"
                  placeholder="ex.: equipe-a-01"
                  value={newAccountLabel}
                  onChange={(e) => setNewAccountLabel(e.target.value)}
                />
              </div>

              <button
                className="btn"
                onClick={handleAddAccount}
                disabled={!newEmail.trim() || !newPassword.trim()}
              >
                Adicionar conta
              </button>
            </div>

            <div className="account-summary-row">
              <span>Total: {accountSummary.total}</span>
              <span>Ativas: {accountSummary.active}</span>
              <span>Pendentes: {accountSummary.pending}</span>
              <span>Alertas: {accountSummary.issues}</span>
            </div>

            <div className="accounts-grid">
              {loadingAccounts && (
                <p className="records-empty">Carregando contas...</p>
              )}
              {!loadingAccounts && accounts.length === 0 && (
                <p className="records-empty">Nenhuma conta cadastrada ainda.</p>
              )}

              {accounts.map((acc) => {
                const isLoggingIn = loginLoadingId === acc.id;
                const isLoggingOut = logoutLoadingId === acc.id;
                return (
                  <article key={acc.id} className="account-card">
                    <div className="account-head">
                      <div>
                        <strong>{acc.label || acc.email}</strong>
                        {acc.label && <small>{acc.email}</small>}
                      </div>
                      <span
                        className={`status-pill ${String(acc.status || "").toLowerCase()}`}
                      >
                        {acc.status === "OK"
                          ? "Ativo"
                          : acc.status === "ERROR"
                            ? "Erro"
                            : acc.status === "NEEDS_2FA"
                              ? "2FA"
                              : "Pendente"}
                      </span>
                    </div>

                    <div className="account-meta">
                      <div>Último login: {formatDate(acc.lastLoginAt)}</div>
                      <div>
                        Cookie: {acc.cookie?.isActive ? "ativo" : "inativo"} |
                        Atualizado: {formatDate(acc.cookie?.updatedAt)}
                      </div>
                      <div>
                        li_at: {acc.cookie?.liAtMasked || "ausente"} |
                        JSESSIONID: {acc.cookie?.jsessionIdMasked || "ausente"}
                      </div>
                      {acc.lastError && (
                        <div className="account-error">
                          Erro: {acc.lastError}
                        </div>
                      )}
                      {acc.shouldRefresh && (
                        <div className="account-warn">
                          Recomendado renovar este cookie.
                        </div>
                      )}
                    </div>

                    <div className="account-actions">
                      <button
                        className="btn-compact"
                        onClick={() => handleLoginAccount(acc.id)}
                        disabled={
                          isLoggingIn ||
                          isLoggingOut ||
                          loginAllLoading ||
                          renewLoading
                        }
                      >
                        {isLoggingIn
                          ? "Processando"
                          : acc.status === "OK"
                            ? "Renovar"
                            : "Login"}
                      </button>

                      <button
                        className="btn-compact"
                        onClick={() => handleLogoutAccount(acc.id)}
                        disabled={
                          isLoggingIn ||
                          isLoggingOut ||
                          loginAllLoading ||
                          renewLoading
                        }
                      >
                        {isLoggingOut ? "Processando" : "Logout"}
                      </button>

                      <button
                        className="btn-compact danger"
                        onClick={() => handleDeleteAccount(acc.id)}
                        disabled={isLoggingIn || isLoggingOut}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "config" && (
          <section className="card">
            <h2>Cookie manual de sessão</h2>
            <p className="section-desc">
              Use esta opção somente quando quiser injetar uma sessão
              manualmente.
            </p>

            <div className="input-group">
              <label htmlFor="cookieValue">Cookie</label>
              <textarea
                id="cookieValue"
                value={newCookieValue}
                onChange={(e) => setNewCookieValue(e.target.value)}
                placeholder="Cole o cookie completo aqui"
                rows="5"
              />
            </div>

            <button
              className="btn"
              onClick={handleAddCookie}
              disabled={!newCookieValue.trim()}
            >
              Salvar cookie
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
