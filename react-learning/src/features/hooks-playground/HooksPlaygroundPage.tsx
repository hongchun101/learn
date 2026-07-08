/**
 * HooksPlayground — a one-stop overview of every built-in hook used in
 * this codebase, with a small interactive demo for each.
 *
 * The split into focused components keeps each demo independently testable.
 */
import { Card } from '@core/components/Card';
import { Counter } from './Counter';
import { CustomHooksShowcase } from './CustomHooks';
import { DeferredList } from './DeferredList';
import { RefsDemo } from './Refs';
import { WindowSize } from './WindowSize';

export function HooksPlaygroundPage() {
  return (
    <div>
      <Card title="React Hooks Playground">
        <p>
          Every demo below uses React's built-in hooks plus a small set of
          reusable custom hooks living in <code>src/core/hooks</code>.
        </p>
      </Card>
      <Counter />
      <DeferredList />
      <WindowSize />
      <RefsDemo />
      <CustomHooksShowcase />
    </div>
  );
}
