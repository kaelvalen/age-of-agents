import { useEffect, type RefObject } from 'react';

/**
 * Klawiatura wzorca ARIA „menu" dla prostego dropdownu z przyciskami role="menuitem*".
 *
 *  - Po otwarciu przenosi focus na aktywną (aria-checked="true") lub pierwszą opcję.
 *  - ArrowDown/ArrowUp przesuwają focus cyklicznie, Home/End skaczą na skraje.
 *
 * Działa na żywym DOM (querySelectorAll w kontenerze), więc nie wymaga refów per-opcja
 * ani roving tabindex. Esc i click-outside obsługują komponenty osobno.
 */
export function useMenuKeyboard(open: boolean, menuRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const items = (): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];

    // Focus na aktywnej (checked) lub pierwszej opcji zaraz po otwarciu.
    const initial = items();
    (initial.find((el) => el.getAttribute('aria-checked') === 'true') ?? initial[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      const list = items();
      if (list.length === 0) return;
      const idx = list.indexOf(document.activeElement as HTMLElement);
      let next: number;
      switch (e.key) {
        case 'ArrowDown':
          next = (idx + 1) % list.length;
          break;
        case 'ArrowUp':
          next = (idx <= 0 ? list.length : idx) - 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = list.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      list[next]?.focus();
    };

    menu.addEventListener('keydown', onKey);
    return () => menu.removeEventListener('keydown', onKey);
  }, [open, menuRef]);
}
