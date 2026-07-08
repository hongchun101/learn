/**
 * A11yPage — aggregates a11y / portal examples.
 */
import { Card } from '@core/components/Card';
import { ModalPage } from './ModalPage';
import { TooltipPage } from './TooltipPage';

export function A11yPage() {
  return (
    <div>
      <Card title="Accessibility & portals">
        <p>
          React's portal API lets a child render into a different parent
          while keeping the same event bubbling, context, and a11y tree.
        </p>
      </Card>
      <ModalPage />
      <TooltipPage />
    </div>
  );
}
