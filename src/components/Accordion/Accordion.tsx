import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, type LucideProps } from 'lucide-react';
import './Accordion.css';

interface AccordionProps {
  title: string;
  icon?: ComponentType<LucideProps>;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function Accordion({ title, icon: Icon, children, defaultOpen = true }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`accordion ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="accordion-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="accordion-title">
          {Icon && <Icon size={20} className="accordion-icon" />}
          <h3>{title}</h3>
        </div>
        <div className="accordion-toggle">
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </button>

      {isOpen && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </div>
  );
}
