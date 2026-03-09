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

  async function handleToggle(m: Meter, field: "active" | "collecting") {
    if (updating.has(m.meter_id)) return;
    setUpdating((prev) => new Set(prev).add(m.meter_id));
    try {
      const res = await fetch(`/api/meters/${m.meter_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !m[field] }),
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

  async function handleBulk(field: "active" | "collecting", value: boolean) {
    for (const m of meters) {
      if (m[field] === value) continue;
      await handleToggle(m, field);
    }
  }

  async function handleApplyFilter() {
    const selected = meters.filter((m) => m.collecting).map((m) => m.meter_id);
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

  const showCount = meters.filter((m) => m.active).length;
  const collectCount = meters.filter((m) => m.collecting).length;

  return (
    <section className="card meter-list">
      <div className="card-header">
        <h2>Meters</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="pill">
            {showCount} shown · {collectCount} collecting
          </span>
          {meters.length > 0 && (
            <button
              type="button"
              className="range-btn active"
              onClick={handleApplyFilter}
              disabled={applyingFilter || collectCount === 0}
              title="Apply filter: collector will only record data from checked 'Collect' meters"
            >
              {applyingFilter ? "Applying…" : filterApplied ? "Filter applied ✓" : "Apply filter"}
            </button>
          )}
        </div>
      </div>
      {!meters.length ? (
        <p>No meters discovered yet. Run the collector in discovery mode (empty POWER_MONITOR_FILTER_IDS) to see all broadcasting meters.</p>
      ) : (
        <>
          <p className="meter-list-help">
            <strong>Show</strong> = display on Dashboard &nbsp;|&nbsp; <strong>Collect</strong> = record data (click "Apply filter" to save)
          </p>
          <table>
            <thead>
              <tr>
                <th>Show</th>
                <th>Collect</th>
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
                      onChange={() => handleToggle(m, "active")}
                      title={m.active ? "Hide from dashboard" : "Show on dashboard"}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.collecting}
                      disabled={updating.has(m.meter_id)}
                      onChange={() => handleToggle(m, "collecting")}
                      title={m.collecting ? "Stop collecting data" : "Collect data for this meter"}
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
        </>
      )}
    </section>
  );
};
