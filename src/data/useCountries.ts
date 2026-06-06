import { useEffect, useState } from "react";
import { loadCountries } from "./countries";
import type { Country } from "./types";

/** Load + normalize the country dataset once on mount. */
export function useCountries() {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadCountries().then(
      (c) => alive && setCountries(c),
      (e) => alive && setError(String(e?.message ?? e)),
    );
    return () => {
      alive = false;
    };
  }, []);

  return { countries, error };
}
