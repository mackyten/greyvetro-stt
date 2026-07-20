export interface SearchFieldProps {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}

/**
 * A search input on the brand surface — the filter box at the top of the voice
 * picker and other lists.
 * @category Forms
 */
export function SearchField({ value, placeholder = 'Search…', onChange }: SearchFieldProps) {
  return (
    <input
      type="search"
      className="text-field"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
