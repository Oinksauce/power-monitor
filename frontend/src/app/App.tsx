import React, { useEffect, useState } from "react";
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

  async function fetchMeters() {
    const res = await fetch("/api/meters");
    if (!res.ok) return;
    const data: Meter[] = await res.json();
    setMeters(data);
  }

  const activeMeters = meters.filter((m) => m.active);

  async function fetchUsage() {
    if (!activeMeters.length) {
      setUsage([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      meters: activeMeters.map((m) => m.meter_id).join(","),
      resolution: range === "24h" ? "5m" : range === "7d" ? "15m" : range === "30d" ? "1h" : "1h"
    });
    if (range !== "all") {
      const end = new Date();
      let start: Date;
      if (range === "24h") {
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      } else if (range === "7d") {
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      params.set("start", start.toISOString());
      params.set("end", end.toISOString());
    }
    const res = await fetch(`/api/usage?${params.toString()}`);
    setLoading(false);
    if (!res.ok) return;
    const data: UsageSeries[] = await res.json();
    setUsage(data);
  }

  useEffect(() => {
    fetchMeters();
    const interval = setInterval(fetchMeters, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [meters, range]);

  function handleMeterUpdate(updated: Meter) {
    setMeters((prev) =>
      prev.map((m) =>
        m.meter_id === updated.meter_id ? { ...m, active: updated.active } : m
      )
    );
  }

  return (
    <div className="app-root">
      <Header range={range} onRangeChange={setRange} />
      <main className="app-main">
        <GaugeRow meters={activeMeters} />
        <UsageChart series={usage} loading={loading} />
        <MeterList meters={meters} onMeterUpdate={handleMeterUpdate} />
      </main>
    </div>
  );
};

