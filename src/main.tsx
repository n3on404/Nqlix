import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./layout";
import ErrorPage from "./error-page";
import Home from "./routes/home";
import Settings from "./routes/settings";
import Login from "./routes/login";
import MainBooking from "./routes/main-booking";
import QueueManagement from "./routes/queue-management";
import CreateBooking from "./routes/create-booking";
import StaffManagement from "./routes/staff-management";
import StationConfiguration from "./routes/station-config";
import OvernightQueueManagement from "./routes/overnight-queue";
import RoutesPage from "./routes/routes";
import SupervisorVehicleManagement from './routes/supervisor-vehicle-management';
import DriverTicketsPage from './routes/driver-tickets';
import DayPassPage from './routes/day-pass';
import PreviewTicket from './routes/preview-ticket';
import LogoShowcasePage from './routes/logo-showcase';
import Dashboard from './routes/dashboard';
import PrintStaffReport from './routes/print-staff-report';
import PrintVehicleTrips from './routes/print-vehicle-trips';
import PrintAllVehicleTrips from './routes/print-all-vehicle-trips';
import PrintAllStaffReport from './routes/print-all-staff-report';
import VehicleReports from './routes/vehicle-reports';
import PrintVehicleReport from './routes/print-vehicle-report';
import PrintAllVehiclesReport from './routes/print-all-vehicles-report';
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

// Import enhanced API service
import enhancedApi from './services/enhancedLocalNodeApi';

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

// Enhanced system initialization
function useEnhancedSystemInit() {
  useEffect(() => {
    async function initializeEnhancedSystem() {
      try {
        console.log('🚀 Initializing enhanced system...');
        
        // Discover local node servers
        const discoveredServers = await enhancedApi.discoverLocalNodeServers();
        console.log('🔍 Discovered servers:', discoveredServers);
        
        // Check connection to best available server
        const isConnected = await enhancedApi.checkConnection();
        console.log('🔌 Connection status:', isConnected);
        
        if (isConnected) {
          console.log('✅ Enhanced system initialized successfully');
        } else {
          console.warn('⚠️ Enhanced system connection failed, using fallback');
        }
      } catch (error) {
        console.error('❌ Enhanced system initialization failed:', error);
      }
    }
    
    initializeEnhancedSystem();
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
        path: "/booking",
        element: <MainBooking />,
      },
      {
        path: "/create-booking",
        element: <CreateBooking />,
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
      {
        path: "/day-pass",
        element: <DayPassPage />,
      },
      {
        path: "/preview-ticket",
        element: <PreviewTicket />,
      },
      // Connection test route removed
      {
        path: "/logo-showcase",
        element: <LogoShowcasePage />,
      },
      {
        path: "/queue-management",
        element: <QueueManagement />,
      },
      {
        path: "/dashboard",
        element: <Dashboard />,
      },
      {
        path: "/print-staff-report",
        element: <PrintStaffReport />,
      },
      {
        path: "/print-vehicle-trips",
        element: <PrintVehicleTrips />,
      },
      {
        path: "/print-all-vehicle-trips",
        element: <PrintAllVehicleTrips />,
      },
      {
        path: "/print-all-staff-report",
        element: <PrintAllStaffReport />,
      },
      {
        path: "/vehicle-reports",
        element: <VehicleReports />,
      },
      {
        path: "/print-vehicle-report",
        element: <PrintVehicleReport />,
      },
      {
        path: "/print-all-vehicles-report",
        element: <PrintAllVehiclesReport />,
      },
    ],
  },
]);

const App: React.FC = () => {
  useAddFirewallRule();
  useEnhancedSystemInit();
  const { isInitialized, isInitializing, shouldShowLogin, completeInitialization } = useInit();

  // Socket.IO will be initialized when app is ready
  useEffect(() => {
    if (isInitialized && !isInitializing) {
      console.log('🚀 App initialized, Socket.IO will handle real-time communication');
      // Socket.IO connection will be handled by individual components and contexts
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
