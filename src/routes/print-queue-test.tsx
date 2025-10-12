import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { thermalPrinter, PrintJobType, PrintQueueStatus } from '../services/thermalPrinterService';

export default function PrintQueueTest() {
  const [queueStatus, setQueueStatus] = useState<PrintQueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const refreshQueueStatus = async () => {
    try {
      const status = await thermalPrinter.getPrintQueueStatus();
      setQueueStatus(status);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Failed to get queue status:', error);
    }
  };

  useEffect(() => {
    refreshQueueStatus();
    const interval = setInterval(refreshQueueStatus, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const testPrintJobs = async () => {
    setIsLoading(true);
    try {
      console.log('🧪 Testing print queue with multiple jobs...');
      
      // Queue multiple print jobs simultaneously
      const jobs = [
        { type: PrintJobType.BookingTicket, content: 'Test Booking Ticket 1', priority: 0 },
        { type: PrintJobType.EntryTicket, content: 'Test Entry Ticket 1', priority: 0 },
        { type: PrintJobType.DayPassTicket, content: 'Test Day Pass Ticket 1', priority: 0 },
        { type: PrintJobType.ExitTicket, content: 'Test Exit Ticket 1', priority: 0 },
        { type: PrintJobType.BookingTicket, content: 'Test Booking Ticket 2', priority: 0 },
      ];

      // Queue all jobs at once
      const promises = jobs.map((job, index) => 
        thermalPrinter.queuePrintJob(
          job.type, 
          JSON.stringify({
            testJob: index + 1,
            content: job.content,
            timestamp: new Date().toISOString(),
            staffName: 'Test Staff'
          }),
          'Test Staff',
          job.priority
        )
      );

      await Promise.all(promises);
      console.log('✅ All test jobs queued successfully');
      
      // Refresh status after a short delay
      setTimeout(refreshQueueStatus, 500);
      
    } catch (error) {
      console.error('❌ Failed to queue test jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const testHighPriorityJob = async () => {
    setIsLoading(true);
    try {
      console.log('🚀 Testing high priority job...');
      
      await thermalPrinter.queuePrintJob(
        PrintJobType.ExitPassTicket,
        JSON.stringify({
          urgent: true,
          content: 'URGENT: High Priority Exit Pass',
          timestamp: new Date().toISOString(),
          staffName: 'Test Staff'
        }),
        'Test Staff',
        0 // Highest priority
      );
      
      console.log('✅ High priority job queued');
      setTimeout(refreshQueueStatus, 500);
      
    } catch (error) {
      console.error('❌ Failed to queue high priority job:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Print Queue Test
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Test the print queue system to ensure tickets print in order
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Queue Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📊 Queue Status
              <Badge variant={queueStatus?.is_processing ? "default" : "secondary"}>
                {queueStatus?.is_processing ? "Processing" : "Idle"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queueStatus ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Queue Length:</span>
                  <Badge variant="outline">{queueStatus.queue_length}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Failed Jobs:</span>
                  <Badge variant={queueStatus.failed_jobs > 0 ? "destructive" : "secondary"}>
                    {queueStatus.failed_jobs}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last Printed:</span>
                  <span className="text-sm">
                    {queueStatus.last_printed_at 
                      ? new Date(queueStatus.last_printed_at).toLocaleTimeString()
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last Update:</span>
                  <span className="text-sm">{lastUpdate}</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500">Loading...</div>
            )}
          </CardContent>
        </Card>

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle>🧪 Test Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={testPrintJobs} 
              disabled={isLoading}
              className="w-full"
              variant="default"
            >
              {isLoading ? 'Testing...' : 'Test Multiple Jobs (5 jobs)'}
            </Button>
            
            <Button 
              onClick={testHighPriorityJob} 
              disabled={isLoading}
              className="w-full"
              variant="destructive"
            >
              {isLoading ? 'Testing...' : 'Test High Priority Job'}
            </Button>
            
            <Button 
              onClick={refreshQueueStatus} 
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              Refresh Status
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>📋 How to Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>1. <strong>Multiple Jobs Test:</strong> Click "Test Multiple Jobs" to queue 5 different print jobs simultaneously. Watch the queue length increase and then decrease as jobs are processed in order.</p>
            <p>2. <strong>High Priority Test:</strong> Click "Test High Priority Job" to queue an urgent job that should be processed first.</p>
            <p>3. <strong>Monitor:</strong> The queue status updates every 2 seconds automatically. Watch the "Queue Length" and "Processing" status change.</p>
            <p>4. <strong>Order Verification:</strong> Check the printer output to verify that tickets are printed in the correct order (FIFO - First In, First Out).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}