import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Meter, UsageSeries } from "../app/App";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const METER_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#e11d48", "#8b5cf6"];

function countWeekdaysInRange(start: Date, end: Date): number[] {
  const counts = new Array(7).fill(0);
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cur <= endDay) {
    counts[cur.getDay()]++;
    cur.setDate(cur.getDate() + 1);
  }
  return counts;
}

interface Props {
  series: UsageSeries[];
  loading: boolean;
  error?: string | null;
  meters: Meter[];
  activeMeterCount: number;
  rangeStart: Date;
  rangeEnd: Date;
}

export const UsageByWeekdayChart: React.FC<Props> = ({
  series,
  loading,
  error,
  meters,
  activeMeterCount,
  rangeStart,
  rangeEnd,
}) => {
  const labelFor = (meterId: string) =>
    meters.find((m) => m.meter_id === meterId)?.label || meterId;

  const { data, meterIds } = React.useMemo(() => {
    const weekdayCounts = countWeekdaysInRange(rangeStart, rangeEnd);
    const sumByMeterByDay: Record<string, number[]> = {};
    for (const s of series) {
      sumByMeterByDay[s.meter_id] = new Array(7).fill(0);
    }
    for (const s of series) {
      for (const p of s.points) {
        const d = new Date(p.timestamp);
        const dayIndex = d.getDay();
        sumByMeterByDay[s.meter_id][dayIndex] += p.kwh;
      }
    }
    const meterIds = series.map((s) => s.meter_id);
    const data = WEEKDAY_LABELS.map((day, dayIndex) => {
      const row: Record<string, string | number> = {
        day,
        dayIndex,
      };
      for (const mid of meterIds) {
        const count = weekdayCounts[dayIndex];
        const sum = sumByMeterByDay[mid]?.[dayIndex] ?? 0;
        row[mid] = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
      }
      return row;
    });
    return { data, meterIds };
  }, [series, rangeStart, rangeEnd]);

  const hasData = data.some((row) =>
    meterIds.some((mid) => (row[mid] as number) > 0)
  );

  return (
    <section className="card chart">
      <div className="card-header">
        <h2>Average consumption by day of week</h2>
        {loading && <span className="pill">Loading…</span>}
      </div>
      <div className="chart-body">
        {!loading && error && (
          <p style={{ color: "#f87171", marginTop: "1rem" }}>{error}</p>
        )}
        {!loading && !error && activeMeterCount === 0 && (
          <p style={{ color: "#9ca3af", marginTop: "1rem" }}>
            Select meters to track on the <strong>Discovery</strong> tab to see average consumption by day of week.
          </p>
        )}
        {!loading && !error && activeMeterCount > 0 && !hasData && (
          <p style={{ color: "#9ca3af", marginTop: "1rem" }}>
            No usage data for the selected range.
          </p>
        )}
        {hasData && (
          <ResponsiveContainer width="100%" height={280}>
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
                formatter={(value: number, name: string) => [
                  `${Number(value).toFixed(2)} kWh (avg)`,
                  labelFor(name),
                ]}
                labelFormatter={(label) => `${label} (avg for selected period)`}
              />
              <Legend
                formatter={(value) => labelFor(value)}
                wrapperStyle={{ fontSize: "0.8rem" }}
              />
              {meterIds.map((meterId, idx) => (
                <Bar
                  key={meterId}
                  dataKey={meterId}
                  name={meterId}
                  fill={METER_COLORS[idx % METER_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
