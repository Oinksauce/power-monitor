import React from "react";
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
import type { UsageSeries } from "../app/App";

interface Props {
  series: UsageSeries[];
  loading: boolean;
}

export const UsageChart: React.FC<Props> = ({ series, loading }) => {
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

  return (
    <section className="card chart">
      <div className="card-header">
        <h2>Consumption Over Time</h2>
        {loading && <span className="pill">Loading…</span>}
      </div>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(1)} kW`}
              width={60}
              allowDecimals
            />
            <Tooltip
              labelFormatter={(v) => new Date(v).toLocaleString()}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)} kW`,
                name
              ]}
            />
            <Legend />
            {series.map((s, idx) => (
              <Line
                key={s.meter_id}
                type="monotone"
                dataKey={`${s.meter_id}-kw`}
                name={s.meter_id}
                stroke={["#3b82f6", "#f97316", "#22c55e", "#e11d48"][idx % 4]}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

