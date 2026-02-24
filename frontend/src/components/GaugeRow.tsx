import React from "react";
import type { Meter } from "../app/App";

interface Props {
  meters: Meter[];
}

function formatKw(value: number | null | undefined): string {
  if (value == null) return "--";
  if (value < 1) return `${(value * 1000).toFixed(0)} W`;
  return `${value.toFixed(2)} kW`;
}

export const GaugeRow: React.FC<Props> = ({ meters }) => {
  if (!meters.length) {
    return (
      <section className="card gauges">
        No meters tracked. Select meters to track in the list below.
      </section>
    );
  }

  return (
    <section className="card gauges">
      {meters.map((m) => {
        const max =
          m.settings?.red_max_kw ??
          m.settings?.yellow_max_kw ??
          m.settings?.green_max_kw ??
          5;
        const pct =
          m.current_estimated_kw && max > 0
            ? Math.min(100, (m.current_estimated_kw / max) * 100)
            : 0;
        let zone = "green";
        if (m.settings?.yellow_max_kw && m.current_estimated_kw != null) {
          if (m.current_estimated_kw > (m.settings.red_max_kw ?? max) * 0.9) {
            zone = "red";
          } else if (m.current_estimated_kw > m.settings.yellow_max_kw) {
            zone = "yellow";
          }
        }
        return (
          <div key={m.meter_id} className="gauge">
            <div className="gauge-header">
              <span className="gauge-title">
                {m.label || `Meter ${m.meter_id}`}
              </span>
              <span className="gauge-value">{formatKw(m.current_estimated_kw)}</span>
            </div>
            <div className={`gauge-bar ${zone}`}>
              <div className="gauge-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="gauge-footer">
              <span>0 kW</span>
              <span>{max.toFixed(1)} kW</span>
            </div>
          </div>
        );
      })}
    </section>
  );
};

