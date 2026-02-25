import React, { useRef, useEffect, useState } from "react";

export type RangePreset = "24h" | "7d" | "30d" | "all" | "custom";

const RANGE_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  "24h": "Last 24h",
  "7d": "Last 7d",
  "30d": "Last 30d",
  all: "All data",
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateString(s: string): Date {
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? new Date() : d;
}

interface Props {
  range: RangePreset;
  onRangeChange: (range: RangePreset) => void;
  customStart: Date;
  customEnd: Date;
  onCustomRangeChange: (start: Date, end: Date) => void;
}

export const Header: React.FC<Props> = ({
  range,
  onRangeChange,
  customStart,
  customEnd,
  onCustomRangeChange,
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

  const presetRanges: Exclude<RangePreset, "custom">[] = ["24h", "7d", "30d", "all"];

  return (
    <header className="header">
      <div className="header-left">
        <h1>Power Monitor</h1>
        <p className="subtitle">Near real-time household power usage</p>
      </div>
      <div className="header-right">
        <span className="label">Range</span>
        <div className="range-toggle-wrapper">
          <div className="range-toggle">
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
    </header>
  );
};

