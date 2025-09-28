import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard,
  Car,
  UserPlus,
  LogOut,
  Settings,
  User,
  Users,
  Shield,
  ShieldCheck,
  DollarSign,
  BarChart3,
  Moon,
  MapPin,
  Ticket,
  Eye,
  Menu,
  X
} from "lucide-react";
import { useAuth } from "./context/AuthProvider";
import { Button } from "./components/ui/button";
import { useSupervisorMode } from "./context/SupervisorModeProvider";
import { WaslaLogo } from "./components/WaslaLogo";
import { keyboardShortcuts } from "./services/keyboardShortcuts";
import KeyboardShortcutsHelp from "./components/KeyboardShortcutsHelp";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentStaff, logout } = useAuth();
  const { isSupervisorMode, toggleSupervisorMode } = useSupervisorMode();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  // Initialize keyboard shortcuts
  useEffect(() => {
    keyboardShortcuts.setNavigate(navigate);
  }, [navigate]);

  const selectedClass = "text-primary bg-primary/10";
  const defaultClass = "w-5 h-5";

  // Check if user is supervisor or admin
  const isSupervisor = currentStaff?.role === 'SUPERVISOR';
  const isAdmin = currentStaff?.role === 'ADMIN';

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsSidebarExpanded(!isSidebarExpanded);
  };

  // Different nav items based on mode
  const regularNavItems = [
    { path: "/", icon: UserPlus, label: "Réservation Principale" },
    { path: "/day-pass", icon: Ticket, label: "Pass Journalier" },
    { path: "/queue-management", icon: Users, label: "Gestion de File" },
  ];

  const supervisorNavItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/routes", icon: MapPin, label: "Routes" },
    { path: "/supervisor-vehicle-management", icon: Car, label: "Gestion des Véhicules" },
    { path: "/overnight-queue", icon: Moon, label: "File de Nuit" },
    { path: "/staff-management", icon: Users, label: "Personnel" },
    { path: "/station-config", icon: Settings, label: "Configuration" },
  ];

  const adminNavItems = [
    ...supervisorNavItems, // Admin gets all supervisor screens
    // Additional admin-only features can be added here in the future
  ];

  const navItems = (isSupervisorMode && (isSupervisor || isAdmin)) 
    ? (isAdmin ? adminNavItems : supervisorNavItems) 
    : regularNavItems;

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex min-w-screen min-h-screen">
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-screen bg-muted flex flex-col gap-2 px-2 py-3 border-r transition-all duration-300 ease-in-out z-30 ${
        isSidebarExpanded ? 'w-48' : 'w-16'
      }`}>
        {/* Header with Logo and Toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className={`flex items-center justify-center transition-all duration-300 ease-in-out ${
            isSidebarExpanded ? 'w-32 h-10' : 'w-12 h-12'
          }`}>
            {isSidebarExpanded ? (
              <WaslaLogo size={32} showText={true} textSize="sm" className="text-primary" />
            ) : (
              <WaslaLogo size={32} />
            )}
          </div>
          
          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            className={`p-2 transition-all duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}
            onClick={toggleSidebar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Menu Toggle Button (when collapsed) */}
        {!isSidebarExpanded && (
          <Button
            variant="ghost"
            size="sm"
            className="w-12 h-12 p-0 mb-2"
            onClick={toggleSidebar}
            title="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {/* Supervisor Mode Toggle */}
        {(isSupervisor || isAdmin) && (
          <div className="mb-2">
            <Button
              variant={isSupervisorMode ? "default" : "outline"}
              size="sm"
              className={`transition-all duration-300 ease-in-out ${
                isSidebarExpanded 
                  ? 'w-44 justify-start px-3' 
                  : 'w-12 h-12 p-0 justify-center'
              }`}
              onClick={toggleSupervisorMode}
              title={isSupervisorMode ? "Quitter le Mode Superviseur" : "Entrer en Mode Superviseur"}
            >
              <div className="flex items-center space-x-2">
                {isSupervisorMode ? (
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <Shield className="w-5 h-5 flex-shrink-0" />
                )}
                {isSidebarExpanded && (
                  <span className="text-xs font-medium">
                    {isSupervisorMode ? "Quitter Superviseur" : "Mode Superviseur"}
                  </span>
                )}
              </div>
            </Button>
          </div>
        )}

        {/* Main Navigation */}
        <div className="space-y-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                className={clsx(
                  "hover:text-primary hover:bg-primary/5 flex items-center rounded-lg transition-all duration-300 ease-in-out",
                  isSidebarExpanded 
                    ? "w-44 justify-start px-3 py-3" 
                    : "w-12 h-12 justify-center",
                  {
                    [selectedClass]: isActive,
                  }
                )}
                to={item.path}
                title={item.label}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={clsx(defaultClass, "flex-shrink-0")} />
                  {isSidebarExpanded && (
                    <span className="text-sm font-medium">
                      {item.label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-grow" />
        
        {/* User Info */}
        {currentStaff && (
          <div className="mb-2 px-1">
            <div className={`rounded-lg flex items-center transition-all duration-300 ease-in-out ${
              isSidebarExpanded 
                ? 'w-44 justify-start px-3 py-3' 
                : 'w-12 h-12 justify-center'
            } ${
              isSupervisorMode ? 'bg-primary text-white' : 'bg-secondary text-secondary-foreground'
            }`} 
            title={`${currentStaff.firstName} ${currentStaff.lastName}${isSupervisorMode ? ' (Supervisor Mode)' : ''}`}>
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 flex-shrink-0" />
                {isSidebarExpanded && (
                  <div className="text-left">
                    <div className="text-xs font-medium">{currentStaff.firstName} {currentStaff.lastName}</div>
                    <div className="text-[10px] opacity-75">
                      {isSupervisorMode ? 'MODE SUPERVISEUR' : currentStaff.role}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {!isSidebarExpanded && (
              <div className="text-xs text-center text-muted-foreground mt-1">
                <div className="font-medium">{currentStaff.firstName}</div>
                <div className="text-[8px]">
                  {isSupervisorMode ? 'SUPERVISEUR' : currentStaff.role}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Bottom Navigation */}
        <div className="space-y-2">
          {/* Settings - only show in regular mode */}
          {!isSupervisorMode && (
            <Link 
              className={clsx(
                "hover:text-primary hover:bg-primary/5 flex items-center rounded-lg transition-all duration-300 ease-in-out",
                isSidebarExpanded 
                  ? "w-44 justify-start px-3 py-3" 
                  : "w-12 h-12 justify-center",
                {
                  [selectedClass]: location.pathname === "/settings",
                }
              )}
              to="/settings"
              title="Paramètres"
            >
              <div className="flex items-center space-x-3">
                <Settings className={clsx(defaultClass, "flex-shrink-0")} />
                {isSidebarExpanded && (
                  <span className="text-sm font-medium">
                    Paramètres
                  </span>
                )}
              </div>
            </Link>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className={`hover:bg-red-50 hover:text-red-600 flex items-center transition-all duration-300 ease-in-out ${
              isSidebarExpanded 
                ? 'w-44 justify-start px-3 py-3' 
                : 'w-12 h-12 p-0 justify-center'
            }`}
            onClick={handleLogout}
            title="Déconnexion"
          >
            <div className="flex items-center space-x-3">
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {isSidebarExpanded && (
                <span className="text-sm font-medium">
                  Déconnexion
                </span>
              )}
            </div>
          </Button>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className={`flex-1 min-h-screen overflow-auto transition-all duration-300 ease-in-out ${
        isSidebarExpanded ? 'ml-48' : 'ml-16'
      }`}>
        <Outlet />
      </div>
      
      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp />
      
      {/*<SocketMonitor />*/}
      
    </div>
  );
}
