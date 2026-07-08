/**
 * Module 4: Classes & OOP
 *
 * Covers:
 *  - Parameter properties, `readonly`, `private`/`protected`/`public`
 *  - Getters/setters and `useDefineForClassFields`
 *  - `abstract` classes
 *  - Generic classes
 *  - Mixin pattern (no native multiple inheritance, but mixins are composable)
 *  - Decorators (legacy experimental & TC39 stage 3)
 *  - `override` keyword
 *  - `this`-typing and polymorphism
 *  - `implements` vs. `extends`
 */

// ---------------------------------------------------------------------------
// 1. Abstract classes and `override`
// ---------------------------------------------------------------------------

export interface Shape {
  area(): number;
  perimeter(): number;
}

export abstract class Shape2D implements Shape {
  abstract readonly kind: string;
  abstract area(): number;
  abstract perimeter(): number;

  describe(): string {
    return `${this.kind}: area=${this.area().toFixed(2)} perim=${this.perimeter().toFixed(2)}`;
  }
}

export class Circle extends Shape2D {
  override readonly kind = 'circle' as const;
  constructor(public readonly radius: number) {
    super();
  }
  override area(): number {
    return Math.PI * this.radius * this.radius;
  }
  override perimeter(): number {
    return 2 * Math.PI * this.radius;
  }
}

export class Rectangle extends Shape2D {
  override readonly kind = 'rect' as const;
  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    super();
  }
  override area(): number {
    return this.width * this.height;
  }
  override perimeter(): number {
    return 2 * (this.width + this.height);
  }
}

// ---------------------------------------------------------------------------
// 2. Generic class
// ---------------------------------------------------------------------------

export class Container<T> {
  private items: T[] = [];
  push(item: T): this {
    this.items.push(item);
    return this;
  }
  filter(pred: (item: T) => boolean): T[] {
    return this.items.filter(pred);
  }
  get size(): number {
    return this.items.length;
  }
  *[Symbol.iterator](): IterableIterator<T> {
    yield* this.items;
  }
}

// ---------------------------------------------------------------------------
// 3. Mixin pattern — composable behaviors
// ---------------------------------------------------------------------------

// Constructable type for mixin base.
// `any[]` (not `never[]`) is the standard pattern: TS requires
// "a single rest parameter of type 'any[]'" for mixin classes.
export type Constructor<T = object> = new (...args: any[]) => T;

export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  touch(): void;
}

export function TimestampedBase<TBase extends Constructor>(Base: TBase) {
  return class extends Base implements Timestamped {
    readonly createdAt = new Date();
    private _updatedAt = new Date();
    touch(): void {
      this._updatedAt = new Date();
    }
    get updatedAt(): Date {
      return this._updatedAt;
    }
  };
}

export function Serializable<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    toJSON(): string {
      const obj = Object.fromEntries(
        Object.entries(Object.getPrototypeOf(this)).filter(([k]) => k !== 'constructor'),
      );
      return JSON.stringify({ ...obj, ...this });
    }
  };
}

export class Tag {
  constructor(public name: string) {}
}

export const TimestampedTag = TimestampedBase(Tag);
export const SerializableTimestampedTag = Serializable(TimestampedTag);

const t = new SerializableTimestampedTag('urgent');
t.touch();
// t is both Timestamped and Serializable; you can call .toJSON() and read .createdAt.
void t;

// ---------------------------------------------------------------------------
// 4. `this`-parameter polymorphism (F-bounded polymorphism)
// ---------------------------------------------------------------------------

export interface Comparable<T> {
  compareTo(other: T): number;
}

export class Version implements Comparable<Version> {
  constructor(
    public readonly major: number,
    public readonly minor: number,
    public readonly patch: number,
  ) {}
  compareTo(other: Version): number {
    return this.major - other.major || this.minor - other.minor || this.patch - other.patch;
  }
}

// ---------------------------------------------------------------------------
// 5. Decorators — TC39 Stage 3 (TS 5.x)
// ---------------------------------------------------------------------------

// Class decorator factory
export function sealed(constructor: Function): void {
  Object.seal(constructor);
  Object.freeze(constructor.prototype);
}

// Method decorator (TC39 signature: 2 args + descriptor)
export function logged(_target: object, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const original = descriptor.value as (...args: unknown[]) => unknown;
  descriptor.value = function (...args: unknown[]): unknown {
    console.info(`[${propertyKey}] called with`, args.length, 'arg(s)');
    const result = original.apply(this, args);
    return result;
  };
  return descriptor;
}

// Field decorator (TC39 signature: 2 args)
export function format(_fmt: string) {
  return (_target: object, _propertyKey: string | symbol): void => {
    /* no-op */
  };
}

export class Invoice {
  @format('currency')
  public amount: number = 0;

  constructor(public id: string) {}

  @logged
  totalWithTax(rate: number): number {
    return this.amount * (1 + rate);
  }
}

// ---------------------------------------------------------------------------
// 6. Accessor with `get`/`set` and validation
// ---------------------------------------------------------------------------

export class Port {
  #port: number = 0;
  constructor(port: number) {
    this.port = port; // goes through setter
  }
  get port(): number {
    return this.#port;
  }
  set port(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new RangeError(`Invalid port: ${value}`);
    }
    this.#port = value;
  }
}

if (import.meta.url === `file:///${process.argv[1]}`) {
  const c = new Circle(2);
  const r = new Rectangle(3, 4);
  console.info(c.describe());
  console.info(r.describe());
  const p = new Port(8080);
  console.info('port =', p.port);
}
