/**
 * 模块 4：类与 OOP
 *
 * 涵盖内容：
 *  - 参数属性、`readonly`、`private`/`protected`/`public`
 *  - getter/setter 与 `useDefineForClassFields`
 *  - `abstract` 类
 *  - 泛型类
 *  - Mixin 模式（没有原生多重继承，但 mixin 可以组合）
 *  - 装饰器（旧版实验性装饰器与 TC39 Stage 3 装饰器）
 *  - `override` 关键字
 *  - `this` 类型标注与多态
 *  - `implements` 与 `extends` 的区别
 */

// ---------------------------------------------------------------------------
// 1. 抽象类与 `override`
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
// 2. 泛型类
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
// 3. Mixin 模式——可组合的行为
// ---------------------------------------------------------------------------

// Mixin 基类的可构造类型。
// `any[]`（而非 `never[]`）是标准模式：TS 要求 mixin 类使用
// “一个类型为 'any[]' 的剩余参数”。
export type Constructor<T = object> = new (...args: any[]) => T;

export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  touch(): void;
}

export function TimestampedBase<TBase extends Constructor>(Base: TBase) {
  return class extends Base implements Timestamped {
    readonly createdAt = new Date();
    _updatedAt = new Date();
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
// t 同时是 Timestamped 和 Serializable；可以调用 .toJSON() 并读取 .createdAt。
void t;

// ---------------------------------------------------------------------------
// 4. `this` 参数多态（F-有界多态）
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
// 5. 装饰器——TC39 Stage 3（TS 5.x）
// ---------------------------------------------------------------------------

// 类装饰器工厂
export function sealed(constructor: Function): void {
  Object.seal(constructor);
  Object.freeze(constructor.prototype);
}

// 方法装饰器（TC39 签名：2 个参数 + descriptor）
export function logged(_target: object, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const original = descriptor.value as (...args: unknown[]) => unknown;
  descriptor.value = function (...args: unknown[]): unknown {
    console.info(`[${propertyKey}] called with`, args.length, 'arg(s)');
    const result = original.apply(this, args);
    return result;
  };
  return descriptor;
}

// 字段装饰器（TC39 签名：2 个参数）
export function format(_fmt: string) {
  return (_target: object, _propertyKey: string | symbol): void => {
    /* 无操作 */
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
// 6. 带验证的 `get`/`set` 访问器
// ---------------------------------------------------------------------------

export class Port {
  #port: number = 0;
  constructor(port: number) {
    this.port = port; // 通过 setter 赋值
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
