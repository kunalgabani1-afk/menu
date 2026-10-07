/**
 * Client Environment Variable Validation
 *
 * Validates that the necessary Firebase client configuration identifiers are present.
 * Never logs or exposes credential values.
 */

export interface FirebaseClientEnv {
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export function getClientFirebaseConfig(): {
  config: FirebaseClientEnv;
  isConfigured: boolean;
  missingVariables: string[];
} {
  // Static access is required for Vite bundler optimization and replacement
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  const missingVariables: string[] = [];

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    missingVariables.push('VITE_FIREBASE_API_KEY');
  }
  if (!authDomain || typeof authDomain !== 'string' || authDomain.trim() === '') {
    missingVariables.push('VITE_FIREBASE_AUTH_DOMAIN');
  }
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
    missingVariables.push('VITE_FIREBASE_PROJECT_ID');
  }
  if (!appId || typeof appId !== 'string' || appId.trim() === '') {
    missingVariables.push('VITE_FIREBASE_APP_ID');
  }

  const config: FirebaseClientEnv = {
    apiKey: apiKey?.trim() || undefined,
    authDomain: authDomain?.trim() || undefined,
    databaseURL: databaseURL?.trim() || undefined,
    projectId: projectId?.trim() || undefined,
    storageBucket: storageBucket?.trim() || undefined,
    messagingSenderId: messagingSenderId?.trim() || undefined,
    appId: appId?.trim() || undefined,
  };

  return {
    config,
    isConfigured: missingVariables.length === 0,
    missingVariables,
  };
}
