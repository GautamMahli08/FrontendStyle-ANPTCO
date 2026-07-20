'use client';

import { useState, useEffect } from 'react';
import { configureAmplify } from '@/src/lib/amplify-config';
import { getCognitoUser } from '@/src/lib/auth';
import { getCurrentUser, setCurrentUser } from '@/src/lib/user-store';

let configured = false;

export default function AmplifyProvider({ children }: { children: React.ReactNode }) {
  if (!configured) { configureAmplify(); configured = true; }

  // If a Cognito user is already cached in localStorage → render immediately.
  // Otherwise wait for the async session check before pages read getCurrentUser().
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && !!getCurrentUser());

  useEffect(() => {
    if (ready) return;
    getCognitoUser()
      .then(user => { if (user) setCurrentUser(user); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
