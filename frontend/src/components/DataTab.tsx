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
    try {
      const form = new FormData();
      form.append("file", importFile);
      const res = await fetch("/api/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportResult(data.detail || data.error || `Error ${res.status}`);
        return;
      }
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
      setImportFile(null);
    } catch (e) {
      setImportResult(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

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
        {importResult && (
          <p className="data-result">{importResult}</p>
        )}
      </section>
    </div>
  );
};
