import { nextTick, onBeforeUnmount, watch } from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export function useDialogFocus(dialogRef, activeSource, requestClose) {
  let restoreTarget = null;
  let listening = false;

  function stopListening() {
    if (!listening) return;
    document.removeEventListener('keydown', onKeydown);
    listening = false;
  }

  function restoreFocus() {
    const target = restoreTarget;
    restoreTarget = null;
    if (target?.isConnected && typeof target.focus === 'function') target.focus();
  }

  function onKeydown(event) {
    const root = dialogRef.value;
    if (!root) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = focusableElements(root);
    if (!focusable.length) {
      event.preventDefault();
      root.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !root.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(
    activeSource,
    async (active, previous) => {
      if (!active) {
        stopListening();
        restoreFocus();
        return;
      }

      if (!previous) restoreTarget = document.activeElement;
      if (!listening) {
        document.addEventListener('keydown', onKeydown);
        listening = true;
      }

      await nextTick();
      const root = dialogRef.value;
      const initial = root?.querySelector('[data-dialog-initial-focus]') || focusableElements(root)[0] || root;
      initial?.focus?.();
    },
    { immediate: true, flush: 'post' }
  );

  onBeforeUnmount(() => {
    stopListening();
    restoreFocus();
  });
}
