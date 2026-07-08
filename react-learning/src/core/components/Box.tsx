/**
 * Box — a polymorphic component.
 *
 * The point of this file is the type signature. A polymorphic component
 * lets the caller choose which element renders, while preserving
 * type-safety on the *element's* props. So:
 *
 *   <Box as="a" href="https://example.com">link</Box>   // ok
 *   <Box as="a" type="text">                            // ERROR — <a> has no `type`
 *
 * The trick is a generic that defaults to `React.ElementType` and is
 * threaded through `ComponentPropsWithoutRef<E>`.
 *
 * We omit `ref` forwarding here for simplicity. Adding it would require
 * a type assertion because `React.forwardRef` does not preserve the
 * generic — the resulting signature is the same as in many production
 * component libraries.
 */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

export type BoxProps<E extends ElementType> = {
  as?: E;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<E>, 'as' | 'children' | 'className'>;

export function Box<E extends ElementType = 'div'>({
  as,
  children,
  className,
  ...rest
}: BoxProps<E>): React.ReactElement {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={className} {...rest}>
      {children}
    </Tag>
  );
}
