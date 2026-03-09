import React, { useEffect, useState } from "react";
import type { Meter } from "../app/App";
import type { RangePreset } from "./Header";

export interface AnalyticsSummary {
  peak_kw: number;
  baseload_kw: number;
  high_impact_events_count: number;
  events_kwh_impact: number;
  phantom_cost_month: number;
  top_events?: {
    appliance: string;
    kwh: number;
    duration_min: number;
    avg_kw: number;
  }[];
}

interface Props {
  activeMeters: Meter[];
  range: RangePreset;
}

const COST_PER_KWH = 0.15;

const TooltipIcon: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span
      className="info-icon-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((s) => !s)}
    >
      <span className="info-icon-btn">?</span>
      {show && <div className="info-tooltip">{text}</div>}
    </span>
  );
};

export const AnalyticsPanel: React.FC<Props> = ({ activeMeters, range }) => {
  const [data, setData] = useState<Record<string, AnalyticsSummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      if (activeMeters.length === 0) {
        setData({});
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          range,
          meters: activeMeters.map(m => m.meter_id).join(",")
        });
        const res = await fetch(`/api/analytics/summary?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load analytics");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [activeMeters, range]);

  if (activeMeters.length === 0) return null;

  return (
    <div className="analytics-panel">
      <section className="card">
        <div className="card-header">
          <h2>Power Analytics {loading && <span className="spinner"></span>}</h2>
        </div>
        <div className="card-body">
          {error && <div className="error">{error}</div>}
          <div className="analytics-grid">
            {activeMeters.map(meter => {
              const summary = data[meter.meter_id];
              const name = meter.label || meter.meter_id;
              
              if (!summary) return null;

              return (
                <div key={meter.meter_id} className="meter-analytics">
                  <h3>{name}</h3>
                  <div className="metrics-row">
                    <div className="metric">
                      <span className="label">
                        Estimated Base Load
                        <TooltipIcon text="The lowest sustained power level measured (the 'always-on' load)." />
                      </span>
                      <span className="value">{summary.baseload_kw.toFixed(2)} kW</span>
                      <span className="sub-value">~${summary.phantom_cost_month.toFixed(2)} / mo</span>
                    </div>
                    
                    <div className="metric">
                      <span className="label">
                        High-Impact Events
                        <TooltipIcon text="Sustained spikes >500W above base load (e.g. AC, EV, Dryer)." />
                      </span>
                      <span className="value">
                        {summary.high_impact_events_count} events
                      </span>
                      <span className="sub-value">
                        {summary.events_kwh_impact.toFixed(1)} kWh (~${(summary.events_kwh_impact * 0.15).toFixed(2)})
                      </span>
                      
                      {summary.top_events && summary.top_events.length > 0 && (
                        <div className="top-events-list">
                          <span className="events-title">Recent Detections:</span>
                          <ul>
                            {summary.top_events.map((e, idx) => (
                              <li key={idx} title={`${e.avg_kw.toFixed(1)}kW for ${e.duration_min.toFixed(0)} min`}>
                                <strong>{e.appliance}</strong> ({e.kwh.toFixed(1)} kWh)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="metric">
                      <span className="label">Peak Load (Range)</span>
                      <span className="value">{summary.peak_kw.toFixed(2)} kW</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
