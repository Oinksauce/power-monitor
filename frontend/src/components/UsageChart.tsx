import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import type { Meter, UsageSeries } from "../app/App";

interface Props {
  series: UsageSeries[];
  loading: boolean;
  error?: string | null;
  meters?: Meter[];
}

export const UsageChart: React.FC<Props> = ({ series, loading, error, meters = [] }) => {
  const [yMaxInput, setYMaxInput] = useState("");
  const yMax = yMaxInput.trim() === "" ? null : parseFloat(yMaxInput);
  const yMaxValid = yMax === null || (Number.isFinite(yMax) && yMax > 0);
  const labelFor = (meterId: string) =>
    meters.find((m) => m.meter_id === meterId)?.label || meterId;
  const merged = React.useMemo(() => {
    const byTs: Record<
      string,
      {
        timestamp: string;
        [key: string]: number | string;
      }
    > = {};
    for (const s of series) {
      for (const p of s.points) {
        const key = p.timestamp;
        if (!byTs[key]) {
          byTs[key] = { timestamp: key };
        }
        byTs[key][`${s.meter_id}-kw`] = p.kw;
      }
    }
    return Object.values(byTs).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [series]);

  const hasData = merged.length > 0;

  return (
    <section className="card chart">
      <div className="card-header">
        <h2>Consumption Over Time</h2>
        <div className="chart-header-controls">
          {loading && <span className="pill">Loading…</span>}
          <label className="chart-y-max-control">
            <span className="chart-y-max-label">Y max (kW)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Auto"
              value={yMaxInput}
              onChange={(e) => setYMaxInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={`chart-y-max-input ${!yMaxValid ? "invalid" : ""}`}
              title="Set a fixed Y-axis max to reveal trends when spikes compress the scale. Leave empty for auto."
            />
          </label>
        </div>
      </div>
      <div className="chart-body">
        {!loading && error && (
          <p style={{ color: "#f87171", marginTop: "1rem" }}>
            {error}
          </p>
        )}
        {!loading && !error && !hasData && (
          <p style={{ color: "#9ca3af", marginTop: "1rem" }}>
            No usage data for the selected range. Ensure meters are tracked (checkboxes) and data exists.
          </p>
        )}
        {hasData && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={merged} key={`domain-${yMaxValid && yMax != null ? yMax : "auto"}`}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              minTickGap={32}
            />
            <YAxis
              domain={yMaxValid && yMax != null ? [0, yMax] : undefined}
              tickFormatter={(v) => `${v.toFixed(1)} kW`}
              width={60}
              allowDecimals
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #475569",
                borderRadius: "0.5rem",
                color: "#ffffff",
              }}
              labelStyle={{ color: "#ffffff", fontWeight: 600, marginBottom: "0.5rem" }}
              itemStyle={{ color: "#e2e8f0" }}
              formatter={(value: number, name: string) => {
                const meterId = name.replace(/-kw$/, "");
                return [`${value.toFixed(2)} kW`, labelFor(meterId)];
              }}
              labelFormatter={(v) =>
              new Date(v).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })
            }
            />
            <Legend />
            {series.map((s, idx) => (
              <Line
                key={s.meter_id}
                type="monotone"
                dataKey={`${s.meter_id}-kw`}
                name={labelFor(s.meter_id)}
                stroke={["#3b82f6", "#f97316", "#22c55e", "#e11d48"][idx % 4]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};

