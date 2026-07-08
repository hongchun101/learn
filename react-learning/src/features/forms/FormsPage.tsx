/**
 * FormsPage — three flavours of the same login form.
 *
 *  1. Controlled — every keystroke flows through React state. Predictable
 *     and easy to reason about, but re-renders the whole tree on each
 *     key.
 *  2. Uncontrolled — the DOM holds the values; we read them on submit
 *     via a `FormData`. Cheaper to render, but harder to validate as the
 *     user types.
 *  3. RHF + Zod — `react-hook-form` minimises re-renders (only the field
 *     that changed re-renders) and `zod` provides a single source of
 *     truth for validation, type-inferred from the schema.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, DemoArea, Row } from '@core/components/Card';

interface LoginValues {
  email: string;
  password: string;
}

const loginSchema = z.object({
  email: z.string().email('must be a valid email'),
  password: z.string().min(6, 'at least 6 characters'),
});

function ControlledForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState<LoginValues | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted({ email, password });
      }}
    >
      <label>
        email
        <input
          aria-label="controlled-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginLeft: 6 }}
        />
      </label>
      <label style={{ marginLeft: 12 }}>
        password
        <input
          aria-label="controlled-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ marginLeft: 6 }}
        />
      </label>
      <button type="submit" style={{ marginLeft: 12 }}>
        submit
      </button>
      {submitted ? (
        <pre data-testid="controlled-out">controlled → {JSON.stringify(submitted)}</pre>
      ) : null}
    </form>
  );
}

function UncontrolledForm() {
  const [out, setOut] = useState<string>('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setOut(JSON.stringify(Object.fromEntries(data.entries())));
      }}
    >
      <label>
        email
        <input aria-label="uncontrolled-email" name="email" style={{ marginLeft: 6 }} />
      </label>
      <label style={{ marginLeft: 12 }}>
        password
        <input aria-label="uncontrolled-password" name="password" type="password" style={{ marginLeft: 6 }} />
      </label>
      <button type="submit" style={{ marginLeft: 12 }}>
        submit
      </button>
      {out ? <pre data-testid="uncontrolled-out">uncontrolled → {out}</pre> : null}
    </form>
  );
}

function RhfForm() {
  type Schema = z.infer<typeof loginSchema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<Schema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const [submitted, setSubmitted] = useState<Schema | null>(null);
  // `watch` demonstrates RHF's per-field subscription model: only fields
  // you watch re-render.
  const email = watch('email');
  return (
    <form
      onSubmit={handleSubmit((values) => {
        setSubmitted(values);
      })}
    >
      <label>
        email
        <input
          aria-label="rhf-email"
          {...register('email')}
          style={{ marginLeft: 6 }}
        />
      </label>{' '}
      {errors.email ? (
        <span style={{ color: 'var(--color-danger)' }}>{errors.email.message}</span>
      ) : null}
      <br />
      <label>
        password
        <input
          aria-label="rhf-password"
          type="password"
          {...register('password')}
          style={{ marginLeft: 6 }}
        />
      </label>{' '}
      {errors.password ? (
        <span style={{ color: 'var(--color-danger)' }}>{errors.password.message}</span>
      ) : null}
      <button type="submit" disabled={isSubmitting} style={{ marginLeft: 12 }}>
        submit
      </button>
      <p style={{ color: 'var(--color-fg-muted)', margin: '6px 0 0' }}>
        watch('email') → <code>{email}</code>
      </p>
      {submitted ? <pre data-testid="rhf-out">rhf → {JSON.stringify(submitted)}</pre> : null}
    </form>
  );
}

export function FormsPage() {
  return (
    <div>
      <Card title="Forms" description="Three flavours of the same login form.">
        <DemoArea>
          <h3>Controlled</h3>
          <ControlledForm />
        </DemoArea>
        <DemoArea>
          <h3>Uncontrolled</h3>
          <UncontrolledForm />
        </DemoArea>
        <DemoArea>
          <h3>react-hook-form + zod</h3>
          <RhfForm />
        </DemoArea>
        <Row>
          <small>
            Validation logic in the third form comes from a Zod schema — the
            form's value type is <code>z.infer&lt;typeof loginSchema&gt;</code>,
            so it never drifts from the runtime check.
          </small>
        </Row>
      </Card>
    </div>
  );
}
