// Opaque type alias in TypeScript.
//
//   opaque type UserId = String
//
// The alias is private: outside the module `UserId` and `String` are
// nominally distinct. We encode this with a brand on the value type.

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

/** Another opaque wrapper for ClientSecret to demonstrate distinct branding. */
interface ClientSecretBrand {
  readonly _cs: unique symbol;
}
export type ClientSecret = string & ClientSecretBrand;

export const ClientSecret = {
  apply: (s: string): ClientSecret => s as ClientSecret,
  underlying: (s: ClientSecret): string => s as unknown as string,
};
