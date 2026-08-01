import { useEffect, useState } from 'react';

/** Cycle en boucle à travers un tableau d'URLs d'images (fonds animés PixelLab). */
export function useFrameCycle(frames: string[], intervalMs = 200): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [frames, intervalMs]);

  return frames[index] ?? frames[0];
}
