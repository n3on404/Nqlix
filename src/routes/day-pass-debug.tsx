import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../context/AuthProvider';
import { dbClient } from '../services/dbClient';
import { useQueue } from '../context/QueueProvider';

export default function DayPassDebug() {
  const { currentStaff } = useAuth();
  const { queues } = useQueue();
  const [licensePlate, setLicensePlate] = useState('TEST123');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testCreateDayPass = async () => {
    setLoading(true);
    setResult('');
    setError('');

    try {
      console.log('🧪 [DEBUG] Creating day pass for:', licensePlate);
      const result = await dbClient.purchaseDayPass(licensePlate, 'test-vehicle-id', 2.0, currentStaff?.id);
      console.log('🧪 [DEBUG] Day pass created:', result);
      setResult(`Day pass created: ${result}`);
    } catch (err: any) {
      console.error('🧪 [DEBUG] Error:', err);
      setError(err.message || 'Failed to create day pass');
    } finally {
      setLoading(false);
    }
  };

  const testCheckRecent = async () => {
    setLoading(true);
    setResult('');
    setError('');

    try {
      console.log('🧪 [DEBUG] Checking recent day pass for:', licensePlate);
      const hasRecent = await dbClient.hasRecentlyPurchasedDayPass(licensePlate);
      console.log('🧪 [DEBUG] Has recent day pass:', hasRecent);
      setResult(`Has recent day pass: ${hasRecent}`);
    } catch (err: any) {
      console.error('🧪 [DEBUG] Error:', err);
      setError(err.message || 'Failed to check recent day pass');
    } finally {
      setLoading(false);
    }
  };

  const testPrintDayPass = async () => {
    setLoading(true);
    setResult('');
    setError('');

    try {
      console.log('🧪 [DEBUG] Printing day pass for:', licensePlate);
      const result = await dbClient.printDayPassForVehicle(licensePlate);
      console.log('🧪 [DEBUG] Print result:', result);
      setResult(`Print result: ${result}`);
    } catch (err: any) {
      console.error('🧪 [DEBUG] Error:', err);
      setError(err.message || 'Failed to print day pass');
    } finally {
      setLoading(false);
    }
  };

  const listQueueVehicles = () => {
    const allQueueItems = Object.values(queues).flat();
    const vehicleList = allQueueItems.map((queue: any) => 
      `${queue.licensePlate} (${queue.status})`
    ).join(', ');
    setResult(`Queue vehicles: ${vehicleList}`);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Day Pass Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="License Plate"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
            <Button onClick={testCreateDayPass} disabled={loading}>
              Create Day Pass
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={testCheckRecent} disabled={loading}>
              Check Recent Day Pass
            </Button>
            <Button onClick={testPrintDayPass} disabled={loading}>
              Print Day Pass
            </Button>
            <Button onClick={listQueueVehicles} disabled={loading}>
              List Queue Vehicles
            </Button>
          </div>

          {result && (
            <div className="p-4 bg-green-50 border border-green-200 rounded">
              <h3 className="font-semibold text-green-800">Result:</h3>
              <pre className="text-sm text-green-700 mt-2">{result}</pre>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <h3 className="font-semibold text-red-800">Error:</h3>
              <pre className="text-sm text-red-700 mt-2">{error}</pre>
            </div>
          )}

          <div className="mt-6">
            <h3 className="font-semibold mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Enter a license plate (e.g., TEST123)</li>
              <li>Click "Create Day Pass" to create a day pass record</li>
              <li>Click "Check Recent Day Pass" to verify it's detected as recent</li>
              <li>Click "Print Day Pass" to test the printing functionality</li>
              <li>Check the browser console for detailed debug logs</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}