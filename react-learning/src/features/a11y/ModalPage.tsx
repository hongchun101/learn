/**
 * ModalPage — exercises the modal's focus trap, escape, and backdrop
 * click. Click the trigger, then try Tab / Shift+Tab / Escape.
 */
import { useState } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import { Modal } from '@core/components/Modal';

export function ModalPage() {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Portal · focus trap · restore focus" description="Open, tab around, press Esc.">
      <Row>
        <button onClick={() => setOpen(true)}>open modal</button>
      </Row>
      <DemoArea>
        <p>Body content is below the modal layer when open.</p>
      </DemoArea>
      <Modal open={open} onClose={() => setOpen(false)} title="Focus me first">
        <p>
          The first focusable element in this dialog received focus when the
          modal opened. Tab cycles inside; pressing <kbd>Esc</kbd> closes and
          restores focus to the trigger.
        </p>
        <input placeholder="first focusable" />
        <p>and another</p>
        <button>second</button>
      </Modal>
    </Card>
  );
}
