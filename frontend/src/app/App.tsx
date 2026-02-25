import React, { useEffect, useRef, useState } from "react";
import { Header } from "../components/Header";
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

type RangePreset = "24h" | "7d" | "30d" | "all";

export const App: React.FC = () => {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [usage, setUsage] = useState<UsageSeries[]>([]);
  const [range, setRange] = useState<RangePreset>("24h");
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
      const end = new Date();
      let start: Date;
      if (range === "24h") {
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      } else if (range === "7d") {
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (range === "30d") {
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000); // All data = 90 days
      }
      const params = new URLSearchParams({
        meters: activeMeters.map((m) => m.meter_id).join(","),
        resolution:
          range === "24h" ? "5m" : range === "7d" ? "15m" : range === "30d" ? "1h" : "1d",
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

  // Only re-fetch when range or active meter IDs change (not on every meters poll)
  const activeMeterIds = activeMeters.map((m) => m.meter_id).sort().join(",");
  useEffect(() => {
    fetchUsage();
  }, [range, activeMeterIds]);

  function handleMeterUpdate(updated: Meter) {
    setMeters((prev) =>
      prev.map((m) =>
        m.meter_id === updated.meter_id ? { ...m, ...updated } : m
      )
    );
  }

  return (
    <div className="app-root">
      <Header range={range} onRangeChange={setRange} />
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

