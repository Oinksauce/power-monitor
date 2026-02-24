import React, { useState } from "react";
import type { Meter } from "../app/App";

interface Props {
  meters: Meter[];
  onMeterUpdate?: (meter: Meter) => void;
}

export const MeterList: React.FC<Props> = ({ meters, onMeterUpdate }) => {
  const [updating, setUpdating] = useState<Set<string>>(new Set());

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

  return (
    <section className="card meter-list">
      <div className="card-header">
        <h2>Meters</h2>
        <span className="pill">
          {meters.filter((m) => m.active).length} of {meters.length} tracked
        </span>
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
                <td>{m.label || "—"}</td>
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

