type SelectorProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

export function Selector({ label, value, options, onChange }: SelectorProps) {
  return (
    <label className="selector">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
