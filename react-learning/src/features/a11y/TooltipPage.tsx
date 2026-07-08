/**
 * TooltipPage — exercises the portal-rendered tooltip.
 */
import { Card, DemoArea, Row } from '@core/components/Card';
import { Tooltip } from '@core/components/Tooltip';

export function TooltipPage() {
  return (
    <Card title="Tooltip with portal" description="Hover or focus the button.">
      <DemoArea>
        <Row>
          <Tooltip label="You can read me with a screen reader.">
            <button type="button">hover me</button>
          </Tooltip>
        </Row>
      </DemoArea>
    </Card>
  );
}
