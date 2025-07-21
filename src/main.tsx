import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./layout";
import ErrorPage from "./error-page";
import Home from "./routes/home";
import Settings from "./routes/settings";
import Login from "./routes/login";
import Dashboard from "./routes/dashboard";
import MainBooking from "./routes/main-booking";
import QueueManagement from "./routes/queue-management";
import CreateBooking from "./routes/create-booking";
import VerifyTicket from "./routes/verify-ticket";
import StaffManagement from "./routes/staff-management";
import StationConfiguration from "./routes/station-config";
import OvernightQueueManagement from "./routes/overnight-queue";
import RoutesPage from "./routes/routes";
import SupervisorVehicleManagement from './routes/supervisor-vehicle-management';
import DriverTicketsPage from './routes/driver-tickets';
import { TauriProvider } from "./context/TauriProvider";
import { AuthProvider } from "./context/AuthProvider";
import "./styles.css";
import { SettingsProvider } from "./context/SettingsProvider";
import { SupervisorModeProvider } from "./context/SupervisorModeProvider";
import { InitProvider, useInit } from "./context/InitProvider";
import { NotificationProvider } from "./context/NotificationProvider";
import { DashboardProvider } from "./context/DashboardProvider";
import { QueueProvider } from "./context/QueueProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import { InitScreen } from "./components/InitScreen";
import { NotificationContainer } from "./components/NotificationToast";
import { Toaster } from "./components/ui/sonner"
import { useEffect } from "react";

// Add this import for Tauri invoke
import { invoke } from '@tauri-apps/api/tauri';

// Add this import for getting the current executable path
import { appDir } from '@tauri-apps/api/path';
import { platform } from '@tauri-apps/api/os';

function useAddFirewallRule() {
  useEffect(() => {
    async function run() {
      // Only run in Tauri and on Windows
      if (!(window as any).__TAURI__) return;
      if ((await platform()) !== 'win32') return;
      try {
        // Guess the exe path (you can hardcode if needed)
        // You may want to use @tauri-apps/api/path to get the exe path more robustly
        const exePath = `${await appDir()}Nqlix.exe`;
        await invoke('add_firewall_rule', {
          exePath,
          appName: 'Nqlix'
        });
        // Optionally show a notification or log
        console.log('Firewall rule added (or already exists)');
      } catch (e) {
        console.error('Failed to add firewall rule:', e);
      }
    }
    run();
  }, []);
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <MainBooking />,
      },
      {
        path: "/dashboard", 
        element: <Dashboard />,
      },
      {
        path: "/booking",
        element: <MainBooking />,
      },
      {
        path: "/queue",
        element: <QueueManagement />,
      },
      {
        path: "/create-booking",
        element: <CreateBooking />,
      },
      {
        path: "/verify",
        element: <VerifyTicket />,
      },
      {
        path: "/staff-management",
        element: <StaffManagement />,
      },
      {
        path: "/station-config",
        element: <StationConfiguration />,
      },
      {
        path: "/overnight-queue",
        element: <OvernightQueueManagement />,
      },
      {
        path: "/routes",
        element: <RoutesPage />,
      },
      {
        path: "/settings",
        element: <Settings />,
      },
      {
        path: "/home",
        element: <Home />,
      },
      {
        path: "/supervisor-vehicle-management",
        element: <SupervisorVehicleManagement />,
      },
      {
        path: "/driver-tickets",
        element: <DriverTicketsPage />,
      },
    ],
  },
]);

const App: React.FC = () => {
  useAddFirewallRule();
  const { isInitialized, isInitializing, shouldShowLogin, completeInitialization } = useInit();

  // Initialize WebSocket connection when app is ready
  useEffect(() => {
    if (isInitialized && !isInitializing) {
      console.log('🚀 App initialized, setting up WebSocket connection...');
      // Import and initialize WebSocket
      import('./lib/websocket').then(({ initializeWebSocket }) => {
        const wsClient = initializeWebSocket();
        console.log('✅ WebSocket client initialized for app');
      }).catch(error => {
        console.error('❌ Failed to initialize WebSocket:', error);
      });
    }
  }, [isInitialized, isInitializing]);

  if (isInitializing || !isInitialized) {
    return <InitScreen onInitComplete={completeInitialization} />;
  }

  return (
    <>
      <RouterProvider router={router} />
      <NotificationContainer />
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TauriProvider>
      <InitProvider>
        <NotificationProvider>
          <AuthProvider>
            <DashboardProvider>
              <QueueProvider>
                <SettingsProvider>
                  <SupervisorModeProvider>
                    <App />
                    <Toaster />
                  </SupervisorModeProvider>
                </SettingsProvider>
              </QueueProvider>
            </DashboardProvider>
          </AuthProvider>
        </NotificationProvider>
      </InitProvider>
    </TauriProvider>
  </React.StrictMode>
);
