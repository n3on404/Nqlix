import { useNavigate } from 'react-router-dom';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  category: 'navigation' | 'action' | 'modal';
}

export class KeyboardShortcutsService {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  public navigate: any = null;

  constructor() {
    this.setupGlobalListener();
  }

  setNavigate(navigate: any) {
    this.navigate = navigate;
  }

  private setupGlobalListener() {
    document.addEventListener('keydown', (event) => {
      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable elements
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable]')
      ) {
        return;
      }

      const key = this.getKeyString(event);
      const shortcut = this.shortcuts.get(key);
      
      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
      }
    });
  }

  private getKeyString(event: KeyboardEvent): string {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Meta');
    
    const key = event.key.toUpperCase();
    return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
  }

  registerShortcut(shortcut: KeyboardShortcut) {
    this.shortcuts.set(shortcut.key, shortcut);
  }

  unregisterShortcut(key: string) {
    this.shortcuts.delete(key);
  }

  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  getShortcutsByCategory(category: string): KeyboardShortcut[] {
    return this.getShortcuts().filter(s => s.category === category);
  }
}

// Global instance
export const keyboardShortcuts = new KeyboardShortcutsService();

// Common shortcuts configuration - AZERTY layout optimized
export const COMMON_SHORTCUTS = {
  // Navigation shortcuts
  F1: {
    key: 'F1',
    description: 'Aller à la page principale',
    category: 'navigation' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/');
      }
    }
  },
  F2: {
    key: 'F2',
    description: 'Aller au pass journalier',
    category: 'navigation' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/day-pass');
      }
    }
  },
  F3: {
    key: 'F3',
    description: 'Aller à la gestion de file',
    category: 'navigation' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/queue-management');
      }
    }
  },
  F4: {
    key: 'F4',
    description: 'Gestion des véhicules',
    category: 'navigation' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/supervisor-vehicle-management');
      }
    }
  },
  F6: {
    key: 'F6',
    description: 'Gestion de file + Ajouter véhicule',
    category: 'modal' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/queue-management');
        // Trigger add vehicle modal after navigation
        setTimeout(() => {
          const addButton = document.querySelector('[data-shortcut="add-vehicle"]') as HTMLButtonElement;
          if (addButton) {
            addButton.click();
          }
        }, 100);
      }
    }
  },
  F7: {
    key: 'F7',
    description: 'Pass journalier + Acheter pass',
    category: 'modal' as const,
    action: () => {
      if (keyboardShortcuts.navigate) {
        keyboardShortcuts.navigate('/day-pass');
        // Trigger first purchase button after navigation
        setTimeout(() => {
          const purchaseButton = document.querySelector('[data-shortcut="purchase-day-pass"]') as HTMLButtonElement;
          if (purchaseButton) {
            purchaseButton.click();
          }
        }, 100);
      }
    }
  },
  // Action shortcuts - AZERTY optimized
  'Ctrl+A': {
    key: 'Ctrl+A',
    description: 'Ajouter un élément (contexte)',
    category: 'action' as const,
    action: () => {
      // This will be handled by individual components
      const addButton = document.querySelector('[data-shortcut="add-item"]') as HTMLButtonElement;
      if (addButton) {
        addButton.click();
      }
    }
  },
  'Ctrl+R': {
    key: 'Ctrl+R',
    description: 'Actualiser la page',
    category: 'action' as const,
    action: () => {
      window.location.reload();
    }
  },
  'Ctrl+Q': {
    key: 'Ctrl+Q',
    description: 'Ajouter véhicule (contexte)',
    category: 'action' as const,
    action: () => {
      const addVehicleButton = document.querySelector('[data-shortcut="add-vehicle"]') as HTMLButtonElement;
      if (addVehicleButton) {
        addVehicleButton.click();
      }
    }
  },
  'Ctrl+W': {
    key: 'Ctrl+W',
    description: 'Fermer la modale actuelle',
    category: 'modal' as const,
    action: () => {
      const closeButton = document.querySelector('[data-shortcut="close-modal"]') as HTMLButtonElement;
      if (closeButton && closeButton.offsetParent !== null) {
        closeButton.click();
      }
    }
  },
  'Escape': {
    key: 'Escape',
    description: 'Fermer les modales',
    category: 'modal' as const,
    action: () => {
      // Close any open modals
      const closeButtons = document.querySelectorAll('[data-shortcut="close-modal"]') as NodeListOf<HTMLButtonElement>;
      closeButtons.forEach(button => {
        if (button.offsetParent !== null) { // Check if visible
          button.click();
        }
      });
    }
  }
};

// Initialize common shortcuts
Object.values(COMMON_SHORTCUTS).forEach(shortcut => {
  keyboardShortcuts.registerShortcut(shortcut);
});