import { useState, useEffect } from 'react';

/**
 * 現在のビューポートがモバイルブレークポイント以下かどうかを返すフック。
 * MediaQueryList の change イベントで効率よく更新する。
 */
export function useMobileBreakpoint(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mql.matches);

    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [breakpoint]);

  return isMobile;
}
