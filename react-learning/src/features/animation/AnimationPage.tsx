/**
 * AnimationPage — framer-motion patterns.
 *
 *  - `motion.div` is the most-used primitive; everything is a `motion` element.
 *  - `AnimatePresence` keeps exiting children mounted long enough to run
 *    their exit animation.
 *  - `layout` enables FLIP-style animation when the element's position
 *    or size changes.
 *  - `whileHover` / `whileTap` cover interactive gestures without a
 *    hand-rolled state machine.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, DemoArea, Row } from '@core/components/Card';

const items = ['Apples', 'Pears', 'Bread', 'Cheese', 'Wine'];

export function AnimationPage() {
  const [list, setList] = useState<string[]>(items.slice(0, 3));
  const [open, setOpen] = useState(true);

  function pop(): void {
    setList((prev) => (prev.length === 0 ? items : prev.slice(0, -1)));
  }
  function push(): void {
    setList((prev) => [...prev, items[prev.length % items.length] ?? 'Apples']);
  }

  return (
    <div>
      <Card title="Animation — framer-motion">
        <DemoArea>
          <Row>
            <button onClick={push}>push</button>
            <button onClick={pop}>pop</button>
            <button onClick={() => setOpen((v) => !v)}>{open ? 'hide' : 'show'}</button>
          </Row>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.ul
                key="list"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', padding: 0, margin: 0 }}
              >
                <AnimatePresence initial={false}>
                  {list.map((label) => (
                    <motion.li
                      key={label}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      style={{ listStyle: 'none', padding: '4px 0' }}
                    >
                      {label}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </DemoArea>
      </Card>
    </div>
  );
}
