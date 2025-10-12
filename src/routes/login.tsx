import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Loader2, Shield, AlertCircle, Settings } from "lucide-react";
import { useInit } from "../context/InitProvider";
import RouteSelection from '../components/RouteSelection';

type LoginStep = 'route-selection' | 'login' | 'success' | 'config';

export default function LoginScreen() {
  const [step, setStep] = useState<LoginStep>('route-selection');
  const [cin, setCin] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();
  const { systemStatus, updateServerUrl } = useInit();

  // Set server URL from system status
  useEffect(() => {
    setServerUrl(systemStatus.localNodeUrl.replace(/\/api$/, ''));
  }, [systemStatus.localNodeUrl]);

  const handleRouteSelected = (routeId: string) => {
    setSelectedRoute(routeId);
    setStep('login');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!cin || cin.length !== 8) {
      setError('Le CIN doit contenir exactement 8 chiffres');
      setIsLoading(false);
      return;
    }

    try {
      const response = await login(cin, selectedRoute);
      
      if (response.success) {
        setShowSuccess(true);
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        setError(response.message || 'CIN incorrect');
      }
    } catch (err) {
      setError('Impossible de se connecter au serveur. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServerUrlUpdate = async () => {
    if (serverUrl) {
      await updateServerUrl(serverUrl);
      setStep('login');
    }
  };

  const handleCinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setCin(value);
    setError(null);
  };

  if (step === 'route-selection') {
    return <RouteSelection onRouteSelected={handleRouteSelected} isLoading={isLoading} />;
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Connexion réussie!</h2>
              <p className="text-gray-600">Redirection vers le tableau de bord...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'config') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration du serveur
            </CardTitle>
            <CardDescription>
              Configurez l'URL du serveur local
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL du serveur local
              </label>
              <Input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.192.100:3001"
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleServerUrlUpdate}
                className="flex-1"
                disabled={!serverUrl}
              >
                Sauvegarder
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('login')}
              >
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Connexion
          </CardTitle>
          <CardDescription>
            Connectez-vous avec votre numéro CIN
            {selectedRoute && (
              <div className="mt-2">
                <span className="text-sm text-blue-600 font-medium">
                  Route sélectionnée: {selectedRoute}
                </span>
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Numéro CIN
              </label>
              <Input
                type="text"
                value={cin}
                onChange={handleCinChange}
                placeholder="12345678"
                maxLength={8}
                className="w-full text-center text-lg tracking-widest"
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !cin}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-200 space-y-2">
            <button
              onClick={() => setStep('route-selection')}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              ← Retour à la sélection de route
            </button>
            <button
              onClick={() => setStep('config')}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Settings className="w-4 h-4" />
              Configuration du serveur
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}