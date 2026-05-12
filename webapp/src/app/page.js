"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const TABS = [
  { id: "upload", label: "Upload CSV", hotkey: "⌘1", group: "Operacao" },
  { id: "execution", label: "Execucao", hotkey: "⌘2", group: "Operacao" },
  { id: "records", label: "Registros", hotkey: "⌘3", group: "Operacao" },
  { id: "accounts", label: "Contas", hotkey: "⌘4", group: "Contas" },
  { id: "config", label: "Sessao manual", hotkey: "⌘5", group: "Sistema" },
];

const PALETTES = [
  { key: "amber", name: "Amber" },
  { key: "indigo", name: "Indigo" },
  { key: "forest", name: "Forest" },
  { key: "oxblood", name: "Oxblood" },
  { key: "platinum", name: "Platinum" },
  { key: "graphite", name: "Graphite" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const [palette, setPalette] = useState("amber");
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
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsFilter, setRecordsFilter] = useState("SUCCESS");
  const [newCookieValue, setNewCookieValue] = useState("");
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

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const level = log?.level || "info";
      if (logFilter !== "all" && level !== logFilter) return false;
      if (logSearch.trim()) {
        const needle = logSearch.toLowerCase();
        return (log?.message || "").toLowerCase().includes(needle);
      }
      return true;
    });
  }, [logs, logFilter, logSearch]);

  const accountSummary = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === "OK").length;
    const pending = accounts.filter((a) => a.status === "PENDING").length;
    const issues = accounts.filter(
      (a) => a.status === "ERROR" || a.status === "NEEDS_2FA",
    ).length;
    return { total, active, pending, issues };
  }, [accounts]);

  const brandScore = useMemo(() => {
    const successRate =
      stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
    const activeWeight = accountSummary.total
      ? Math.round((accountSummary.active / accountSummary.total) * 100)
      : 0;
    const issuePenalty = Math.min(accountSummary.issues * 7, 28);
    return Math.max(
      25,
      Math.min(
        98,
        Math.round(successRate * 0.6 + activeWeight * 0.4 - issuePenalty),
      ),
    );
  }, [stats, accountSummary]);

  const ringOffset = useMemo(() => {
    const circumference = 603;
    return circumference - (circumference * brandScore) / 100;
  }, [brandScore]);

  const percentil = useMemo(
    () => Math.max(32, Math.min(99, Math.round(brandScore * 0.92 + 7))),
    [brandScore],
  );

  const staleAccounts = useMemo(
    () => accounts.filter((acc) => acc.shouldRefresh).length,
    [accounts],
  );

  const showBanner = (type, text) => setBanner({ type, text });

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  };

  const getStatusLabel = (status) => {
    if (status === "OK") return "ATIVO";
    if (status === "ERROR") return "ERRO";
    if (status === "NEEDS_2FA") return "2FA";
    return "PENDENTE";
  };

  const getStatusClass = (status) => {
    if (status === "OK") return "chip-good";
    if (status === "ERROR") return "chip-danger";
    if (status === "NEEDS_2FA") return "chip-warn";
    return "chip-warn";
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
        // bootstrap opportunistico
      }
    };

    bootstrap();
  }, []);

  const fetchStats = async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao buscar estatisticas.");
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
      showBanner("success", "Sessao renovada com sucesso.");
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
      for (const account of pending) {
        setLoginLoadingId(account.id);
        await fetch(`/api/accounts/${account.id}/login`, { method: "POST" });
      }
      setLoginLoadingId(null);
      await fetchAccounts();
      showBanner("success", "Login em lote concluido.");
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
      if (!planRes.ok) {
        throw new Error(planData.error || "Falha no plano de renovacao.");
      }

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
      showBanner("error", error.message || "Falha na renovacao de cookies.");
    } finally {
      setRenewLoading(false);
      setLoginLoadingId(null);
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

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    setBanner(null);
    if (tab === "execution") await fetchStats();
    if (tab === "records") await fetchRecords(1, false, recordsFilter);
    if (tab === "accounts") await fetchAccounts();
  };

  const handleFilterChange = (newStatus) => {
    setRecordsFilter(newStatus);
    fetchRecords(1, false, newStatus);
  };

  const handleFileChange = (event) => {
    if (event.target.files?.[0]) setFile(event.target.files[0]);
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
      showBanner("success", "Importacao concluida.");
    } catch (error) {
      showBanner("error", error.message || "Falha no upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleScrape = async () => {
    const pushUiLog = (message, level = "info") => {
      setLogs((prev) => [
        ...prev,
        {
          ts: new Date().toLocaleTimeString(),
          level,
          message,
        },
      ]);
    };

    setLogs([]);
    setScraping(true);
    pushUiLog("Iniciando execucao detalhada do lote...");
    try {
      const queueBeforeRes = await fetch("/api/scrape/jobs");
      const queueBeforeData = await queueBeforeRes.json().catch(() => ({}));
      if (queueBeforeRes.ok) {
        pushUiLog(
          `Fila antes do enqueue -> pendente: ${queueBeforeData.pending || 0}, em execucao: ${queueBeforeData.running || 0}, retry: ${queueBeforeData.retry || 0}`,
        );
      } else {
        pushUiLog("Nao foi possivel obter estado inicial da fila.", "warn");
      }

      const enqueueRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: scrapeCount }),
      });
      const enqueueData = await enqueueRes.json();

      if (!enqueueRes.ok) {
        pushUiLog(`Erro ao enfileirar: ${enqueueData.error}`, "error");
        showBanner("error", enqueueData.error || "Falha ao enfileirar.");
        return;
      }

      pushUiLog(
        `Enqueue concluido -> scan: ${enqueueData.scanned || 0}, enfileirados: ${enqueueData.enqueued || 0}, ja na fila: ${enqueueData.alreadyQueued || 0}, profundidade: ${enqueueData.queueDepth || 0}`,
      );

      const queueAfterEnqueueRes = await fetch("/api/scrape/jobs");
      const queueAfterEnqueueData = await queueAfterEnqueueRes
        .json()
        .catch(() => ({}));
      if (queueAfterEnqueueRes.ok) {
        pushUiLog(
          `Fila apos enqueue -> pendente: ${queueAfterEnqueueData.pending || 0}, em execucao: ${queueAfterEnqueueData.running || 0}, retry: ${queueAfterEnqueueData.retry || 0}`,
        );
      } else {
        pushUiLog("Falha ao ler fila apos enqueue.", "warn");
      }

      pushUiLog(
        `Disparando worker com maxJobs=${scrapeCount} (modo verboso)...`,
      );

      const workerRes = await fetch("/api/scrape/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs: scrapeCount, verbose: true }),
      });
      const workerData = await workerRes.json();

      if (Array.isArray(workerData.logs) && workerData.logs.length > 0) {
        for (const entry of workerData.logs) {
          const meta = entry?.meta ? ` | ${JSON.stringify(entry.meta)}` : "";
          const step = entry?.step ? `[${entry.step}] ` : "";
          const level = ["info", "warn", "error"].includes(entry?.level)
            ? entry.level
            : "info";
          pushUiLog(`${step}${entry?.message || "evento"}${meta}`, level);
        }
      }

      if (workerRes.ok) {
        pushUiLog(
          `Resumo worker -> processados: ${workerData.processed} | sucesso: ${workerData.success} | retry: ${workerData.retry} | falha: ${workerData.failed}`,
        );

        if (workerData.providers) {
          pushUiLog(
            `Uso de providers -> local-voyager: ${workerData.providers["local-voyager"] || 0}, apify: ${workerData.providers.apify || 0}`,
          );
        }

        showBanner("success", "Lote processado.");
      } else {
        pushUiLog(`Erro no worker: ${workerData.error}`, "error");
        showBanner("error", workerData.error || "Falha no worker.");
      }

      const queueAfterWorkerRes = await fetch("/api/scrape/jobs");
      const queueAfterWorkerData = await queueAfterWorkerRes
        .json()
        .catch(() => ({}));
      if (queueAfterWorkerRes.ok) {
        pushUiLog(
          `Fila apos worker -> pendente: ${queueAfterWorkerData.pending || 0}, em execucao: ${queueAfterWorkerData.running || 0}, retry: ${queueAfterWorkerData.retry || 0}, concluido: ${queueAfterWorkerData.completed || 0}, falho: ${queueAfterWorkerData.failed || 0}`,
        );
      } else {
        pushUiLog("Falha ao ler fila apos worker.", "warn");
      }

      await fetchStats();
      pushUiLog("Estatisticas atualizadas apos execucao.");
    } catch (error) {
      pushUiLog(
        `Erro fatal na execucao: ${error.message || "desconhecido"}`,
        "error",
      );
      showBanner("error", error.message || "Falha na execucao.");
    } finally {
      setScraping(false);
    }
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
    } catch (error) {
      showBanner("error", error.message || "Falha ao salvar cookie manual.");
    }
  };

  const groupedTabs = useMemo(() => {
    return TABS.reduce((acc, tab) => {
      if (!acc[tab.group]) acc[tab.group] = [];
      acc[tab.group].push(tab);
      return acc;
    }, {});
  }, []);

  return (
    <div className="app-shell" data-palette={palette}>
      <div className="palette-switcher">
        {PALETTES.map((item) => (
          <button
            key={item.key}
            className={`palette-btn ${palette === item.key ? "active" : ""}`}
            onClick={() => setPalette(item.key)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="cockpit-layout">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">FD</div>
            <div>
              <p className="brand-title">Career Intelligence</p>
              <p className="brand-meta">v2.4 · principal vault</p>
            </div>
          </div>

          {Object.entries(groupedTabs).map(([group, tabs]) => (
            <section key={group} className="nav-group">
              <p className="group-label">{group}</p>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => handleTabChange(tab.id)}
                  type="button"
                >
                  <span className="dot" />
                  <span>{tab.label}</span>
                  <span className="nav-hotkey">{tab.hotkey}</span>
                </button>
              ))}
            </section>
          ))}

          <div className="score-card">
            <div className="score-head">
              <span>Score atual</span>
              <span className="up">
                ↑ {Math.max(1, Math.round(brandScore / 17))}
              </span>
            </div>
            <p className="score-value">{brandScore}</p>
            <div className="score-progress">
              <span style={{ width: `${brandScore}%` }} />
            </div>
            <p className="score-foot">
              last sync · {staleAccounts > 0 ? "stale" : "fresh"}
            </p>
          </div>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div className="path">
              ~/career-intel / {TABS.find((t) => t.id === activeTab)?.label}
            </div>
            <div className="top-actions">
              <button
                className="primary-btn"
                type="button"
                onClick={fetchStats}
              >
                Re-sincronizar
              </button>
            </div>
          </header>

          <div className="content-wrap">
            {activeTab === "upload" && (
              <>
                <section className="score-grid">
                  <article className="panel score-panel">
                    <p className="label">Brand Score</p>
                    <div className="ring-wrap">
                      <svg
                        viewBox="0 0 220 220"
                        className="ring-svg"
                        aria-hidden="true"
                      >
                        <circle
                          cx="110"
                          cy="110"
                          r="96"
                          fill="none"
                          strokeWidth="14"
                          className="ring-bg"
                        />
                        <circle
                          cx="110"
                          cy="110"
                          r="96"
                          fill="none"
                          strokeWidth="14"
                          className="ring-fg"
                          strokeLinecap="round"
                          strokeDasharray="603"
                          strokeDashoffset={ringOffset}
                        />
                      </svg>
                      <div className="ring-center">
                        <p className="ring-score">{brandScore}</p>
                        <p className="ring-max">de 100</p>
                      </div>
                    </div>
                    <div className="score-meta">
                      <span className="chip chip-good">BOM</span>
                      <span className="mono">
                        ativos {accountSummary.active}
                      </span>
                    </div>
                  </article>

                  <article className="panel breakdown-panel">
                    <div className="section-head">
                      <p className="label">Saude operacional</p>
                      <p className="mono small">dados reais do sistema</p>
                    </div>
                    <div className="bars">
                      <div className="bar-row">
                        <div className="bar-top">
                          <span>Taxa de sucesso</span>
                          <strong>
                            {stats.total > 0
                              ? Math.round((stats.success / stats.total) * 100)
                              : 0}
                            %
                          </strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="bar-row">
                        <div className="bar-top">
                          <span>Contas ativas</span>
                          <strong>
                            {accountSummary.total > 0
                              ? Math.round(
                                  (accountSummary.active /
                                    accountSummary.total) *
                                    100,
                                )
                              : 0}
                            %
                          </strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${accountSummary.total > 0 ? Math.round((accountSummary.active / accountSummary.total) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="bar-row">
                        <div className="bar-top">
                          <span>Perfis com erro</span>
                          <strong>{stats.error}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${stats.total > 0 ? Math.round((stats.error / stats.total) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="bar-row">
                        <div className="bar-top">
                          <span>Sem avatar</span>
                          <strong>{stats.missingAvatar}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${stats.total > 0 ? Math.round((stats.missingAvatar / stats.total) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="bar-row">
                        <div className="bar-top">
                          <span>Renovacao recomendada</span>
                          <strong>{staleAccounts}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${accountSummary.total > 0 ? Math.round((staleAccounts / accountSummary.total) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                </section>

                <section className="kpi-row">
                  <article className="kpi">
                    <p className="label">Conexoes</p>
                    <p className="kpi-value">{stats.total}</p>
                    <p className="kpi-foot">total no pipeline</p>
                  </article>
                  <article className="kpi">
                    <p className="label">Sucesso</p>
                    <p className="kpi-value">{stats.success}</p>
                    <p className="kpi-foot">coletas validas</p>
                  </article>
                  <article className="kpi">
                    <p className="label">Erros</p>
                    <p className="kpi-value">{stats.error}</p>
                    <p className="kpi-foot">com retry necessario</p>
                  </article>
                  <article className="kpi">
                    <p className="label">Contas ativas</p>
                    <p className="kpi-value">{accountSummary.active}</p>
                    <p className="kpi-foot">
                      de {accountSummary.total} cadastradas
                    </p>
                  </article>
                </section>

                <section className="quick-grid">
                  <article className="panel quick-panel">
                    <div className="section-head">
                      <p>Acoes rapidas</p>
                      <span className="mono small">operacao</span>
                    </div>
                    <div className="quick-actions">
                      <button
                        className="primary-btn"
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
                        className="ghost-btn"
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
                      <button
                        className="ghost-btn"
                        onClick={() => handleTabChange("execution")}
                      >
                        Ir para execucao
                      </button>
                      <button
                        className="ghost-btn"
                        onClick={() => handleTabChange("accounts")}
                      >
                        Ir para contas
                      </button>
                    </div>
                  </article>

                  <article className="panel quick-panel">
                    <div className="section-head">
                      <p>Alertas ativos</p>
                      <span className="mono small">tempo real</span>
                    </div>
                    <ul className="alert-list">
                      <li>
                        <span>Contas com falha</span>
                        <strong>{accountSummary.issues}</strong>
                      </li>
                      <li>
                        <span>Contas pendentes</span>
                        <strong>{accountSummary.pending}</strong>
                      </li>
                      <li>
                        <span>Refresh recomendado</span>
                        <strong>{staleAccounts}</strong>
                      </li>
                    </ul>
                  </article>
                </section>
              </>
            )}

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

            <section className="panel work-panel">
              {activeTab === "upload" && (
                <div className="stack">
                  <h2>Importar perfis</h2>
                  <p className="small muted">
                    Faça upload do CSV e prepare o lote para processamento.
                  </p>
                  <div className="upload-box">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                    />
                    <button
                      className="primary-btn"
                      onClick={handleUpload}
                      disabled={!file || uploading}
                    >
                      {uploading ? "Importando..." : "Importar CSV"}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "execution" && (
                <div className="stack">
                  <div className="section-head">
                    <h2>Execucao do lote</h2>
                    <button className="ghost-btn" onClick={fetchStats}>
                      Atualizar metricas
                    </button>
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
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value, 10);
                          setScrapeCount(
                            Number.isFinite(value) && value > 0 ? value : 1,
                          );
                        }}
                      />
                    </div>
                    <button
                      className="primary-btn"
                      onClick={handleScrape}
                      disabled={scraping}
                    >
                      {scraping ? "Processando..." : "Iniciar lote"}
                    </button>
                  </div>
                  <div className="log-toolbar">
                    <div className="log-filters">
                      {["all", "info", "warn", "error"].map((f) => (
                        <button
                          key={f}
                          className={`ghost-btn log-filter-btn ${logFilter === f ? "active" : ""}`}
                          onClick={() => setLogFilter(f)}
                        >
                          {f === "all" ? "Todos" : f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <input
                      className="log-search"
                      type="text"
                      placeholder="Buscar nos logs..."
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                    />
                    {logs.length > 0 && (
                      <span className="log-count">
                        {filteredLogs.length}/{logs.length}
                      </span>
                    )}
                  </div>
                  <div className="log-panel">
                    {logs.length === 0 ? (
                      <div className="log-empty">
                        Os logs da execucao aparecem aqui.
                      </div>
                    ) : filteredLogs.length === 0 ? (
                      <div className="log-empty">
                        Nenhum log corresponde ao filtro.
                      </div>
                    ) : (
                      filteredLogs.map((log, index) => {
                        const level = log?.level || "info";
                        return (
                          <div
                            key={`${log?.ts || "sem-ts"}-${index}`}
                            className={`log-entry log-${level}`}
                          >
                            <span className={`log-badge log-badge-${level}`}>
                              {String(level).toUpperCase()}
                            </span>
                            <span className="log-time">
                              [{log?.ts || "--:--:--"}]
                            </span>
                            <span className="log-message">
                              {log?.message || ""}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {activeTab === "records" && (
                <div className="stack">
                  <div className="section-head">
                    <h2>Resultados da coleta</h2>
                    <div className="filter-group">
                      <button
                        className={`ghost-btn ${recordsFilter === "SUCCESS" ? "active" : ""}`}
                        onClick={() => handleFilterChange("SUCCESS")}
                      >
                        Com foto
                      </button>
                      <button
                        className={`ghost-btn ${recordsFilter === "ERROR" ? "active" : ""}`}
                        onClick={() => handleFilterChange("ERROR")}
                      >
                        Com erro
                      </button>
                      <button
                        className={`ghost-btn ${recordsFilter === "" ? "active" : ""}`}
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
                      records.map((record) => (
                        <article key={record.id} className="record-item">
                          <div className="record-photo-wrapper">
                            {record.profilePictureUrl ? (
                              <Image
                                src={record.profilePictureUrl}
                                alt={record.name}
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
                            <div className="record-name">{record.name}</div>
                            <div className="record-meta">
                              Status: {record.status}
                            </div>
                            <a
                              href={record.linkedinUrl}
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
                      className="ghost-btn"
                      onClick={() => fetchRecords(1, false, recordsFilter)}
                      disabled={loadingRecords}
                    >
                      Atualizar
                    </button>
                    <button
                      className="primary-btn"
                      onClick={() =>
                        fetchRecords(recordsPage + 1, true, recordsFilter)
                      }
                      disabled={loadingRecords || !recordsHasMore}
                    >
                      Ver mais
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "accounts" && (
                <div className="stack">
                  <div className="section-head">
                    <h2>Contas LinkedIn</h2>
                    <div className="filter-group">
                      <button
                        className="primary-btn"
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
                        className="ghost-btn"
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

                  <div className="form-grid">
                    <div className="input-group">
                      <label htmlFor="newEmail">Email</label>
                      <input
                        id="newEmail"
                        type="email"
                        placeholder="email@dominio.com"
                        value={newEmail}
                        onChange={(event) => setNewEmail(event.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="newPassword">Senha</label>
                      <input
                        id="newPassword"
                        type="password"
                        placeholder="Informe a senha"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label htmlFor="newAccountLabel">Rotulo</label>
                      <input
                        id="newAccountLabel"
                        type="text"
                        placeholder="ex.: equipe-a-01"
                        value={newAccountLabel}
                        onChange={(event) =>
                          setNewAccountLabel(event.target.value)
                        }
                      />
                    </div>
                    <button
                      className="primary-btn"
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
                      <p className="records-empty">
                        Nenhuma conta cadastrada ainda.
                      </p>
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
                              className={`chip ${getStatusClass(acc.status)}`}
                            >
                              {getStatusLabel(acc.status)}
                            </span>
                          </div>

                          <div className="account-meta">
                            <div>
                              Ultimo login: {formatDate(acc.lastLoginAt)}
                            </div>
                            <div>
                              Cookie:{" "}
                              {acc.cookie?.isActive ? "ativo" : "inativo"} |
                              Atualizado: {formatDate(acc.cookie?.updatedAt)}
                            </div>
                            <div>
                              li_at: {acc.cookie?.liAtMasked || "ausente"} |
                              JSESSIONID:{" "}
                              {acc.cookie?.jsessionIdMasked || "ausente"}
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
                              className="ghost-btn"
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
                              className="ghost-btn"
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
                              className="danger-btn"
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
                </div>
              )}

              {activeTab === "config" && (
                <div className="stack">
                  <h2>Cookie manual de sessao</h2>
                  <p className="small muted">
                    Use esta opcao quando quiser injetar uma sessao manualmente.
                  </p>
                  <div className="input-group">
                    <label htmlFor="cookieValue">Cookie</label>
                    <textarea
                      id="cookieValue"
                      value={newCookieValue}
                      onChange={(event) =>
                        setNewCookieValue(event.target.value)
                      }
                      placeholder="Cole o cookie completo aqui"
                      rows="5"
                    />
                  </div>
                  <button
                    className="primary-btn"
                    onClick={handleAddCookie}
                    disabled={!newCookieValue.trim()}
                  >
                    Salvar cookie
                  </button>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
