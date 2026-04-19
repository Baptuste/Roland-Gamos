import { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function useArtistAutocomplete(query: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || query.length < 2) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/artists/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.artists || []);
      } catch {
        setSuggestions([]);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, enabled]);

  const clear = useCallback(() => setSuggestions([]), []);

  return { suggestions, clear };
}
