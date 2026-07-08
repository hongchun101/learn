import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('renders the active panel and hides the others', () => {
    render(
      <Tabs defaultValue="a">
        <Tabs.List>
          <Tabs.Trigger value="a">A</Tabs.Trigger>
          <Tabs.Trigger value="b">B</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Panel value="a">panel A</Tabs.Panel>
        <Tabs.Panel value="b">panel B</Tabs.Panel>
      </Tabs>,
    );
    expect(screen.getByText('panel A')).toBeInTheDocument();
    expect(screen.queryByText('panel B')).toBeNull();
  });

  it('throws when used without a parent', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Tabs.Trigger value="x">x</Tabs.Trigger>)).toThrow(
      /must be rendered inside <Tabs>/,
    );
    err.mockRestore();
  });
});
