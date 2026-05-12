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
  const [recordsFilter, setRecordsFilter] = useState("SUCCESS");
  const [retryingRecordId, setRetryingRecordId] = useState(null);
  const [cookies, setCookies] = useState([]);
  const [newCookieValue, setNewCookieValue] = useState("");
  const [loadingCookies, setLoadingCookies] = useState(false);
  const [cookieMessage, setCookieMessage] = useState("");

  const PAGE_SIZE = 25;

  const bookmarkletCode = `javascript:(function(){const c=document.cookie;const dummy=document.createElement('textarea');document.body.appendChild(dummy);dummy.value=c;dummy.select();document.execCommand('copy');document.body.removeChild(dummy);alert('✅ Cookies copiados! Agora cole no campo do Scraper.');})();`;

  const fetchStats = async () => {
    const res = await fetch("/api/stats");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao buscar estatísticas.");
    setStats((prev) => ({ ...prev, ...data }));
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === "execution") await fetchStats();
    if (tab === "records") await fetchRecords(1, false, recordsFilter);
    if (tab === "config") fetchCookies();
  };

  const fetchCookies = async () => {
    setLoadingCookies(true);
    try {
      const res = await fetch("/api/cookies");
      const data = await res.json();
      if (res.ok) setCookies(data.cookies || []);
    } catch (e) { console.error(e); } finally { setLoadingCookies(false); }
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
      if (res.ok) {
        setNewCookieValue("");
        setCookieMessage("Sessão adicionada!");
        await fetchCookies();
        setTimeout(() => setCookieMessage(""), 3000);
      } else {
        const data = await res.json();
        setCookieMessage(`Erro: ${data.error}`);
      }
    } catch (e) { setCookieMessage("Erro ao adicionar."); }
  };

  const handleDeleteCookie = async (id) => {
    try {
      const res = await fetch(`/api/cookies/${id}`, { method: "DELETE" });
      if (res.ok) await fetchCookies();
    } catch (e) { console.error(e); }
  };

  const fetchRecords = async (page = 1, append = false, status = "SUCCESS") => {
    setLoadingRecords(true);
    try {
      const url = `/api/records?page=${page}&pageSize=${PAGE_SIZE}${status ? `&status=${status}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro.");
      setRecords((prev) => append ? [...prev, ...data.records] : data.records);
      setRecordsPage(data.page);
      setRecordsTotal(data.total);
      setRecordsHasMore(data.hasMore);
    } finally { setLoadingRecords(false); }
  };

  const handleFilterChange = (newStatus) => {
    setRecordsFilter(newStatus);
    fetchRecords(1, false, newStatus);
  };

  const handleFileChange = (e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) setUploadMessage(`Upload ok!`);
      else setUploadMessage(`Erro: ${data.error}`);
    } catch (e) { setUploadMessage("Erro no upload."); } finally { setUploading(false); }
  };

  const handleScrape = async () => {
    setScraping(true);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Iniciando...`]);
    try {
      const res = await fetch("/api/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: scrapeCount }) });
      const data = await res.json();
      if (res.ok) setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sucesso: ${data.processed}`]);
      else setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Erro: ${data.error}`]);
      await fetchStats();
    } catch (e) { setLogs(prev => [...prev, `Erro fatal.`]); } finally { setScraping(false); }
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    alert("Código copiado! Atualize seu favorito.");
  };

  return (
    <div className="container">
      <header>
        <h1>LinkedIn Scraper</h1>
        <p className="subtitle">Extração via Voyager API</p>
      </header>

      <div className="tabs">
        {["upload", "execution", "records", "config"].map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => handleTabChange(tab)}>
            {tab === "upload" ? "Upload CSV" : tab === "execution" ? "Execução" : tab === "records" ? "Registros" : "Configuração"}
          </button>
        ))}
      </div>

      {activeTab === "upload" && (
        <div className="card">
          <h2>Importar Perfis</h2>
          <input type="file" accept=".csv" onChange={handleFileChange} />
          <button className="btn" onClick={handleUpload} disabled={!file || uploading} style={{ width: "100%", marginTop: "15px" }}>
            Importar CSV
          </button>
        </div>
      )}

      {activeTab === "execution" && (
        <div className="card">
          <div className="stats-grid">
            <div className="stat-box"><div className="stat-value primary">{stats.total}</div><div className="stat-label">Total</div></div>
            <div className="stat-box"><div className="stat-value warning">{stats.missingAvatar}</div><div className="stat-label">Faltando</div></div>
            <div className="stat-box"><div className="stat-value success">{stats.success}</div><div className="stat-label">Sucesso</div></div>
          </div>
          <div className="input-group">
            <label>Quantidade:</label>
            <input type="number" value={scrapeCount} onChange={e => setScrapeCount(parseInt(e.target.value))} />
          </div>
          <button className="btn" onClick={handleScrape} disabled={scraping} style={{ width: "100%" }}>
            {scraping ? "Coletando..." : "Iniciar"}
          </button>
          <div className="log-panel">{logs.map((l, i) => <div key={i} className="log-entry">{l}</div>)}</div>
        </div>
      )}

      {activeTab === "records" && (
        <div className="card">
          <div className="records-header">
            <h2>Resultados da Coleta</h2>
            <div className="filter-group" style={{ display: "flex", gap: "10px" }}>
              <button className={`btn-compact ${recordsFilter === "SUCCESS" ? "active" : ""}`} onClick={() => handleFilterChange("SUCCESS")}>Com Foto</button>
              <button className={`btn-compact ${recordsFilter === "ERROR" ? "active" : ""}`} onClick={() => handleFilterChange("ERROR")}>Com Erro</button>
              <button className={`btn-compact ${recordsFilter === "" ? "active" : ""}`} onClick={() => handleFilterChange("")}>Todos</button>
            </div>
          </div>
          <div className="records-list" style={{ marginTop: "20px" }}>
            {records.length === 0 && !loadingRecords ? (
              <p>Nenhum registro encontrado para este filtro.</p>
            ) : (
              records.map(r => (
                <div key={r.id} className="record-item">
                  <div className="record-photo-wrapper">
                    {r.profilePictureUrl ? (
                      <Image src={r.profilePictureUrl} alt={r.name} width={88} height={88} className="record-photo" unoptimized />
                    ) : (
                      <div className="record-no-photo">N/A</div>
                    )}
                  </div>
                  <div style={{ marginLeft: "15px" }}>
                    <div style={{ fontWeight: "bold" }}>{r.name}</div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>Status: {r.status}</div>
                    <a href={r.linkedinUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "#60a5fa" }}>Ver Perfil</a>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
            <button className="btn btn-secondary" onClick={() => fetchRecords(1, false, recordsFilter)} disabled={loadingRecords}>Atualizar</button>
            <button className="btn" onClick={() => fetchRecords(recordsPage + 1, true, recordsFilter)} disabled={loadingRecords || !recordsHasMore}>Ver Mais</button>
          </div>
        </div>
      )}

      {activeTab === "config" && (
        <div className="card">
          <h2>Configuração de Sessão</h2>
          <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "10px", marginBottom: "20px" }}>
            <h3>Valor do Cookie li_at</h3>
            <textarea value={newCookieValue} onChange={(e) => setNewCookieValue(e.target.value)} placeholder="Cole aqui o cookie li_at..." rows="3" style={{ width: "100%", background: "rgba(0,0,0,0.3)", color: "white", padding: "10px", marginTop: "10px" }} />
            <button className="btn" onClick={handleAddCookie} disabled={!newCookieValue.trim()} style={{ marginTop: "10px" }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
