/**
 * useIntersectionObserver — observe a single element and report visibility.
 *
 * `entry` is the raw `IntersectionObserverEntry` so the caller can read
 * `intersectionRatio`, `boundingClientRect`, etc. If you only need a boolean,
 * use the `useInView` wrapper below.
 *
 * The observer is created lazily and disconnected on cleanup, so the cost
 * when nothing is observed is zero.
 */
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';

export interface UseIntersectionObserverOptions {
  threshold?: number | ReadonlyArray<number>;
  root?: Element | null;
  rootMargin?: string;
  /** Stop observing once it has intersected once. Default: false. */
  triggerOnce?: boolean;
}

export function useIntersectionObserver<T extends Element>(
  options: UseIntersectionObserverOptions = {},
): [MutableRefObject<T | null>, IntersectionObserverEntry | null] {
  const { threshold = 0, root = null, rootMargin = '0px', triggerOnce = false } = options;
  const ref = useRef<T | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    let stopped = false;
    // IntersectionObserver's threshold is `number | number[]`; our public
    // type uses `ReadonlyArray<number>` so callers can pass a tuple. The
    // spread converts the readonly tuple to a mutable array.
    const thresholdArg = typeof threshold === 'number' ? threshold : [...threshold];
    const observer = new IntersectionObserver(
      (entries) => {
        if (stopped) return;
        const first = entries[0];
        if (first) setEntry(first);
        if (triggerOnce && first?.isIntersecting) {
          stopped = true;
          observer.disconnect();
        }
      },
      { threshold: thresholdArg, root, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, root, rootMargin, triggerOnce]);

  return [ref, entry];
}

export function useInView<T extends Element>(
  options: UseIntersectionObserverOptions = {},
): [RefObject<T | null>, boolean] {
  const [ref, entry] = useIntersectionObserver<T>(options);
  return [ref, entry?.isIntersecting ?? false];
}
