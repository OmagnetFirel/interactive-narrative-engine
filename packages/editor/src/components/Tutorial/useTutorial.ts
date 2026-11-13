import { useState } from 'react';

const STORAGE_KEY = 'branchplay:tutorial-visto';

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* sem storage: o tutorial volta a abrir no próximo acesso */
  }
}

/** Abre sozinho no primeiro acesso; depois, pelo botão "Como usar". */
export function useTutorial() {
  const [open, setOpen] = useState(() => !readSeen());
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      markSeen();
      setOpen(false);
    },
  };
}
