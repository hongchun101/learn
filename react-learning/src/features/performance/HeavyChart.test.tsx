/**
 * HeavyChart — rendered after the lazy chunk loads. The test asserts
 * the chart shows its label and at least one computed value.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeavyChart } from './HeavyChart';

describe('HeavyChart', () => {
  it('renders the label and computed values', () => {
    render(<HeavyChart />);
    expect(screen.getByText(/HeavyChart mounted/i)).toBeInTheDocument();
    expect(screen.getByText(/fib\(20\)/)).toBeInTheDocument();
  });
});
