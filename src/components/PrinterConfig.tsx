import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { thermalPrinter, PrinterStatus } from '../services/thermalPrinterService';
import type { PrinterConfig } from '../services/thermalPrinterService';
import { Printer, Wifi, Settings, TestTube, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const PrinterConfigComponent: React.FC = () => {
  const [config, setConfig] = useState<PrinterConfig>({
    ip: '192.168.1.100',
    port: 9100,
    width: 48,
    timeout: 5000,
  });
  
  const [status, setStatus] = useState<PrinterStatus>({
    connected: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [testContent, setTestContent] = useState('Test de connexion imprimante');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const currentConfig = await thermalPrinter.getConfig();
      setConfig(currentConfig);
    } catch (error) {
      console.error('Failed to load printer config:', error);
      setMessage('Erreur lors du chargement de la configuration');
    }
  };

  const updateConfig = async () => {
    setLoading(true);
    try {
      await thermalPrinter.updateConfig(config);
      setMessage('Configuration mise à jour avec succès');
    } catch (error) {
      console.error('Failed to update config:', error);
      setMessage('Erreur lors de la mise à jour de la configuration');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage('');
    try {
      const result = await thermalPrinter.testConnection();
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

  const printBarcodeTest = async () => {
    setLoading(true);
    try {
      await thermalPrinter.printBarcode('1234567890', 73); // CODE128
      setMessage('Test Barcode envoyé avec succès');
    } catch (error) {
      console.error('Barcode print test failed:', error);
      setMessage('Erreur lors de l\'impression du Barcode');
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Configuration Imprimante Thermique
          </CardTitle>
          <CardDescription>
            Configurez votre imprimante Epson TM-T20X connectée via Ethernet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ip">Adresse IP</Label>
              <Input
                id="ip"
                type="text"
                value={config.ip}
                onChange={(e) => setConfig({ ...config, ip: e.target.value })}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 9100 })}
                placeholder="9100"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Largeur (caractères)</Label>
              <Input
                id="width"
                type="number"
                value={config.width}
                onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) || 48 })}
                placeholder="48"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                value={config.timeout}
                onChange={(e) => setConfig({ ...config, timeout: parseInt(e.target.value) || 5000 })}
                placeholder="5000"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={updateConfig} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Settings className="mr-2 h-4 w-4" />
              Sauvegarder
            </Button>
            <Button onClick={testConnection} disabled={testing} variant="outline">
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Wifi className="mr-2 h-4 w-4" />
              Tester Connexion
            </Button>
          </div>

          {status.connected !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Statut:</span>
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

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Tests d'Impression
          </CardTitle>
          <CardDescription>
            Testez différentes fonctionnalités d'impression
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
            <Button onClick={printBarcodeTest} disabled={loading} variant="outline">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Test Barcode
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
        </CardContent>
      </Card>
    </div>
  );
};