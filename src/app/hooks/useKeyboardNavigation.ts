import { useEffect, useRef, useState } from 'react';

interface UseKeyboardNavigationOptions {
  itemCount: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onToggleHelp?: () => void;
}

function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardNavigation({
  itemCount,
  searchInputRef,
  onOpen,
  onToggleSelect,
  onToggleHelp
}: UseKeyboardNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const optionsRef = useRef({ onOpen, onToggleSelect, searchInputRef, onToggleHelp });
  optionsRef.current = { onOpen, onToggleSelect, searchInputRef, onToggleHelp };

  useEffect(() => {
    if (focusedIndex !== null && itemCount > 0 && focusedIndex >= itemCount) {
      setFocusedIndex(itemCount - 1);
    } else if (itemCount === 0) {
      setFocusedIndex(null);
    }
  }, [itemCount, focusedIndex]);

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const { onOpen, onToggleSelect, searchInputRef, onToggleHelp } = optionsRef.current;

      if (event.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur?.();
        setFocusedIndex(null);
        return;
      }

      if (isInputElement(document.activeElement)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => {
            if (itemCount === 0) return null;
            if (prev === null) return 0;
            return Math.min(prev + 1, itemCount - 1);
          });
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => {
            if (itemCount === 0) return null;
            if (prev === null) return 0;
            return Math.max(prev - 1, 0);
          });
          break;
        case '/':
          event.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'o':
        case 'Enter': {
          const idx = focusedIndexRef.current;
          if (idx !== null) onOpen(idx);
          break;
        }
        case 'x': {
          const idx = focusedIndexRef.current;
          if (idx !== null) onToggleSelect(idx);
          break;
        }
        case '?':
          onToggleHelp?.();
          break;
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [itemCount]);

  return { focusedIndex };
}
