import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthProvider';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Loader2, ArrowLeft, Phone, CheckCircle, Clock, Shield, AlertCircle, Settings } from "lucide-react";
import { useInit } from "../context/InitProvider";

type VerificationStep = 'cin' | 'phone' | 'success' | 'config';

export default function LoginScreen() {
  const [step, setStep] = useState<VerificationStep>('cin');
  const [cinDigits, setCinDigits] = useState<string[]>(Array(8).fill(""));
  const [phoneDigits, setPhoneDigits] = useState<string[]>(Array(6).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [countdown, setCountdown] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const navigate = useNavigate();
  const { initiateLogin, verifyLogin } = useAuth();
  const { systemStatus, updateServerUrl } = useInit();

  // Refs for input focus management
  const cinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const phoneInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Set server URL from system status
  useEffect(() => {
    setServerUrl(systemStatus.localNodeUrl.replace(/\/api$/, ''));
  }, [systemStatus.localNodeUrl]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle CIN digit input
  const handleCinDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newDigits = [...cinDigits];
    newDigits[index] = value.slice(-1);
    setCinDigits(newDigits);
    setError(null);

    // Auto-focus next input
    if (value && index < 7) {
      cinInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 8 digits are filled
    if (newDigits.every(digit => digit !== '') && newDigits.join('').length === 8) {
      handleCinSubmit(newDigits.join(''));
    }
  };

  // Handle phone digit input
  const handlePhoneDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newDigits = [...phoneDigits];
    newDigits[index] = value.slice(-1);
    setPhoneDigits(newDigits);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      phoneInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (newDigits.every(digit => digit !== '') && newDigits.join('').length === 6) {
      handlePhoneSubmit(newDigits.join(''));
    }
  };

  // Handle key down events
  const handleKeyDown = (e: React.KeyboardEvent, index: number, type: 'cin' | 'phone') => {
    const refs = type === 'cin' ? cinInputRefs : phoneInputRefs;
    const maxLength = type === 'cin' ? 8 : 6;
    
    if (e.key === 'Backspace' && index > 0) {
      const currentDigits = type === 'cin' ? cinDigits : phoneDigits;
      if (!currentDigits[index]) {
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < maxLength - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  // Handle paste events
  const handlePaste = (e: React.ClipboardEvent, type: 'cin' | 'phone') => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '');
    const maxLength = type === 'cin' ? 8 : 6;
    
    if (pasteData.length === maxLength) {
      const newDigits = pasteData.split('');
      if (type === 'cin') {
        setCinDigits(newDigits);
        handleCinSubmit(pasteData);
      } else {
        setPhoneDigits(newDigits);
        handlePhoneSubmit(pasteData);
      }
    }
  };

  const handleCinSubmit = async (cin: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await initiateLogin(cin);
      
      if (response.success) {
        setFoundUser({
          cin,
          firstName: response.data?.firstName || 'Utilisateur',
          lastName: response.data?.lastName || '',
          phoneNumber: response.data?.phoneNumber || '',
        });
        setStep('phone');
        setCountdown(30);
      } else {
        setError(response.message || 'Numéro CIN non trouvé dans notre système. Veuillez vérifier votre numéro ou contacter votre superviseur.');
        setCinDigits(Array(8).fill(''));
        cinInputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Impossible de se connecter au serveur d\'authentification. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneSubmit = async (verificationCode: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyLogin(foundUser.cin, verificationCode);
      
      if (response.success) {
        // Show success state briefly
        setShowSuccess(true);
        setStep('success');
        
        // Wait for success animation then navigate
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setError(response.message || 'Code de vérification incorrect. Veuillez réessayer.');
        setPhoneDigits(Array(6).fill(''));
        phoneInputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Échec de la vérification. Veuillez réessayer ou demander un nouveau code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await initiateLogin(foundUser.cin);
      
      if (response.success) {
        setCountdown(30);
        setPhoneDigits(Array(6).fill(''));
        phoneInputRefs.current[0]?.focus();
      } else {
        setError(response.message || 'Échec de l\'envoi du code de vérification.');
      }
    } catch (err) {
      setError('Échec de la connexion au serveur. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServerConfig = async () => {
    setStep('config');
  };

  const handleTestServerConnection = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await updateServerUrl(serverUrl);
      
      if (success) {
        setStep('cin');
        setError(null);
      } else {
        setError('Impossible de se connecter au serveur. Vérifiez l\'URL et réessayez.');
      }
    } catch (err) {
      setError('Erreur de configuration du serveur.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToCin = () => {
    setStep('cin');
    setError(null);
    setCinDigits(Array(8).fill(''));
    setPhoneDigits(Array(6).fill(''));
    setFoundUser(null);
    setCountdown(0);
  };

  const getStepIcon = () => {
    switch (step) {
      case 'cin':
        return <Shield className="w-10 h-10 text-white" />;
      case 'phone':
        return <Phone className="w-10 h-10 text-white" />;
      case 'success':
        return <CheckCircle className="w-10 h-10 text-white" />;
      case 'config':
        return <Settings className="w-10 h-10 text-white" />;
      default:
        return <Shield className="w-10 h-10 text-white" />;
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'cin':
        return 'Accès Sécurisé';
      case 'phone':
        return 'Vérification d\'Identité';
      case 'success':
        return 'Accès Accordé';
      case 'config':
        return 'Configuration du Serveur';
      default:
        return 'Nqlix Station';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'cin':
        return 'Entrez votre numéro d\'identité nationale à 8 chiffres (CIN) pour commencer l\'authentification';
      case 'phone':
        return `Bon retour, ${foundUser?.firstName}! Veuillez vérifier votre identité`;
      case 'success':
        return 'Authentification réussie. Redirection vers votre espace de travail...';
      case 'config':
        return 'Configurer la connexion au serveur local';
      default:
        return '';
    }
  };

  const maskPhoneNumber = (phoneNumber: string) => {
    // For "+216 20 123 456" -> "+216 20 12x xx"
    const parts = phoneNumber.split(' ');
    if (parts.length === 4) {
      return `${parts[0]} ${parts[1]} ${parts[2].slice(0, 2)}x xx`;
    }
    return phoneNumber;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Card className={`shadow-2xl border-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl transition-all duration-700 ease-out transform ${
          step === 'success' ? 'scale-105 ring-4 ring-green-500 ring-opacity-50' : ''
        }`}>
          <CardHeader className="pb-4 relative">
            {step !== 'cin' && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-4 top-4"
                onClick={handleBackToCin}
                disabled={isLoading || step === 'success'}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour
              </Button>
            )}
            
            <div className="mx-auto bg-primary w-20 h-20 rounded-2xl flex items-center justify-center mb-4">
              {getStepIcon()}
            </div>
            <CardTitle className="text-center text-2xl font-bold">
              {getStepTitle()}
            </CardTitle>
            <CardDescription className="text-center">
              {getStepDescription()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'cin' && (
              <>
                <div className="grid grid-cols-8 gap-2 mb-6">
                  {cinDigits.map((digit, index) => (
                    <Input
                      key={index}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCinDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'cin')}
                      onPaste={(e) => handlePaste(e, 'cin')}
                      ref={(el) => (cinInputRefs.current[index] = el)}
                      className="text-center text-lg font-mono h-14"
                      disabled={isLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
                
                <Button 
                  className="w-full mb-4" 
                  disabled={cinDigits.some(d => d === '') || isLoading}
                  onClick={() => handleCinSubmit(cinDigits.join(''))}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    'Continuer'
                  )}
                </Button>

                <div className="text-center">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleServerConfig}
                    className="text-xs text-gray-500"
                  >
                    <Settings className="w-3 h-3 mr-1" />
                    Configurer le Serveur
                  </Button>
                </div>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 inline-block mr-2" />
                    {error}
                  </div>
                )}
              </>
            )}

            {step === 'phone' && (
              <>
                <p className="text-sm text-center mb-4 text-gray-500 dark:text-gray-400">
                  Entrez le code de vérification envoyé à votre téléphone
                  <br />
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {maskPhoneNumber(foundUser?.phoneNumber || '')}
                  </span>
                </p>
                
                <div className="grid grid-cols-6 gap-2 mb-6">
                  {phoneDigits.map((digit, index) => (
                    <Input
                      key={index}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePhoneDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'phone')}
                      onPaste={(e) => handlePaste(e, 'phone')}
                      ref={(el) => (phoneInputRefs.current[index] = el)}
                      className="text-center text-lg font-mono h-14"
                      disabled={isLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
                
                <Button 
                  className="w-full mb-4" 
                  disabled={phoneDigits.some(d => d === '') || isLoading}
                  onClick={() => handlePhoneSubmit(phoneDigits.join(''))}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    'Vérifier et Se Connecter'
                  )}
                </Button>
                
                <div className="text-center">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleResendCode}
                    disabled={countdown > 0 || isLoading}
                    className="text-xs"
                  >
                    {countdown > 0 ? (
                      <>
                        <Clock className="w-3 h-3 mr-1" />
                        Renvoyer dans {countdown}s
                      </>
                    ) : (
                      'Renvoyer le Code'
                    )}
                  </Button>
                </div>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 inline-block mr-2" />
                    {error}
                  </div>
                )}
              </>
            )}

            {step === 'success' && (
              <div className="text-center py-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  Connexion Réussie !
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  Redirection vers le tableau de bord...
                </p>
              </div>
            )}

            {step === 'config' && (
              <>
                <div className="space-y-4 mb-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL du Serveur</label>
                    <Input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="http://localhost:3001"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-gray-500">
                      Exemple: http://localhost:3001 ou http://192.168.1.100:3001
                    </p>
                  </div>
                </div>
                
                <Button 
                  className="w-full mb-4" 
                  disabled={!serverUrl || isLoading}
                  onClick={handleTestServerConnection}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Test de Connexion...
                    </>
                  ) : (
                    'Tester et Sauvegarder'
                  )}
                </Button>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 inline-block mr-2" />
                    {error}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 