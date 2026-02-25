import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { UsageSeries } from "../app/App";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  series: UsageSeries[];
  loading: boolean;
  error?: string | null;
}

export const UsageByWeekdayChart: React.FC<Props> = ({
  series,
  loading,
  error,
}) => {
  const data = React.useMemo(() => {
    const byDay = new Array(7).fill(0);
    for (const s of series) {
      for (const p of s.points) {
        const d = new Date(p.timestamp);
        const dayOfWeek = d.getDay();
        byDay[dayOfWeek] += p.kwh;
      }
    }
    return byDay.map((kwh, i) => ({
      day: WEEKDAY_LABELS[i],
      dayIndex: i,
      kwh: Math.round(kwh * 100) / 100,
    }));
  }, [series]);

  const hasData = data.some((d) => d.kwh > 0);

  return (
    <section className="card chart">
      <div className="card-header">
        <h2>Total consumption by day of week</h2>
        {loading && <span className="pill">Loading…</span>}
      </div>
      <div className="chart-body">
        {!loading && error && (
          <p style={{ color: "#f87171", marginTop: "1rem" }}>{error}</p>
        )}
        {!loading && !error && !hasData && (
          <p style={{ color: "#9ca3af", marginTop: "1rem" }}>
            No usage data for the selected range.
          </p>
        )}
        {hasData && (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) => `${v} kWh`}
                width={56}
                allowDecimals
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #475569",
                  borderRadius: "0.5rem",
                  color: "#ffffff",
                }}
                formatter={(value: number) => [`${value.toFixed(2)} kWh`, "Total"]}
                labelFormatter={(label) => `${label} (total for selected period)`}
              />
              <Bar dataKey="kwh" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
