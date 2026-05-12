"use client";

import Image from "next/image";
import { useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("upload");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

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
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [logs, setLogs] = useState([]);
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsHasMore, setRecordsHasMore] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [retryingRecordId, setRetryingRecordId] = useState(null);
  const [cookies, setCookies] = useState([]);
  const [newCookieValue, setNewCookieValue] = useState("");
  const [loadingCookies, setLoadingCookies] = useState(false);
  const [cookieMessage, setCookieMessage] = useState("");

  const PAGE_SIZE = 25;

  const fetchStats = async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erro ao buscar estatísticas.");
    }

    setStats((prev) => ({ ...prev, ...data }));
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === "execution") {
      try {
        await fetchStats();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Erro ao buscar estatísticas.";
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ${message}`,
        ]);
      }
    }

    if (tab === "records") {
      await fetchRecords(1, false);
    }

    if (tab === "config") {
      fetchCookies();
    }
  };

  const fetchCookies = async () => {
    setLoadingCookies(true);
    try {
      const res = await fetch("/api/cookies");
      const data = await res.json();
      if (res.ok) {
        setCookies(data.cookies || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCookies(false);
    }
  };

  const handleAddCookie = async () => {
    if (!newCookieValue.trim()) return;
    setCookieMessage("Adicionando...");
    try {
      const res = await fetch("/api/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newCookieValue }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewCookieValue("");
        setCookieMessage("Sessão adicionada com sucesso!");
        await fetchCookies();
        setTimeout(() => setCookieMessage(""), 3000);
      } else {
        setCookieMessage(`Erro: ${data.error}`);
      }
    } catch (e) {
      setCookieMessage("Erro ao adicionar sessão.");
    }
  };

  const handleDeleteCookie = async (id) => {
    try {
      const res = await fetch(`/api/cookies/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCookies();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecords = async (page = 1, append = false) => {
    setLoadingRecords(true);
    try {
      const res = await fetch(
        `/api/records?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao buscar registros.");
      }

      setRecords((prev) =>
        append ? [...prev, ...data.records] : data.records,
      );
      setRecordsPage(data.page);
      setRecordsTotal(data.total);
      setRecordsHasMore(data.hasMore);
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setUploadMessage(
          `Upload concluído! Total: ${data.totalRows ?? 0}, Inseridos: ${data.inserted ?? 0}, Ignorados (duplicados): ${data.skipped ?? 0}, Inválidos: ${data.invalid ?? 0}`,
        );
        setFile(null);
      } else {
        setUploadMessage(`Erro: ${data.error}`);
      }
    } catch (e) {
      setUploadMessage("Erro na requisição de upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleScrape = async () => {
    if (scrapeCount < 1) return;
    setScraping(true);
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Iniciando coleta de ${scrapeCount} perfis...`,
    ]);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: scrapeCount }),
      });
      const data = await res.json();

      if (res.ok) {
        let successMsg = `[${new Date().toLocaleTimeString()}] Processados: ${data.processed || 0}`;
        if (data.authwalls > 0) {
            successMsg += ` (⚠️ ${data.authwalls} bloqueados por Authwall)`;
        } else {
            successMsg = `[${new Date().toLocaleTimeString()}] Sucesso! Perfis processados: ${data.processed || 0}`;
        }
        setLogs((prev) => [
          ...prev,
          successMsg,
        ]);
      } else {
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Erro: ${data.error}`,
        ]);
      }

      await fetchStats();
    } catch (e) {
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Erro fatal na coleta.`,
      ]);
    } finally {
      setScraping(false);
    }
  };

  const handleRefreshStats = async () => {
    setRefreshingStats(true);
    try {
      await fetchStats();
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Registros atualizados manualmente.`,
      ]);
    } catch (e) {
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Erro ao atualizar registros.`,
      ]);
    } finally {
      setRefreshingStats(false);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao exportar CSV.");
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] || "linkedin_profiles_export.csv";

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] CSV exportado com sucesso.`,
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro ao exportar CSV.";
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${message}`,
      ]);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleRetryRecord = async (record) => {
    setRetryingRecordId(record.id);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: record.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Falha ao reprocessar o registro.");
      }

      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Reprocessado: ${record.name}`,
      ]);

      await Promise.all([fetchStats(), fetchRecords(1, false)]);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Falha ao reprocessar o registro.";
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${record.name}: ${message}`,
      ]);
    } finally {
      setRetryingRecordId(null);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>LinkedIn Scraper</h1>
        <p className="subtitle">
          Extração automatizada de avatares com Playwright
        </p>
      </header>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => handleTabChange("upload")}
        >
          Upload CSV
        </button>
        <button
          className={`tab-btn ${activeTab === "execution" ? "active" : ""}`}
          onClick={() => handleTabChange("execution")}
        >
          Execução (Scratch)
        </button>
        <button
          className={`tab-btn ${activeTab === "records" ? "active" : ""}`}
          onClick={() => handleTabChange("records")}
        >
          Registros
        </button>
        <button
          className={`tab-btn ${activeTab === "config" ? "active" : ""}`}
          onClick={() => handleTabChange("config")}
        >
          Configuração
        </button>
      </div>

      {activeTab === "upload" && (
        <div className="card">
          <h2>Adicionar Novos Perfis</h2>
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "20px",
              fontSize: "0.9rem",
            }}
          >
            Faça upload de um arquivo CSV contendo as colunas{" "}
            <strong>Name</strong> e <strong>LinkedInURL</strong>.
          </p>

          <div className="input-group">
            <input type="file" accept=".csv" onChange={handleFileChange} />
          </div>

          <button
            className="btn"
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{ width: "100%" }}
          >
            {uploading ? "Processando..." : "Importar para Banco de Dados"}
          </button>

          {uploadMessage && (
            <div
              style={{
                marginTop: "20px",
                padding: "15px",
                background: "rgba(16, 185, 129, 0.1)",
                color: "var(--success-color)",
                borderRadius: "8px",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              {uploadMessage}
            </div>
          )}
        </div>
      )}

      {activeTab === "execution" && (
        <div className="card">
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-value primary">{stats.total}</div>
              <div className="stat-label">Total de Registros</div>
            </div>
            <div className="stat-box">
              <div className="stat-value warning">{stats.missingAvatar}</div>
              <div className="stat-label">Faltando Avatar</div>
            </div>
            <div className="stat-box">
              <div className="stat-value success">{stats.success}</div>
              <div className="stat-label">Extraídos (Sucesso)</div>
            </div>
            <div className="stat-box">
              <div className="stat-value primary">{stats.scratched}</div>
              <div className="stat-label">Já Raspados</div>
            </div>
            <div className="stat-box">
              <div className="stat-value warning">
                {stats.totalScratchAttempts}
              </div>
              <div className="stat-label">Tentativas de Scratch</div>
            </div>
          </div>

          <div className="input-group">
            <label>Quantidade de registros para raspar (Scratch)</label>
            <input
              type="number"
              min="1"
              max="50"
              value={scrapeCount}
              onChange={(e) => setScrapeCount(parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="actions-row">
            <button
              className="btn"
              onClick={handleScrape}
              disabled={scraping || stats.missingAvatar === 0}
              style={{ width: "100%" }}
            >
              {scraping ? "Rodando Scraper..." : "Iniciar Extração"}
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleRefreshStats}
              disabled={refreshingStats}
              style={{ width: "100%" }}
            >
              {refreshingStats ? "Atualizando..." : "Atualizar Registros"}
            </button>

            <button
              className="btn btn-secondary"
              onClick={handleExportCsv}
              disabled={exportingCsv || stats.total === 0}
              style={{ width: "100%" }}
            >
              {exportingCsv ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>

          <div className="log-panel">
            {logs.length === 0 ? (
              <span style={{ opacity: 0.5 }}>
                Aguardando início da execução...
              </span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="log-entry">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "records" && (
        <div className="card">
          <div className="records-header">
            <h2>Registros Já Raspados</h2>
            <span className="records-total">Total: {recordsTotal}</span>
          </div>

          {records.length === 0 && !loadingRecords ? (
            <div className="records-empty">
              Nenhum registro raspado encontrado.
            </div>
          ) : (
            <div className="records-list">
              {records.map((record) => (
                <div key={record.id} className="record-item">
                  <div className="record-photo-wrapper">
                    {record.profilePictureUrl ? (
                      <Image
                        src={record.profilePictureUrl}
                        alt={`Foto de ${record.name}`}
                        className="record-photo"
                        width={88}
                        height={88}
                        loading="lazy"
                        unoptimized
                      />
                    ) : (
                      <div className="record-no-photo">Sem foto</div>
                    )}
                  </div>

                  <div className="record-content">
                    <div className="record-name">{record.name}</div>
                    <a
                      href={record.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="record-link"
                    >
                      Perfil no LinkedIn
                    </a>

                    {record.profilePictureUrl ? (
                      <a
                        href={record.profilePictureUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="record-link"
                      >
                        Link da Foto
                      </a>
                    ) : (
                      <span className="record-link-muted">
                        Link da Foto: não disponível
                      </span>
                    )}

                    <div className="record-meta">
                      <span>Status: {record.status}</span>
                      <span>Tentativas: {record.scratchAttempts}</span>
                    </div>

                    <div className="record-actions-inline">
                      <button
                        className="btn btn-secondary btn-compact"
                        onClick={() => handleRetryRecord(record)}
                        disabled={retryingRecordId === record.id}
                      >
                        {retryingRecordId === record.id
                          ? "Tentando..."
                          : "Tentar novamente"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="records-actions">
            <button
              className="btn btn-secondary"
              onClick={() => fetchRecords(1, false)}
              disabled={loadingRecords}
            >
              {loadingRecords ? "Atualizando..." : "Atualizar Lista"}
            </button>

            <button
              className="btn"
              onClick={() => fetchRecords(recordsPage + 1, true)}
              disabled={loadingRecords || !recordsHasMore}
            >
              {recordsHasMore ? "Carregar Mais" : "Sem Mais Registros"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "config" && (
        <div className="card">
          <h2>Contas do LinkedIn (Cookies)</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: "20px", fontSize: "0.95rem", lineHeight: "1.5" }}>
            Adicione os cookies <strong>li_at</strong> das suas contas do LinkedIn. O sistema irá rotacionar automaticamente entre eles a cada perfil extraído (Round-Robin), diminuindo a chance de bloqueios.
          </p>

          <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "10px", border: "1px solid var(--surface-border)", marginBottom: "20px" }}>
            <h3 style={{ marginBottom: "15px", fontSize: "1.1rem" }}>Como encontrar o seu cookie:</h3>
            <ol style={{ marginLeft: "20px", color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "0.9rem" }}>
              <li>Abra o seu LinkedIn no navegador (Chrome, Firefox, etc.) e certifique-se de estar logado.</li>
              <li>Abra as Ferramentas de Desenvolvedor (F12 ou Botão Direito &gt; Inspecionar).</li>
              <li>Vá até a aba <strong>Application</strong> (ou Armazenamento).</li>
              <li>No menu esquerdo, expanda <strong>Cookies</strong> e clique em <code>https://www.linkedin.com</code>.</li>
              <li>Procure pelo cookie chamado <strong><code>li_at</code></strong> na lista e copie todo o seu valor (value).</li>
            </ol>
          </div>

            <div className="input-group">
              <label>Valor do cookie <code>li_at</code>:</label>
              <textarea 
                value={newCookieValue}
                onChange={(e) => setNewCookieValue(e.target.value)}
                placeholder="Cole o valor longo do cookie aqui..."
                rows="3"
                style={{
                  background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid var(--surface-border)",
                  color: "var(--text-primary)",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  fontSize: "1rem",
                  outline: "none",
                  fontFamily: "monospace",
                  resize: "vertical"
                }}
              />
            </div>
            
            <button 
              className="btn" 
              onClick={handleAddCookie}
              disabled={!newCookieValue.trim()}
              style={{ marginTop: "10px" }}
            >
              Adicionar Sessão
            </button>
            {cookieMessage && (
              <span style={{ marginLeft: "15px", color: cookieMessage.includes("Erro") ? "var(--error-color)" : "var(--success-color)", fontSize: "0.9rem" }}>
                {cookieMessage}
              </span>
            )}
          </div>

          <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "10px", border: "1px solid var(--surface-border)" }}>
            <h3 style={{ marginBottom: "15px", fontSize: "1.1rem" }}>Contas Configuradas ({cookies.length})</h3>
            
            {loadingCookies ? (
              <p style={{ color: "var(--text-secondary)" }}>Carregando...</p>
            ) : cookies.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>Nenhuma conta configurada. Adicione uma acima!</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {cookies.map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", padding: "10px 15px", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--text-primary)" }}>
                        {c.value.substring(0, 20)}...{c.value.substring(c.value.length - 10)}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "5px" }}>
                        Adicionado em: {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteCookie(c.id)}
                      style={{ background: "transparent", border: "1px solid var(--error-color)", color: "var(--error-color)", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontSize: "0.8rem" }}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: "20px", padding: "15px", background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: "0.9rem" }}>
            <strong>Atenção aos Bloqueios:</strong> Usar a sua sessão real aumenta a taxa de sucesso para perto de 100%, mas o LinkedIn pode banir ou suspender a sua conta temporariamente se você usar esse robô para visitar milhares de perfis por dia de forma muito rápida. Use com moderação!
          </div>
        </div>
      )}
    </div>
  );
}
