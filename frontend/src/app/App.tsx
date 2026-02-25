import React, { useEffect, useRef, useState } from "react";
import { Header, type RangePreset } from "../components/Header";
import { GaugeRow } from "../components/GaugeRow";
import { UsageChart } from "../components/UsageChart";
import { MeterList } from "../components/MeterList";

export interface Meter {
  meter_id: string;
  label: string | null;
  active: boolean;
  last_seen: string | null;
  current_estimated_kw: number | null;
  settings?: {
    green_max_kw?: number | null;
    yellow_max_kw?: number | null;
    red_max_kw?: number | null;
  } | null;
}

export interface UsagePoint {
  timestamp: string;
  kwh: number;
  kw: number;
}

export interface UsageSeries {
  meter_id: string;
  points: UsagePoint[];
}

function defaultCustomEnd(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function defaultCustomStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const App: React.FC = () => {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [usage, setUsage] = useState<UsageSeries[]>([]);
  const [range, setRange] = useState<RangePreset>("24h");
  const [customStart, setCustomStart] = useState(() => defaultCustomStart());
  const [customEnd, setCustomEnd] = useState(() => defaultCustomEnd());
  const [loading, setLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "discovery">("dashboard");

  async function fetchMeters() {
    const res = await fetch("/api/meters");
    if (!res.ok) return;
    const data: Meter[] = await res.json();
    setMeters(data);
  }

  const activeMeters = meters.filter((m) => m.active);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  async function fetchUsage() {
    if (!activeMeters.length) {
      setUsage([]);
      setUsageError(null);
      setLoading(false);
      return;
    }
    fetchAbortRef.current?.abort();
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setUsageError(null);
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
    try {
      let start: Date;
      let end: Date;
      if (range === "custom") {
        start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      } else {
        end = new Date();
        if (range === "24h") {
          start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        } else if (range === "7d") {
          start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (range === "30d") {
          start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        } else {
          start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // All data = 90 days
        }
      }
      const spanMs = end.getTime() - start.getTime();
      const spanDays = spanMs / (24 * 60 * 60 * 1000);
      const resolution =
        spanDays <= 1
          ? "5m"
          : spanDays <= 7
            ? "15m"
            : spanDays <= 30
              ? "1h"
              : "1d";
      const params = new URLSearchParams({
        meters: activeMeters.map((m) => m.meter_id).join(","),
        resolution,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const res = await fetch(`/api/usage?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (fetchId !== fetchIdRef.current) return;
      if (!res.ok) {
        setUsageError(`Request failed: ${res.status}`);
        setUsage([]);
        return;
      }
      const data: UsageSeries[] = await res.json();
      setUsage(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (fetchId !== fetchIdRef.current) return;
      const msg = err instanceof Error ? err.message : "Request failed";
      setUsageError(msg.includes("abort") ? "Request timed out after 60s" : msg);
      setUsage([]);
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    fetchMeters();
    const interval = setInterval(fetchMeters, 10000);
    return () => clearInterval(interval);
  }, []);

  // Only re-fetch when range, custom dates, or active meter IDs change
  const activeMeterIds = activeMeters.map((m) => m.meter_id).sort().join(",");
  const customRangeKey =
    range === "custom"
      ? `${customStart.toISOString().slice(0, 10)}-${customEnd.toISOString().slice(0, 10)}`
      : "";
  useEffect(() => {
    fetchUsage();
  }, [range, activeMeterIds, customRangeKey]);

  function handleMeterUpdate(updated: Meter) {
    setMeters((prev) =>
      prev.map((m) =>
        m.meter_id === updated.meter_id ? { ...m, ...updated } : m
      )
    );
  }

  function handleCustomRangeChange(start: Date, end: Date) {
    setCustomStart(start);
    setCustomEnd(end);
  }

  return (
    <div className="app-root">
      <Header
        range={range}
        onRangeChange={setRange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomRangeChange={handleCustomRangeChange}
      />
      <nav className="tab-nav">
        <button
          type="button"
          className={activeTab === "dashboard" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={activeTab === "discovery" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveTab("discovery")}
        >
          Discovery
        </button>
      </nav>
      <main className="app-main">
        {activeTab === "dashboard" && (
          <>
            <GaugeRow meters={activeMeters} />
            <UsageChart series={usage} loading={loading} error={usageError} meters={meters} />
          </>
        )}
        {activeTab === "discovery" && (
          <MeterList meters={meters} onMeterUpdate={handleMeterUpdate} />
        )}
      </main>
    </div>
  );
};

