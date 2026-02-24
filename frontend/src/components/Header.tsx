import React from "react";

type RangePreset = "24h" | "7d" | "30d";

interface Props {
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
}

export const Header: React.FC<Props> = ({ range, onRangeChange }) => {
  return (
    <header className="header">
      <div className="header-left">
        <h1>Power Monitor</h1>
        <p className="subtitle">Near real-time household power usage</p>
      </div>
      <div className="header-right">
        <span className="label">Range</span>
        <div className="range-toggle">
          {(["24h", "7d", "30d"] as RangePreset[]).map((r) => (
            <button
              key={r}
              className={r === range ? "range-btn active" : "range-btn"}
              onClick={() => onRangeChange(r)}
            >
              {r === "24h" ? "Last 24h" : r === "7d" ? "Last 7d" : "Last 30d"}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

