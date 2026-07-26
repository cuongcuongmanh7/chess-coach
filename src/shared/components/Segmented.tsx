import type { ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
};

// Nhóm chọn-đơn dùng chung: role=radiogroup + điều hướng phím ←/→, accent xanh.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const shift = (direction: 1 | -1) => {
    const current = options.findIndex((option) => option.value === value);
    let index = current < 0 ? 0 : current;
    for (let step = 0; step < options.length; step += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) {
        onChange(options[index].value);
        return;
      }
    }
  };

  return (
    <div
      className={`segmented${className ? ` ${className}` : ""}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          shift(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          shift(-1);
        }
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          disabled={option.disabled}
          className={`segmented-option${option.value === value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <span className="segmented-icon">{option.icon}</span>}
          <span className="segmented-label">{option.label}</span>
          {option.badge && <span className="segmented-badge">{option.badge}</span>}
        </button>
      ))}
    </div>
  );
}
