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

const HOUR_LABELS = [
  "12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am",
  "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm",
  "8pm", "9pm", "10pm", "11pm",
];

const METER_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#e11d48", "#8b5cf6"];

function countHoursInRange(start: Date, end: Date): number[] {
  const counts = new Array(24).fill(0);
  const cur = new Date(start);
  cur.setMinutes(0, 0, 0);
  const endMs = end.getTime();
  while (cur.getTime() <= endMs) {
    counts[cur.getHours()]++;
    cur.setTime(cur.getTime() + 60 * 60 * 1000);
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

export const UsageByHourChart: React.FC<Props> = ({
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
    const hourCounts = countHoursInRange(rangeStart, rangeEnd);
    const sumByMeterByHour: Record<string, number[]> = {};
    for (const s of series) {
      sumByMeterByHour[s.meter_id] = new Array(24).fill(0);
    }
    for (const s of series) {
      for (const p of s.points) {
        const d = new Date(p.timestamp);
        const hourIndex = d.getHours();
        sumByMeterByHour[s.meter_id][hourIndex] += p.kwh;
      }
    }
    const meterIds = series.map((s) => s.meter_id);
    const data = HOUR_LABELS.map((label, hourIndex) => {
      const row: Record<string, string | number> = {
        hour: label,
        hourIndex,
      };
      for (const mid of meterIds) {
        const count = hourCounts[hourIndex];
        const sum = sumByMeterByHour[mid]?.[hourIndex] ?? 0;
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
        <h2>Average consumption by hour of day</h2>
        {loading && <span className="pill">Loading…</span>}
      </div>
      <div className="chart-body">
        {!loading && error && (
          <p style={{ color: "#f87171", marginTop: "1rem" }}>{error}</p>
        )}
        {!loading && !error && activeMeterCount === 0 && (
          <p style={{ color: "#9ca3af", marginTop: "1rem" }}>
            Select meters to track on the <strong>Discovery</strong> tab to see average consumption by hour.
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
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
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
                  maxBarSize={24}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
