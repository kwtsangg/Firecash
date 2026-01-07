import { useMemo } from "react";

export type DateRange = {
  from: string;
  to: string;
};

type Preset = {
  label: string;
  days: number;
};

const presets: Preset[] = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

type DateRangePickerProps = {
  value: DateRange;
  onChange: (value: DateRange) => void;
  onPreset?: (label: string) => void;
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function DateRangePicker({
  value,
  onChange,
  onPreset,
}: DateRangePickerProps) {
  const presetValues = useMemo(() => {
    const anchor = new Date(value.to);
    const today = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
    return presets.map((preset) => ({
      label: preset.label,
      from: formatDate(new Date(today.getTime() - preset.days * 86400000)),
      to: formatDate(today),
    }));
  }, [value.to]);

  return (
    <div className="date-range">
      <div className="date-inputs">
        <label>
          From
          <input
            type="date"
            value={value.from}
            onChange={(event) =>
              onChange({ ...value, from: event.target.value })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={value.to}
            onChange={(event) =>
              onChange({ ...value, to: event.target.value })
            }
          />
        </label>
      </div>
      <div className="preset-buttons">
        {presetValues.map((preset) => (
          <button
            key={preset.label}
            className="pill"
            type="button"
            onClick={() => {
              onChange({ from: preset.from, to: preset.to });
              onPreset?.(preset.label);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
