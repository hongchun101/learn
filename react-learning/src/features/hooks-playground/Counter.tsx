/**
 * Counter — a small `useReducer` example.
 *
 * The reducer is a pure function: same input → same output. That's the
 * whole point. Splitting the *event description* (the action) from the
 * *transition logic* (the reducer) is what makes state updates testable.
 */
import { useReducer } from 'react';
import { Card, DemoArea, Row } from '@core/components/Card';
import { useRenderCount } from '@core/hooks';

type CounterState = { count: number; lastAction: string };

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' }
  | { type: 'set'; value: number };

const reducer = (state: CounterState, action: CounterAction): CounterState => {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1, lastAction: 'increment' };
    case 'decrement':
      return { count: state.count - 1, lastAction: 'decrement' };
    case 'reset':
      return { count: 0, lastAction: 'reset' };
    case 'set':
      return { count: action.value, lastAction: `set(${action.value})` };
  }
};

export function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0, lastAction: 'init' });
  const renders = useRenderCount('Counter');

  return (
    <Card title="useReducer — discriminated-union actions" description={`render #${renders}`}>
      <DemoArea>
        count = <strong>{state.count}</strong> · last action = <code>{state.lastAction}</code>
      </DemoArea>
      <Row>
        <button onClick={() => dispatch({ type: 'decrement' })}>-1</button>
        <button onClick={() => dispatch({ type: 'increment' })}>+1</button>
        <button onClick={() => dispatch({ type: 'set', value: 100 })}>set 100</button>
        <button onClick={() => dispatch({ type: 'reset' })}>reset</button>
      </Row>
    </Card>
  );
}
