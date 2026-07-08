/**
 * CompoundPage — exercises the `<Tabs>` compound component.
 */
import { Card, DemoArea } from '@core/components/Card';
import { Tabs } from '@core/components/Tabs';

export function CompoundPage() {
  return (
    <Card
      title="Compound component"
      description="State is owned by the parent; children read from context."
    >
      <DemoArea>
        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="details">Details</Tabs.Trigger>
            <Tabs.Trigger value="disabled" disabled>
              Disabled
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="overview">Overview content. Try arrow keys.</Tabs.Panel>
          <Tabs.Panel value="details">Details content.</Tabs.Panel>
        </Tabs>
      </DemoArea>
    </Card>
  );
}
