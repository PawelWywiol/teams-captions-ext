import type { Observable } from "dexie";
import { useEffect, useState } from "preact/hooks";

export function useLiveQuery<T>(
  factory: () => Observable<T>,
  deps: ReadonlyArray<unknown>,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    const subscription = factory().subscribe({
      next: (next) => setValue(next),
      error: (error) => {
        console.error("liveQuery error", error);
      },
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
