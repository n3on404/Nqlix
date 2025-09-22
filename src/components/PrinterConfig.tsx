import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select } from './ui/select';
import { thermalPrinter, PrinterStatus } from '../services/thermalPrinterService';
import type { PrinterConfig } from '../services/thermalPrinterService';
import { Printer, Wifi, Settings, TestTube, CheckCircle, XCircle, Loader2, Plus, Trash2, Edit } from 'lucide-react';

export const PrinterConfigComponent: React.FC = () => {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [currentPrinter, setCurrentPrinterState] = useState<PrinterConfig | null>(null);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [editingPrinter, setEditingPrinter] = useState<PrinterConfig | null>(null);
  const [status, setStatus] = useState<PrinterStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [testContent, setTestContent] = useState('Test de connexion imprimante');

  useEffect(() => {
    loadPrinters();
  }, []);

  const loadPrinters = async () => {
    try {
      const allPrinters = await thermalPrinter.getAllPrinters();
      setPrinters(allPrinters);
      
      const current = await thermalPrinter.getCurrentPrinter();
      setCurrentPrinterState(current);
      if (current) {
        setSelectedPrinterId(current.id);
      }
    } catch (error) {
      console.error('Failed to load printers:', error);
      setMessage('Erreur lors du chargement des imprimantes');
    }
  };

  const updatePrinter = async () => {
    if (!editingPrinter) return;
    
    setLoading(true);
    try {
      await thermalPrinter.updatePrinterConfig(editingPrinter.id, editingPrinter);
      setMessage('Configuration mise à jour avec succès');
      await loadPrinters();
      setEditingPrinter(null);
    } catch (error) {
      console.error('Failed to update printer:', error);
      setMessage('Erreur lors de la mise à jour de la configuration');
    } finally {
      setLoading(false);
    }
  };

  const addPrinter = async () => {
    const newPrinter: PrinterConfig = {
      id: `printer${Date.now()}`,
      name: 'Nouvelle Imprimante',
      ip: '192.168.192.10',
      port: 9100,
      width: 48,
      timeout: 5000,
      model: 'TM-T20X',
      enabled: true,
      is_default: false,
    };
    
    setLoading(true);
    try {
      await thermalPrinter.addPrinter(newPrinter);
      setMessage('Imprimante ajoutée avec succès');
      await loadPrinters();
    } catch (error) {
      console.error('Failed to add printer:', error);
      setMessage('Erreur lors de l\'ajout de l\'imprimante');
    } finally {
      setLoading(false);
    }
  };

  const removePrinter = async (printerId: string) => {
    setLoading(true);
    try {
      await thermalPrinter.removePrinter(printerId);
      setMessage('Imprimante supprimée avec succès');
      await loadPrinters();
    } catch (error) {
      console.error('Failed to remove printer:', error);
      setMessage('Erreur lors de la suppression de l\'imprimante');
    } finally {
      setLoading(false);
    }
  };

  const setCurrentPrinter = async (printerId: string) => {
    setLoading(true);
    try {
      await thermalPrinter.setCurrentPrinter(printerId);
      setSelectedPrinterId(printerId);
      await loadPrinters();
      setMessage(`Imprimante "${printers.find(p => p.id === printerId)?.name}" configurée comme imprimante par défaut pour cet ordinateur`);
    } catch (error) {
      console.error('Failed to set current printer:', error);
      setMessage('Erreur lors du changement d\'imprimante');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (printerId?: string) => {
    setTesting(true);
    setMessage('');
    try {
      const result = printerId 
        ? await thermalPrinter.testPrinterConnection(printerId)
        : await thermalPrinter.testConnection();
      setStatus(result);
      if (result.connected) {
        setMessage('Connexion à l\'imprimante réussie!');
      } else {
        setMessage(`Erreur de connexion: ${result.error || 'Imprimante non accessible'}`);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setMessage('Erreur lors du test de connexion');
      setStatus({ connected: false, error: 'Erreur de connexion' });
    } finally {
      setTesting(false);
    }
  };

  const printTest = async () => {
    setLoading(true);
    try {
      await thermalPrinter.printTicket(testContent);
      setMessage('Test d\'impression envoyé avec succès');
    } catch (error) {
      console.error('Print test failed:', error);
      setMessage('Erreur lors de l\'impression de test');
    } finally {
      setLoading(false);
    }
  };

  const printQRTest = async () => {
    setLoading(true);
    try {
      await thermalPrinter.printQRCode('https://louaj.tn/test');
      setMessage('Test QR Code envoyé avec succès');
    } catch (error) {
      console.error('QR print test failed:', error);
      setMessage('Erreur lors de l\'impression du QR Code');
    } finally {
      setLoading(false);
    }
  };

  const printStandardTicketTest = async () => {
    setLoading(true);
    try {
      await thermalPrinter.printStandardTicket('Test de ticket standard avec logo STE Dhraiff Services Transport');
      setMessage('Test ticket standard envoyé avec succès');
    } catch (error) {
      console.error('Standard ticket test failed:', error);
      setMessage('Erreur lors de l\'impression du ticket standard');
    } finally {
      setLoading(false);
    }
  };

  const printSTETicketTest = async () => {
    setLoading(true);
    try {
      await thermalPrinter.printSTETicket({
        ticketNumber: 'STE-001',
        passengerName: 'Ahmed Ben Ali',
        route: 'Tunis - Sfax',
        departureTime: '14:30',
        seatNumber: 'A12',
        price: '25.500',
        additionalInfo: 'Merci de votre confiance!'
      });
      setMessage('Test ticket STE envoyé avec succès');
    } catch (error) {
      console.error('STE ticket test failed:', error);
      setMessage('Erreur lors de l\'impression du ticket STE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Printer Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Sélection d'Imprimante
          </CardTitle>
          <CardDescription>
            Choisissez l'imprimante active et gérez vos imprimantes thermiques Epson TM-T20X
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="printer-select">Imprimante Active</Label>
              <Select 
                value={selectedPrinterId} 
                onChange={(e) => setCurrentPrinter(e.target.value)}
                options={printers.map(printer => ({
                  value: printer.id,
                  label: `${printer.name} (${printer.ip}:${printer.port})`
                }))}
                placeholder="Sélectionner une imprimante"
              />
            </div>
            <Button onClick={addPrinter} disabled={loading} variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter
            </Button>
          </div>

          {currentPrinter && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Imprimante par défaut pour cet ordinateur:</span>
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="mr-1 h-3 w-3" />
                {currentPrinter.name} - {currentPrinter.ip}:{currentPrinter.port}
              </Badge>
            </div>
          )}

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Printer List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Imprimantes</CardTitle>
          <CardDescription>
            Gérez vos imprimantes configurées
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {printers.map((printer) => (
              <div key={printer.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{printer.name}</h3>
                    {printer.is_default && (
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Par défaut pour cet ordinateur
                      </Badge>
                    )}
                    {printer.enabled ? (
                      <Badge variant="outline">Activée</Badge>
                    ) : (
                      <Badge variant="destructive">Désactivée</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {printer.ip}:{printer.port} - {printer.model}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingPrinter(printer)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testConnection(printer.id)}
                    disabled={testing}
                  >
                    {testing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    <Wifi className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removePrinter(printer.id)}
                    disabled={loading || printer.is_default}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Printer Modal */}
      {editingPrinter && (
        <Card>
          <CardHeader>
            <CardTitle>Modifier l'Imprimante</CardTitle>
            <CardDescription>
              Modifiez les paramètres de {editingPrinter.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom</Label>
                <Input
                  id="edit-name"
                  value={editingPrinter.name}
                  onChange={(e) => setEditingPrinter({ ...editingPrinter, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip">Adresse IP</Label>
                <Input
                  id="edit-ip"
                  value={editingPrinter.ip}
                  onChange={(e) => setEditingPrinter({ ...editingPrinter, ip: e.target.value })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-port">Port</Label>
                <Input
                  id="edit-port"
                  type="number"
                  value={editingPrinter.port}
                  onChange={(e) => setEditingPrinter({ ...editingPrinter, port: parseInt(e.target.value) || 9100 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-width">Largeur</Label>
                <Input
                  id="edit-width"
                  type="number"
                  value={editingPrinter.width}
                  onChange={(e) => setEditingPrinter({ ...editingPrinter, width: parseInt(e.target.value) || 48 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-timeout">Timeout (ms)</Label>
                <Input
                  id="edit-timeout"
                  type="number"
                  value={editingPrinter.timeout}
                  onChange={(e) => setEditingPrinter({ ...editingPrinter, timeout: parseInt(e.target.value) || 5000 })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={updatePrinter} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Settings className="mr-2 h-4 w-4" />
                Sauvegarder
              </Button>
              <Button onClick={() => setEditingPrinter(null)} variant="outline">
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Tests d'Impression
          </CardTitle>
          <CardDescription>
            Testez différentes fonctionnalités d'impression sur l'imprimante active
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testContent">Contenu de test</Label>
            <Input
              id="testContent"
              value={testContent}
              onChange={(e) => setTestContent(e.target.value)}
              placeholder="Contenu à imprimer"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={printTest} disabled={loading} variant="outline">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Texte
            </Button>
            <Button onClick={printQRTest} disabled={loading} variant="outline">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test QR Code
            </Button>
            <Button onClick={printStandardTicketTest} disabled={loading} variant="outline">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Ticket Standard
            </Button>
            <Button onClick={printSTETicketTest} disabled={loading} variant="outline">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Ticket STE
            </Button>
            <Button 
              onClick={() => thermalPrinter.printBookingTicket(JSON.stringify({
                ticketNumber: 'TKT-001',
                passengerName: 'Ahmed Ben Ali',
                route: 'Tunis - Sfax',
                departureTime: '14:30',
                seatNumber: 'A12',
                price: '25.500',
                bookingDate: new Date().toLocaleDateString('fr-FR')
              }))} 
              disabled={loading} 
              variant="outline"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Ticket Générique
            </Button>
          </div>

          {status.connected !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Statut de connexion:</span>
              <Badge variant={status.connected ? "default" : "destructive"}>
                {status.connected ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Connecté
                  </>
                ) : (
                  <>
                    <XCircle className="mr-1 h-3 w-3" />
                    Déconnecté
                  </>
                )}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};