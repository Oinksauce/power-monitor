import React, { useEffect, useState } from "react";
import type { Meter } from "../app/App";
import type { RangePreset } from "./Header";

export interface AnalyticsSummary {
  peak_kw: number;
  baseload_kw: number;
}

interface Props {
  activeMeters: Meter[];
  range: RangePreset;
}

export const AnalyticsPanel: React.FC<Props> = ({ activeMeters, range }) => {
  const [summaries, setSummaries] = useState<Record<string, AnalyticsSummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!activeMeters.length) return;
      setLoading(true);
      setError(null);
      try {
        const meterIds = activeMeters.map((m) => m.meter_id).join(",");
        // Only 24h, 7d, 30d supported, fallback to 24h for custom
        const r = ["24h", "7d", "30d"].includes(range) ? range : "24h";
        const res = await fetch(`/api/analytics/summary?meters=${meterIds}&range=${r}`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const data = await res.json();
        setSummaries(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [activeMeters, range]);

  if (!activeMeters.length) return null;

  return (
    <div className="card analytics-panel">
      <h2>Power Analytics {loading && <span className="spinner"></span>}</h2>
      {error && <p className="error">{error}</p>}
      
      <div className="analytics-grid">
        {activeMeters.map((m) => {
          const summary = summaries[m.meter_id];
          return (
            <div key={m.meter_id} className="analytics-item">
              <h3>{m.label || m.meter_id}</h3>
              {summary ? (
                <>
                  <div className="metric">
                    <span className="metric-label">Estimated Base Load 
                      <span title="The lowest rolling 1-hour average, indicating always-on phantom power" className="info-icon">ℹ️</span>
                    </span>
                    <span className="metric-value baseload">{summary.baseload_kw.toFixed(2)} kW</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Peak Usage Spike
                      <span title="The highest single recorded usage spike in the window" className="info-icon">ℹ️</span>
                    </span>
                    <span className="metric-value peak">{summary.peak_kw.toFixed(2)} kW</span>
                  </div>
                </>
              ) : (
                <p>Loading summary...</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
