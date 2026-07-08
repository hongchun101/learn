import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Box } from './Box';

describe('Box', () => {
  it('renders a div by default', () => {
    render(<Box>hello</Box>);
    const el = screen.getByText('hello');
    expect(el.tagName).toBe('DIV');
  });

  it('honors the `as` prop', () => {
    render(
      <Box as="a" href="https://example.com">
        link
      </Box>,
    );
    const el = screen.getByText('link');
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('https://example.com');
  });
});
