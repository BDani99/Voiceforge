export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface QueryMock {
  /** Chainable, awaitable stand-in for a Supabase query builder. */
  builder: unknown;
  /** Every method that was called on the chain, in order. */
  calls: RecordedCall[];
  /** Arguments of the first call to `method`. */
  argsOf: (method: string) => unknown[] | undefined;
}

/**
 * Builds a fake Supabase query builder: any method call returns the same chain, and awaiting it
 * (or calling single()/maybeSingle()) resolves to `result`.
 */
export function queryMock(result: { data?: unknown; error?: unknown; count?: number | null }): QueryMock {
  const calls: RecordedCall[] = [];
  const resolved = { data: null, error: null, count: null, ...result };

  const builder: unknown = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolved).then(onFulfilled, onRejected);
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args });
        return builder;
      };
    },
  });

  return { builder, calls, argsOf: (method) => calls.find((c) => c.method === method)?.args };
}
