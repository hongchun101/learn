// TypeScript 中的 opaque 类型别名。
//
//   opaque type UserId = String
//
// 该别名是私有的：模块外 `UserId` 与 `String` 名义上是不同的。
// 我们通过在值类型上打一个 brand 来实现这一点。

interface UserIdBrand {
  readonly _userId: unique symbol;
}
export type UserId = string & UserIdBrand;

const UserIdModule = (() => {
  return {
    apply: (s: string): UserId => s as UserId,
    underlying: (u: UserId): string => u as unknown as string,
  };
})();

export const UserId = UserIdModule;

/** 另一个 opaque 包装类型 ClientSecret，用于展示不同的 brand。 */
interface ClientSecretBrand {
  readonly _cs: unique symbol;
}
export type ClientSecret = string & ClientSecretBrand;

export const ClientSecret = {
  apply: (s: string): ClientSecret => s as ClientSecret,
  underlying: (s: ClientSecret): string => s as unknown as string,
};
