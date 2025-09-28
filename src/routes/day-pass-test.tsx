import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Database, Loader2, Printer, TestTube } from 'lucide-react';

export default function DayPassTest() {
  const [licensePlate, setLicensePlate] = useState('TEST123');
  const [destinationName, setDestinationName] = useState('Test Destination');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testDayPassPrinting = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const testResult = await invoke('test_day_pass_printing', {
        licensePlate,
        destinationName
      });
      setResult(testResult);
    } catch (err: any) {
      setError(err.message || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const debugPrinterStatus = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const status = await invoke('debug_printer_status');
      setResult(status);
    } catch (err: any) {
      setError(err.message || 'Debug failed');
    } finally {
      setLoading(false);
    }
  };

  const testQueueEntry = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const queueResult = await invoke('db_enter_queue', {
        licensePlate,
        destinationId: 'test-destination-id',
        destinationName
      });
      setResult(`Queue entry successful: ${queueResult}`);
    } catch (err: any) {
      setError(err.message || 'Queue entry failed');
    } finally {
      setLoading(false);
    }
  };

  const forcePrintDayPass = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const printResult = await invoke('force_print_day_pass_ticket', {
        licensePlate,
        destinationName
      });
      setResult(printResult);
    } catch (err: any) {
      setError(err.message || 'Force print failed');
    } finally {
      setLoading(false);
    }
  };

  const testWithVehicle = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const testResult = await invoke('test_day_pass_printing_with_vehicle', {
        licensePlate,
        destinationName
      });
      setResult(testResult);
    } catch (err: any) {
      setError(err.message || 'Test with vehicle failed');
    } finally {
      setLoading(false);
    }
  };

  const checkDayPasses = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const checkResult = await invoke('check_vehicle_day_passes', {
        licensePlate
      });
      setResult(checkResult);
    } catch (err: any) {
      setError(err.message || 'Day pass check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Day Pass Printing Test
          </CardTitle>
          <CardDescription>
            Test the day pass printing functionality when entering vehicles to queue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="licensePlate" className="text-sm font-medium">
                License Plate
              </label>
              <Input
                id="licensePlate"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="Enter license plate"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="destinationName" className="text-sm font-medium">
                Destination Name
              </label>
              <Input
                id="destinationName"
                value={destinationName}
                onChange={(e) => setDestinationName(e.target.value)}
                placeholder="Enter destination name"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={testDayPassPrinting}
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Test Day Pass Printing
            </Button>

            <Button
              onClick={debugPrinterStatus}
              disabled={loading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Debug Printer Status
            </Button>

            <Button
              onClick={testQueueEntry}
              disabled={loading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Test Queue Entry
            </Button>

            <Button
              onClick={forcePrintDayPass}
              disabled={loading}
              variant="destructive"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Force Print Day Pass
            </Button>

            <Button
              onClick={testWithVehicle}
              disabled={loading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Test with Real Vehicle
            </Button>

            <Button
              onClick={checkDayPasses}
              disabled={loading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Check Database Day Passes
            </Button>
          </div>

          {result && (
            <Alert>
              <AlertDescription>
                <pre className="whitespace-pre-wrap text-sm">{result}</pre>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <pre className="whitespace-pre-wrap text-sm">{error}</pre>
              </AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-muted-foreground space-y-2">
            <h4 className="font-medium">Instructions:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Use "Debug Printer Status" to check printer configuration and connection</li>
              <li>Use "Test Day Pass Printing" to test the day pass printing function directly</li>
              <li>Use "Test Queue Entry" to test entering a vehicle to queue (this should trigger day pass printing)</li>
              <li>Use "Force Print Day Pass" to force print a day pass ticket regardless of existing day pass status</li>
              <li>Check the console logs for detailed debugging information</li>
              <li>Make sure the printer is configured in /etc/environment or /etc/profile.d/printer-env.sh</li>
            </ul>
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <h5 className="font-medium text-blue-900">Day Pass Printing Behavior:</h5>
              <ul className="list-disc list-inside space-y-1 text-blue-800 mt-2">
                <li><strong>New Queue Entry:</strong> Always prints a day pass ticket (2 TND for new, 0 TND for reprint)</li>
                <li><strong>Destination Change:</strong> Always prints a day pass ticket (0 TND for reprint with new destination)</li>
                <li><strong>Existing Day Pass:</strong> Reprints existing day pass with updated destination</li>
                <li><strong>No Day Pass:</strong> Creates new day pass and prints it</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}