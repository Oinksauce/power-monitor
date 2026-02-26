import React, { useState } from "react";
import type { Meter } from "../app/App";

interface Props {
  activeMeters: Meter[];
  rangeStart: Date;
  rangeEnd: Date;
}

export const DataTab: React.FC<Props> = ({
  activeMeters,
  rangeStart,
  rangeEnd,
}) => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted?: number;
    skipped?: number;
    meters_seen?: number;
    error?: string;
  } | null>(null);

  function handleExport() {
    if (!activeMeters.length) return;
    const ids = activeMeters.map((m) => m.meter_id).join(",");
    const start = rangeStart.toISOString();
    const end = rangeEnd.toISOString();
    const url = `/api/usage/export?meters=${encodeURIComponent(ids)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    window.open(url, "_blank", "noopener");
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", importFile);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ error: data.error || `Request failed: ${res.status}` });
        return;
      }
      setImportResult(data);
      setImportFile(null);
    } catch (e) {
      setImportResult({
        error: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="card" style={{ maxWidth: "32rem" }}>
      <div className="card-header">
        <h2>Export &amp; Import</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
            Export
          </h3>
          <p style={{ color: "#9ca3af", margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
            Download raw readings for currently tracked meters as CSV (meter_id, timestamp, cumulative_raw) using the same date range as the main charts.
          </p>
          <button
            type="button"
            className="range-btn active"
            onClick={handleExport}
            disabled={!activeMeters.length}
            title={!activeMeters.length ? "Select meters to track in Discovery first" : ""}
          >
            Export CSV
          </button>
          {!activeMeters.length && (
            <p style={{ color: "#9ca3af", margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
              Track at least one meter in Discovery to export.
            </p>
          )}
        </div>
        <div>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
            Import
          </h3>
          <p style={{ color: "#9ca3af", margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
            Upload a CSV of raw readings. Accepted formats: (1) <code>meter_id,timestamp,cumulative_raw</code> (export format), or (2) rtlamr 8-column CSV (e.g. from electricusage.csv). New meters are added as untracked.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportResult(null);
              }}
              className="data-file-input"
            />
            <button
              type="button"
              className="range-btn active"
              onClick={handleImport}
              disabled={!importFile || importing}
            >
              {importing ? "Importing…" : "Import CSV"}
            </button>
          </div>
          {importResult && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                backgroundColor: importResult.error ? "#1f2937" : "#0f172a",
                border: `1px solid ${importResult.error ? "#dc2626" : "#1f2937"}`,
                fontSize: "0.85rem",
              }}
            >
              {importResult.error ? (
                <span style={{ color: "#f87171" }}>{importResult.error}</span>
              ) : (
                <span style={{ color: "#e5e7eb" }}>
                  Inserted {importResult.inserted ?? 0}, skipped {importResult.skipped ?? 0} duplicates, meters: {importResult.meters_seen ?? 0}.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
