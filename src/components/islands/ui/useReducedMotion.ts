import { useEffect, useState } from 'react';

/**
 * Tracks the user's `prefers-reduced-motion` setting. Islands use this to
 * disable autoplay and turn animated transitions into instant state changes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}
