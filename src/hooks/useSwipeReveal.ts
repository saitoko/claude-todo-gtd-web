import { useState, useRef, useCallback, useEffect, RefObject } from 'react';

interface SwipeRevealOptions {
  /** スワイプ確定の最小移動量（デフォルト: 40） */
  threshold?: number;
  /** 最大スライド量＝アクションボタン幅（デフォルト: 120） */
  maxReveal?: number;
}

interface SwipeRevealResult {
  /** 現在のスライド量（px）、0がデフォルト位置 */
  offset: number;
  /** アクションが表示状態かどうか */
  isOpen: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  /** 外部からカードを閉じる */
  reset: () => void;
  /** スワイプ対象要素への ref。外側タップで自動リセットするために使用 */
  containerRef: RefObject<HTMLElement | null>;
}

function getIsMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 640;
}

export function useSwipeReveal(options?: SwipeRevealOptions): SwipeRevealResult {
  const threshold = options?.threshold ?? 40;
  const maxReveal = options?.maxReveal ?? 120;

  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(getIsMobile);

  // matchMedia で resize を効率よく検知
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentOffsetRef = useRef(0);
  // 縦スクロール優先フラグ: touchstart で undefined、最初の move で確定
  const scrollLockedRef = useRef<boolean | null>(null);
  // カード要素への ref（外側タップ検知用）
  const containerRef = useRef<HTMLElement | null>(null);

  const reset = useCallback(() => {
    setOffset(0);
    setIsOpen(false);
    currentOffsetRef.current = 0;
  }, []);

  // isOpen 中に外側タップでリセット
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

  useEffect(() => {
    function handleOutsideTouch(e: TouchEvent) {
      if (!isOpenRef.current) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        // currentOffsetRef をリセット（touchend より前に呼ばれる可能性があるため）
        currentOffsetRef.current = 0;
        setOffset(0);
        setIsOpen(false);
      }
    }
    document.addEventListener('touchstart', handleOutsideTouch, { passive: true });
    return () => document.removeEventListener('touchstart', handleOutsideTouch);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    scrollLockedRef.current = null; // 未確定にリセット
  }, [isMobile]);

  // React の onTouchMove は passive なので preventDefault は使えない
  // 縦スクロール判定は useEffect 内の非パッシブリスナーで行う（下記）
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    // scrollLockedRef が true（縦スクロール優先）なら何もしない
    if (scrollLockedRef.current === true) return;

    const touch = e.touches[0];
    const deltaX = startXRef.current - touch.clientX;
    const deltaY = startYRef.current - touch.clientY;

    // 初回 move で縦横判定を確定する
    if (scrollLockedRef.current === null) {
      scrollLockedRef.current = Math.abs(deltaY) > Math.abs(deltaX);
      if (scrollLockedRef.current) return;
    }

    // 左スワイプ（deltaX > 0）でカードを動かす
    if (deltaX > 0) {
      const newOffset = Math.min(deltaX, maxReveal);
      setOffset(newOffset);
      currentOffsetRef.current = newOffset;
    } else if (isOpen && deltaX < 0) {
      // 右スワイプでリセット方向
      const newOffset = Math.max(0, maxReveal + deltaX);
      setOffset(newOffset);
      currentOffsetRef.current = newOffset;
    }
  }, [isMobile, isOpen, maxReveal]);

  const onTouchEnd = useCallback(() => {
    if (!isMobile) return;
    const current = currentOffsetRef.current;

    if (current >= threshold) {
      // スワイプ確定 → アクション表示
      setOffset(maxReveal);
      setIsOpen(true);
      currentOffsetRef.current = maxReveal;
    } else if (isOpen && current < maxReveal - threshold) {
      // 右スワイプで十分動いた → リセット
      reset();
    } else if (isOpen) {
      // 少しだけ動いたが open のまま → open 維持
      setOffset(maxReveal);
      currentOffsetRef.current = maxReveal;
    } else {
      // threshold 未満 → リセット
      reset();
    }
  }, [isMobile, isOpen, threshold, maxReveal, reset]);

  const emptyHandlers = {
    onTouchStart: (_e: React.TouchEvent) => {},
    onTouchMove: (_e: React.TouchEvent) => {},
    onTouchEnd: () => {},
  };

  return {
    offset,
    isOpen,
    handlers: isMobile ? { onTouchStart, onTouchMove, onTouchEnd } : emptyHandlers,
    reset,
    containerRef,
  };
}
