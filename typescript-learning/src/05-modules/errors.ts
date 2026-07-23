/**
 * 标签化错误：由已知错误类别构成的可辨识联合。
 * 供使用者通过 `if (err instanceof TaggedError) { ... }` 进行判断。
 */

export class TaggedError extends Error {
  readonly tag: string;
  constructor(tag: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.tag = tag;
    this.name = tag;
  }
}

export class NotFoundError extends TaggedError {
  constructor(what: string, options?: ErrorOptions) {
    super('NotFound', `${what} not found`, options);
  }
}

export class ValidationError extends TaggedError {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;
  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super('Validation', `Validation failed: ${issues.length} issue(s)`);
    this.issues = issues;
  }
}

export default TaggedError;
