import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Keyboard, 
  X, 
  Navigation, 
  Zap, 
  Square 
} from 'lucide-react';
import { keyboardShortcuts } from '../services/keyboardShortcuts';

export default function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<any[]>([]);

  useEffect(() => {
    setShortcuts(keyboardShortcuts.getShortcuts());
  }, []);

  const shortcutsByCategory = {
    navigation: shortcuts.filter(s => s.category === 'navigation'),
    action: shortcuts.filter(s => s.category === 'action'),
    modal: shortcuts.filter(s => s.category === 'modal')
  };

  const categoryIcons = {
    navigation: Navigation,
    action: Zap,
    modal: Square
  };

  const categoryLabels = {
    navigation: 'Navigation',
    action: 'Actions',
    modal: 'Modales'
  };

  // Toggle help with Ctrl+Shift+? or F12
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey && event.shiftKey && event.key === '?') ||
        event.key === 'F12'
      ) {
        event.preventDefault();
        setIsOpen(!isOpen);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl mx-4 max-h-[80vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Raccourcis Clavier
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            data-shortcut="close-modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="overflow-y-auto max-h-[60vh]">
          <div className="space-y-6">
            {Object.entries(shortcutsByCategory).map(([category, categoryShortcuts]) => {
              if (categoryShortcuts.length === 0) return null;
              
              const IconComponent = categoryIcons[category as keyof typeof categoryIcons];
              
              return (
                <div key={category}>
                  <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
                    <IconComponent className="h-5 w-5" />
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {categoryShortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {shortcut.description}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs">
                          {shortcut.key}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Astuce:</strong> Appuyez sur <Badge variant="outline" className="mx-1">Ctrl+Shift+?</Badge> 
              ou <Badge variant="outline" className="mx-1">F12</Badge> pour ouvrir/fermer cette aide.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}