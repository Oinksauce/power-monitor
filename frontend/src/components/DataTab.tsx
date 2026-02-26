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

  function formatImportResult(data: {
    inserted?: number;
    duplicates_ignored?: number;
    skipped?: number;
    meters_seen?: number;
  }) {
    const inserted = data.inserted ?? 0;
    const duplicates = data.duplicates_ignored ?? data.skipped ?? 0;
    const meters = data.meters_seen ?? 0;
    const parts: string[] = [];
    parts.push(`${inserted} row${inserted === 1 ? "" : "s"} imported`);
    if (duplicates > 0) {
      parts.push(`${duplicates} duplicate row${duplicates === 1 ? "" : "s"} ignored`);
    }
    parts.push(`${meters} meter${meters === 1 ? "" : "s"}`);
    return parts.join(". ");
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportStatus("Importing…");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min for large files
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await fetch("/api/import", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(data.detail) ? data.detail.map((o: { msg?: string }) => o.msg).join(", ") : data.detail ?? data.error;
        setImportResult(detail || `Error ${res.status}`);
        return;
      }
      setImportResult(formatImportResult(data));
      setImportFile(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      if (msg === "Network Error" || msg === "Failed to fetch" || (e instanceof Error && e.name === "AbortError")) {
        setImportResult("Network error. Is the server running? Try again or use a smaller file.");
      } else {
        setImportResult(msg);
      }
    } finally {
      clearTimeout(timeoutId);
      setImporting(false);
      setImportStatus(null);
    }
  }

  const showProgress = importing && importStatus !== null;

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
