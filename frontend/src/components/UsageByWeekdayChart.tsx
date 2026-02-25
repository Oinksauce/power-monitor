import React, { useRef, useEffect, useState } from "react";
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
import type { RangePreset } from "./Header";
import type { Meter, UsageSeries } from "../app/App";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RANGE_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateString(s: string): Date {
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? new Date() : d;
}

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
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  customStart: Date;
  customEnd: Date;
  onCustomRangeChange: (start: Date, end: Date) => void;
  rangeStart: Date;
  rangeEnd: Date;
}

export const UsageByWeekdayChart: React.FC<Props> = ({
  series,
  loading,
  error,
  meters,
  range,
  onRangeChange,
  customStart,
  customEnd,
  onCustomRangeChange,
  rangeStart,
  rangeEnd,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [localStart, setLocalStart] = useState(toDateString(customStart));
  const [localEnd, setLocalEnd] = useState(toDateString(customEnd));
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalStart(toDateString(customStart));
    setLocalEnd(toDateString(customEnd));
  }, [customStart, customEnd]);

  useEffect(() => {
    if (!showCustomPicker) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCustomPicker]);

  function handleApplyCustom() {
    const start = parseDateString(localStart);
    const end = parseDateString(localEnd);
    if (start > end) {
      onCustomRangeChange(end, start);
    } else {
      onCustomRangeChange(start, end);
    }
    onRangeChange("custom");
    setShowCustomPicker(false);
  }

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

  const presetRanges: Exclude<RangePreset, "custom">[] = ["24h", "7d", "30d", "all"];

  return (
    <section className="card chart">
      <div className="card-header chart-card-header">
        <h2>Average consumption by day of week</h2>
        <div className="chart-header-controls">
          {loading && <span className="pill">Loading…</span>}
          <div className="range-toggle-wrapper">
            <div className="range-toggle range-toggle-compact">
              {presetRanges.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={r === range ? "range-btn active" : "range-btn"}
                  onClick={() => onRangeChange(r)}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
              <div className="custom-range-wrapper" ref={pickerRef}>
                <button
                  type="button"
                  className={range === "custom" ? "range-btn active" : "range-btn"}
                  onClick={() => setShowCustomPicker((prev) => !prev)}
                  title="Pick custom date range"
                >
                  Custom
                </button>
                {showCustomPicker && (
                  <div className="custom-date-picker">
                    <div className="custom-date-row">
                      <label>
                        <span className="custom-date-label">From</span>
                        <input
                          type="date"
                          value={localStart}
                          onChange={(e) => setLocalStart(e.target.value)}
                          className="custom-date-input"
                        />
                      </label>
                      <label>
                        <span className="custom-date-label">To</span>
                        <input
                          type="date"
                          value={localEnd}
                          onChange={(e) => setLocalEnd(e.target.value)}
                          className="custom-date-input"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="range-btn active custom-apply-btn"
                      onClick={handleApplyCustom}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
