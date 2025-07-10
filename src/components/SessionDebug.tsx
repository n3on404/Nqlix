import React from 'react';
import { useAuth } from '../context/AuthProvider';
import SessionManager from '../lib/sessionManager';

const SessionDebug: React.FC = () => {
  const { isAuthenticated, currentStaff, isLoading } = useAuth();
  const sessionManager = SessionManager.getInstance();

  const sessionInfo = sessionManager.getSessionInfo();

  if (isLoading) {
    return <div className="p-4 bg-yellow-100 border border-yellow-400 rounded">
      <h3 className="font-bold text-yellow-800">Session Debug - Loading...</h3>
    </div>;
  }

  return (
    <div className="p-4 bg-gray-100 border border-gray-400 rounded mb-4">
      <h3 className="font-bold text-gray-800 mb-2">Session Debug Info</h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Authentication Status:</strong> {isAuthenticated ? '✅ Authenticated' : '❌ Not Authenticated'}
        </div>
        
        <div>
          <strong>Current Staff:</strong> {currentStaff ? `${currentStaff.firstName} ${currentStaff.lastName} (${currentStaff.role})` : 'None'}
        </div>
        
        <div>
          <strong>Session Info:</strong>
          <ul className="ml-4 mt-1">
            <li>Has Session: {sessionInfo.hasSession ? '✅' : '❌'}</li>
            <li>Has Token: {sessionInfo.hasToken ? '✅' : '❌'}</li>
            <li>Has Staff: {sessionInfo.hasStaff ? '✅' : '❌'}</li>
            <li>Is Expired: {sessionInfo.isExpired ? '❌' : '✅'}</li>
            {sessionInfo.expiresAt && (
              <li>Expires At: {sessionInfo.expiresAt.toLocaleString()}</li>
            )}
          </ul>
        </div>
        
        <div className="mt-4 space-x-2">
          <button 
            onClick={() => sessionManager.clearSession()}
            className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
          >
            Clear Session
          </button>
          
          <button 
            onClick={async () => {
              const result = await sessionManager.validateSession();
              console.log('Session validation result:', result);
              alert(`Session validation: ${result.isValid ? 'Valid' : 'Invalid'} (${result.source})`);
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
          >
            Validate Session
          </button>
          
          <button 
            onClick={async () => {
              const result = await sessionManager.refreshSession();
              alert(`Session refresh: ${result ? 'Success' : 'Failed'}`);
            }}
            className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
          >
            Refresh Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionDebug; 