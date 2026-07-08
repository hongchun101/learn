/**
 * PolymorphicPage — exercises the generic `<Box as>` component.
 */
import { Card, DemoArea } from '@core/components/Card';
import { Box } from '@core/components/Box';

export function PolymorphicPage() {
  return (
    <Card
      title="Polymorphic component"
      description="<Box as> changes the underlying element while keeping the public API identical."
    >
      <DemoArea>
        <Box as="div" style={{ padding: 8 }}>
          renders a <code>div</code>
        </Box>
        <Box as="button" type="button" style={{ marginTop: 8 }}>
          renders a <code>button</code>
        </Box>
        <Box as="a" href="https://react.dev" target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
          renders an <code>a</code>
        </Box>
      </DemoArea>
    </Card>
  );
}
