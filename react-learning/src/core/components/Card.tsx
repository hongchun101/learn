/**
 * Card — small presentational wrapper. Demonstrates CSS Modules.
 *
 * - `className` and `style` are forwarded so callers can extend layout
 *   (e.g. add a CSS-in-JS class for one-off overrides).
 * - `as` is a polymorphic prop (see also `<Box>` in the polymorphic
 *   example); the runtime tag is `h2` / `h3` / etc.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';
import { cn } from '@core/utils/cn';

type AsTag = 'section' | 'article' | 'div';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: AsTag;
}

export function Card({
  title,
  description,
  className,
  style,
  children,
  as: Tag = 'section',
}: CardProps) {
  return (
    <Tag className={cn(styles.card, className)} style={style}>
      {title ? <h2>{title}</h2> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </Tag>
  );
}

export const DemoArea = ({ children }: { children: ReactNode }) => (
  <div className={styles.demo}>{children}</div>
);

export const Row = ({ children }: { children: ReactNode }) => (
  <div className={styles.row}>{children}</div>
);
