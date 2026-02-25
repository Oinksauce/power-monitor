import React, { useState } from "react";
import type { Meter } from "../app/App";

interface Props {
  meters: Meter[];
  onMeterUpdate?: (meter: Meter) => void;
}

export const MeterList: React.FC<Props> = ({ meters, onMeterUpdate }) => {
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [editingLabel, setEditingLabel] = useState<Record<string, string>>({});
  const [applyingFilter, setApplyingFilter] = useState(false);
  const [filterApplied, setFilterApplied] = useState(false);

  async function handleToggleTrack(m: Meter) {
    if (updating.has(m.meter_id)) return;
    setUpdating((prev) => new Set(prev).add(m.meter_id));
    try {
      const res = await fetch(`/api/meters/${m.meter_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !m.active }),
      });
      if (res.ok) {
        const updated: Meter = await res.json();
        onMeterUpdate?.(updated);
      }
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(m.meter_id);
        return next;
      });
    }
  }

  async function handleLabelChange(m: Meter, label: string) {
    if (updating.has(m.meter_id)) return;
    setUpdating((prev) => new Set(prev).add(m.meter_id));
    try {
      const res = await fetch(`/api/meters/${m.meter_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      if (res.ok) {
        const updated: Meter = await res.json();
        onMeterUpdate?.(updated);
      }
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(m.meter_id);
        return next;
      });
    }
  }

  async function handleTrackAll(active: boolean) {
    for (const m of meters) {
      if (m.active === active) continue;
      await handleToggleTrack(m);
    }
  }

  async function handleApplyFilter() {
    const selected = meters.filter((m) => m.active).map((m) => m.meter_id);
    setApplyingFilter(true);
    setFilterApplied(false);
    try {
      const res = await fetch("/api/config/filter-ids", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter_ids: selected }),
      });
      if (res.ok) {
        setFilterApplied(true);
        setTimeout(() => setFilterApplied(false), 3000);
      }
    } finally {
      setApplyingFilter(false);
    }
  }

  return (
    <section className="card meter-list">
      <div className="card-header">
        <h2>Meters</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="pill">
            {meters.filter((m) => m.active).length} of {meters.length} tracked
          </span>
          {meters.length > 0 && (
            <>
              <button
                type="button"
                className="range-btn"
                onClick={() => handleTrackAll(true)}
                title="Track all meters"
              >
                Track all
              </button>
              <button
                type="button"
                className="range-btn"
                onClick={() => handleTrackAll(false)}
                title="Untrack all meters"
              >
                Untrack all
              </button>
              <button
                type="button"
                className="range-btn active"
                onClick={handleApplyFilter}
                disabled={applyingFilter || meters.filter((m) => m.active).length === 0}
                title="Apply filter: only track these meters going forward (updates collector filter)"
              >
                {applyingFilter ? "Applying…" : filterApplied ? "Filter applied" : "Apply filter"}
              </button>
            </>
          )}
        </div>
      </div>
      {!meters.length ? (
        <p>No meters discovered yet. Run the collector in discovery mode (empty POWER_MONITOR_FILTER_IDS) to see all broadcasting meters.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Track</th>
              <th>Label</th>
              <th>Meter ID</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => (
              <tr key={m.meter_id} className={m.active ? "" : "meter-inactive"}>
                <td>
                  <input
                    type="checkbox"
                    checked={m.active}
                    disabled={updating.has(m.meter_id)}
                    onChange={() => handleToggleTrack(m)}
                    title={m.active ? "Stop tracking" : "Track this meter"}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="meter-label-input"
                    value={editingLabel[m.meter_id] ?? m.label ?? ""}
                    onChange={(e) =>
                      setEditingLabel((prev) => ({
                        ...prev,
                        [m.meter_id]: e.target.value,
                      }))
                    }
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      setEditingLabel((prev) => {
                        const next = { ...prev };
                        delete next[m.meter_id];
                        return next;
                      });
                      if (val !== (m.label ?? "")) {
                        handleLabelChange(m, val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Add nickname…"
                    disabled={updating.has(m.meter_id)}
                    title="Click to edit nickname"
                  />
                </td>
                <td><code>{m.meter_id}</code></td>
                <td>
                  {m.last_seen ? new Date(m.last_seen).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

