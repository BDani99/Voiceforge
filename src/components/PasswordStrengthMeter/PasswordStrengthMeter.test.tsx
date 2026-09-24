import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordStrengthMeter from './PasswordStrengthMeter';

const filledBars = (container: HTMLElement) => container.querySelectorAll('.pw-meter__bar--filled').length;

describe('PasswordStrengthMeter', () => {
  it('renders nothing for an empty password', () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fills more segments and reports a stronger label as the password improves', () => {
    const { container, rerender } = render(<PasswordStrengthMeter password="abcdefg" />);
    expect(filledBars(container)).toBe(1);
    expect(screen.getByRole('status')).toHaveAccessibleName('Password strength: Weak');

    rerender(<PasswordStrengthMeter password="abcdefghij" />);
    expect(filledBars(container)).toBe(2);
    expect(screen.getByRole('status')).toHaveAccessibleName('Password strength: Fair');

    rerender(<PasswordStrengthMeter password="Abcdefghij" />);
    expect(filledBars(container)).toBe(3);

    rerender(<PasswordStrengthMeter password="Abcdefghij1" />);
    expect(filledBars(container)).toBe(4);
    expect(screen.getByRole('status')).toHaveAccessibleName('Password strength: Strong');
  });

  it('colours all filled segments by the overall level', () => {
    const { container } = render(<PasswordStrengthMeter password="Abcdefghij1" />);
    expect(container.querySelectorAll('.pw-meter__bar--level-4')).toHaveLength(4);
  });
});
