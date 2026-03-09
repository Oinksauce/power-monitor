import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type { Meter } from "../app/App";
import type { RangePreset } from "./Header";
import type { AnalyticsSummary } from "./AnalyticsPanel";

interface EventLog {
  id: number;
  meter_id: string;
  start_ts: string;
  end_ts: string;
  avg_kw: number;
  kwh: number;
  identified_appliance: string;
  user_label: string | null;
  status: string;
}

interface Props {
  activeMeters: Meter[];
  range: RangePreset;
}

export const AnalyticsTab: React.FC<Props> = ({ activeMeters, range }) => {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [usageData, setUsageData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, AnalyticsSummary>>({});

  useEffect(() => {
    async function fetchData() {
      if (activeMeters.length === 0) return;
      setLoading(true);
      try {
        const meterIds = activeMeters.map((m) => m.meter_id).join(",");
        
        // 1. Fetch Summary
        const sRes = await fetch(`/api/analytics/summary?meters=${meterIds}&range=${range}`);
        const sData = await sRes.json();
        setSummary(sData);

        // 2. Fetch Events
        const eRes = await fetch(`/api/events?meter_id=${activeMeters[0].meter_id}`);
        const eData = await eRes.json();
        setEvents(eData);

        // 3. Fetch Usage for Chart (15m resolution for analytics)
        const uRes = await fetch(`/api/usage?meters=${meterIds}&range=${range}&resolution=15m`);
        const uData = await uRes.json();
        if (uData.length > 0) {
          setUsageData(uData[0].points);
        }
      } catch (err) {
        console.error("Failed to fetch analytics data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [activeMeters, range]);

  const handleFeedback = async (eventId: number, status: string, label?: string) => {
    try {
      const res = await fetch(`/api/events/${eventId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, user_label: label }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
      }
    } catch (err) {
      console.error("Failed to submit feedback", err);
    }
  };

  const applianceOptions = [
    "AC / Heat Pump",
    "Electric Vehicle (Level 2)",
    "Electric Oven / Range",
    "Clothes Dryer",
    "Water Heater",
    "Microwave",
    "Dishwasher",
    "Washing Machine",
    "Other / Heavy Load",
    "N/A (False Positive)",
  ];

  if (activeMeters.length === 0) {
    return (
      <div className="analytics-tab empty-state">
        <p>Please select at least one meter to view analytics.</p>
      </div>
    );
  }

  return (
    <div className="analytics-tab">
      <div className="analytics-layout">
        <section className="card chart-section">
          <div className="card-header">
            <h2>Consumption Highlighting</h2>
          </div>
          <div className="card-body" style={{ height: "400px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  stroke="#94a3b8" 
                />
                <YAxis stroke="#94a3b8" label={{ value: 'kW', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#f8fafc" }}
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                />
                
                {/* Event Highlights */}
                {events.map((ev) => (
                  <ReferenceArea
                    key={ev.id}
                    x1={ev.start_ts}
                    x2={ev.end_ts}
                    fill={ev.status === "confirmed" ? "rgba(34, 197, 94, 0.15)" : ev.status === "ignored" ? "transparent" : "rgba(234, 179, 8, 0.1)"}
                    stroke={ev.status === "confirmed" ? "#22c55e" : "#f59e0b"}
                    strokeOpacity={0.3}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey="kw"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card events-section">
          <div className="card-header">
            <h2>Recent High-Impact Events</h2>
          </div>
          <div className="card-body no-padding">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Identified As</th>
                  <th>Impact</th>
                  <th>Verify / Correct</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={4} className="empty-row">No events detected in this range.</td></tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id} className={ev.status}>
                      <td>
                        <div className="date">{new Date(ev.start_ts).toLocaleDateString()}</div>
                        <div className="time">
                          {new Date(ev.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(ev.end_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        <span className="appliance-name">{ev.user_label || ev.identified_appliance}</span>
                      </td>
                      <td>
                        <div className="kwh">{ev.kwh.toFixed(2)} kWh</div>
                        <div className="avg-kw">{ev.avg_kw.toFixed(1)} kW average</div>
                      </td>
                      <td>
                        <div className="feedback-actions">
                          {ev.status === "unverified" ? (
                            <>
                              <button 
                                className="btn-confirm" 
                                onClick={() => handleFeedback(ev.id, "confirmed")}
                                title="Confirm identification"
                              >
                                ✓
                              </button>
                              <select 
                                className="feedback-select"
                                value=""
                                onChange={(e) => {
                                  if (e.target.value === "N/A (False Positive)") {
                                    handleFeedback(ev.id, "ignored");
                                  } else {
                                    handleFeedback(ev.id, "corrected", e.target.value);
                                  }
                                }}
                              >
                                <option value="" disabled>Correct...</option>
                                {applianceOptions.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className={`status-badge ${ev.status}`}>
                              {ev.status === "confirmed" ? "Verified" : ev.status === "corrected" ? "Updated" : "Ignored"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
