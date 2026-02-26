import React, { useState } from "react";

interface DataTabProps {
  activeMeters: { meter_id: string }[];
  rangeStart: Date;
  rangeEnd: Date;
}

export const DataTab: React.FC<DataTabProps> = ({
  activeMeters,
  rangeStart,
  rangeEnd,
}) => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const meterIds = activeMeters.map((m) => m.meter_id).join(",");
  const startStr = rangeStart.toISOString();
  const endStr = rangeEnd.toISOString();

  const exportUrl =
    meterIds && `/api/usage/export?meters=${encodeURIComponent(meterIds)}&start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`;

  function handleExport() {
    if (!exportUrl) return;
    window.open(exportUrl, "_blank", "noopener,noreferrer");
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportProgress(0);
    setImportStatus(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min for large files
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await fetch("/api/import?stream=1", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setImportResult(data.detail || data.error || `Error ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setImportResult("Streaming not supported");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const match = chunk.match(/^data: (.+)/m);
          if (!match) continue;
          try {
            const data = JSON.parse(match[1]) as {
              done?: boolean;
              progress?: number;
              imported?: number;
              skipped?: number;
              total?: number;
              inserted?: number;
              duplicates_ignored?: number;
              meters_seen?: number;
            };
            if (data.done) {
              setImportProgress(100);
              const inserted = data.inserted ?? 0;
              const duplicates = data.duplicates_ignored ?? data.skipped ?? 0;
              const meters = data.meters_seen ?? 0;
              const parts: string[] = [];
              parts.push(`${inserted} row${inserted === 1 ? "" : "s"} imported`);
              if (duplicates > 0) {
                parts.push(`${duplicates} duplicate row${duplicates === 1 ? "" : "s"} ignored`);
              }
              parts.push(`${meters} meter${meters === 1 ? "" : "s"}`);
              setImportResult(parts.join(". "));
              setImportStatus(null);
              setImportFile(null);
            } else {
              const pct = (data.progress ?? 0) * 100;
              setImportProgress(pct);
              const total = data.total ?? 0;
              const imported = data.imported ?? 0;
              const skipped = data.skipped ?? 0;
              setImportStatus(
                total > 0
                  ? `${imported.toLocaleString()} / ${total.toLocaleString()} rows${skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? "" : "s"} skipped)` : ""}`
                  : "Processing…"
              );
            }
          } catch {
            // ignore parse errors for partial chunks
          }
        }
      }
    } catch (e) {
      setImportResult(e instanceof Error ? e.message : "Import failed");
      setImportStatus(null);
    } finally {
      clearTimeout(timeoutId);
      setImporting(false);
      setImportProgress(0);
      setImportStatus(null);
    }
  }

  const showProgress = importing && (importProgress > 0 || importStatus !== null);

  return (
    <div className="data-tab">
      <section className="data-section">
        <h2>Export CSV</h2>
        <p>
          Export raw readings for the current tracked meters and date range as a
          CSV file (meter_id, timestamp, cumulative_raw).
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleExport}
          disabled={!meterIds}
        >
          Export CSV
        </button>
        {!meterIds && (
          <p className="data-hint">Track at least one meter to export.</p>
        )}
      </section>
      <section className="data-section">
        <h2>Import CSV</h2>
        <p>
          Upload a CSV of raw readings. Supported: <strong>Export backup format</strong> (same as
          Export CSV — header <code>meter_id,timestamp,cumulative_raw</code> then data rows) or{" "}
          <strong>rtlamr format</strong> (8 columns: timestamp, …, meter_id, …, cumulative_raw).
        </p>
        <input
          type="file"
          accept=".csv"
          className="data-file-input"
          onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImport}
          disabled={!importFile || importing}
        >
          {importing ? "Importing…" : "Import"}
        </button>
        {showProgress && (
          <div className="data-import-progress">
            <div className="data-import-progress-bar">
              <div
                className="data-import-progress-fill"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            {importStatus && (
              <p className="data-import-status">{importStatus}</p>
            )}
          </div>
        )}
        {importResult && (
          <p className="data-result">{importResult}</p>
        )}
      </section>
    </div>
  );
};
