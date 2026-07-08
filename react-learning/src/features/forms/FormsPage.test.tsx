/**
 * FormsPage — exercise the controlled form via Testing Library.
 *
 * We only test the controlled form here to keep the suite fast. The
 * react-hook-form section is a good candidate for your own write-up.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormsPage } from './FormsPage';

describe('FormsPage controlled form', () => {
  it('submits the entered values', async () => {
    const user = userEvent.setup();
    render(<FormsPage />);
    // The page renders three forms. Scope to the section that contains
    // the controlled inputs.
    const controlled = screen.getByLabelText('controlled-email').closest('form');
    expect(controlled).not.toBeNull();
    const buttons = within(controlled as HTMLElement).getAllByRole('button', { name: /submit/i });
    await user.type(screen.getByLabelText('controlled-email'), 'a@b.com');
    await user.type(screen.getByLabelText('controlled-password'), 'hunter2');
    await user.click(buttons[0] as HTMLElement);
    expect(screen.getByTestId('controlled-out')).toHaveTextContent('a@b.com');
    expect(screen.getByTestId('controlled-out')).toHaveTextContent('hunter2');
  });
});
