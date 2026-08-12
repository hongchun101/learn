# TypeScript 练习

## ⭐⭐ 进阶:类型体操工具集

### 任务
实现以下类型,每个都有测试:

```typescript
// 1. DeepPartial
type DeepPartial<T> = /* ... */;
// 测试:
type T = DeepPartial<{ a: { b: number } }>;
// { a?: { b?: number } | undefined }

// 2. DeepReadonly
type DeepReadonly<T> = /* ... */;

// 3. TupleToUnion
type TupleToUnion<T extends readonly unknown[]> = /* ... */;
// 测试: TupleToUnion<[1, 'a', true]> === 1 | 'a' | true

// 4. Promise.all 类型
declare function all<T extends readonly unknown[]>(
  values: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }>;
// 测试:
// const res = await all([Promise.resolve(1), Promise.resolve('hi')]);
// res[0]: number, res[1]: string

// 5. 函数参数路径
type GetByPath<T, P extends string> = /* ... */;
// 测试:
// type User = { profile: { name: string } };
// GetByPath<User, 'profile.name'> === string
// GetByPath<User, 'profile.age'> === undefined (类型提示报错)

// 6. PickByType
type PickByType<T, U> = /* ... */;
// 测试: PickByType<{ a: string; b: number; c: boolean }, string> === { a: string }

// 7. EventBus 类型
declare class EventBus<T extends Record<string, any[]>> {
  on<K extends keyof T>(event: K, handler: (...args: T[K]) => void): void;
  off<K extends keyof T>(event: K, handler: (...args: T[K]) => void): void;
  emit<K extends keyof T>(event: K, ...args: T[K]): void;
}
```

### 测试库
- vitest (断言运行时)
- tsd (类型测试)
- expect-type (类型相等测试)

### 提交
- types/ 目录
- 完整测试
- 复杂度分析(每个类型推导步数)