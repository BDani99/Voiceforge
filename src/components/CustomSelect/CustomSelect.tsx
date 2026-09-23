import { useState, useRef, useEffect, useId, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomSelect.css';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: ReactNode;
}

interface CustomSelectProps<V extends string | number> {
  value: V | undefined;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Accessible single-select dropdown (listbox pattern) with full keyboard support. */
export default function CustomSelect<V extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  className = "",
  ariaLabel
}: CustomSelectProps<V>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedIndex = options.findIndex(opt => opt.value === value);
  const selectedOption = options[selectedIndex];

  const open = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const handleSelect = (optionValue: V) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (options[activeIndex]) handleSelect(options[activeIndex].value);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // do not also close a surrounding dialog
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
    }
  };

  return (
    <div
      className={`custom-select-container ${disabled ? 'disabled' : ''} ${className}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && (isOpen ? setIsOpen(false) : open())}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
      >
        <span className="custom-select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className="custom-select-icon" aria-hidden="true" />
      </button>

      {isOpen && !disabled && (
        <div className="custom-select-dropdown" role="listbox" id={listboxId}>
          {options.length === 0 ? (
            <div className="custom-select-empty">No options available</div>
          ) : (
            options.map((option, index) => (
              <div
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={value === option.value}
                className={`custom-select-option ${value === option.value ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(option.value)}
              >
                <span className="custom-select-option-label">{option.label}</span>
                {value === option.value && <Check size={16} className="check-icon" aria-hidden="true" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
