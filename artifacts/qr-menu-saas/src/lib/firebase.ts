import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  createUserWithEmailAndPassword,
  updateProfile,
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
  signOut,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  reload,
  EmailAuthProvider,
  multiFactor,
  type Auth,
  type User,
  type Unsubscribe,
  type ActionCodeSettings,
} from 'firebase/auth';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getClientFirebaseConfig } from './env';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestoreDb: Firestore | null = null;

export function isFirebaseConfigured(): boolean {
  return getClientFirebaseConfig().isConfigured;
}

export function getMissingFirebaseVariables(): string[] {
  return getClientFirebaseConfig().missingVariables;
}

/**
 * Demo mode has been removed for production security.
 * Always returns false.
 */
export function isDemoMode(): boolean {
  return false;
}

export function getFirebaseApp(): FirebaseApp | null {
  const { config, isConfigured } = getClientFirebaseConfig();
  if (!isConfigured) return null;
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  return auth;
}

export function getFirestoreDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!firestoreDb) firestoreDb = getFirestore(firebaseApp);
  return firestoreDb;
}

export function subscribeToAuthState(listener: (user: User | null) => void): Unsubscribe {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, listener);
}

/**
 * Authenticates user securely using Firebase Authentication.
 * Never stores or falls back to demo accounts or simulated tokens.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    const missing = getMissingFirebaseVariables();
    const detail =
      missing.length > 0
        ? `Missing required client environment variable(s): ${missing.join(', ')}.`
        : 'Please define client environment variables (VITE_FIREBASE_API_KEY, etc.) in .env.local.';
    throw new Error(
      `Firebase Authentication is not configured. ${detail}`
    );
  }
  const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  return result.user;
}

/**
 * Authenticates user securely using a Firebase Custom Token (for staff switching).
 */
export async function signInWithCustomToken(customToken: string): Promise<User> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const result = await firebaseSignInWithCustomToken(firebaseAuth, customToken);
  return result.user;
}

/**
 * Generates valid ActionCodeSettings pointing back to the application origin.
 */
export function getActionCodeSettings(continuePath: string = '/login'): ActionCodeSettings {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://tableline.in';
  const cleanPath = continuePath.startsWith('/') ? continuePath : `/${continuePath}`;
  return {
    url: `${origin}${cleanPath}`,
    handleCodeInApp: true,
  };
}

/**
 * Sends a password reset email using Firebase Authentication's secure system.
 * STRICT ENFORCEMENT: Validates account existence against the TableLine registry
 * BEFORE dispatching to prevent sending emails to non-existent addresses or random input.
 * Dispatches via backend Identity Toolkit to avoid client UNAUTHORIZED_DOMAIN errors.
 */
export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    const err: any = new Error('Please enter a valid email address.');
    err.code = 'auth/invalid-email';
    throw err;
  }

  // 1. Dispatch via server forgot-password endpoint
  // This endpoint performs strict account existence verification first:
  // - If account does not exist, returns 404 with auth/user-not-found (NO email sent)
  // - If account exists, dispatches the password reset email via Identity Toolkit without domain restrictions
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    if (res.status === 404 || data?.code === 'auth/user-not-found') {
      const notFoundErr: any = new Error(
        'We couldn’t find an account registered with this email address. Please check the email and try again, or sign up for a new account.'
      );
      notFoundErr.code = 'auth/user-not-found';
      throw notFoundErr;
    }
    const err: any = new Error(data?.error || 'Failed to process password reset request.');
    err.code = data?.code || 'auth/unknown';
    throw err;
  }

  // 2. If backend already dispatched the reset email, we are done!
  if (data?.emailDispatched) {
    return;
  }

  // Fallback to client Firebase Auth if backend didn't dispatch
  try {
    const firebaseAuth = getFirebaseAuth();
    if (firebaseAuth) {
      await sendPasswordResetEmail(firebaseAuth, cleanEmail);
    }
  } catch (clientErr) {
    console.info('Client SDK notice:', clientErr);
  }
}

/**
 * Sends a passwordless sign-in magic link using Firebase Authentication.
 * Stores the email in localStorage to seamlessly complete sign-in upon redirect.
 * Enforces account existence check before sending.
 */
export async function sendMagicSignInLink(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    const err: any = new Error('Please enter a valid email address.');
    err.code = 'auth/invalid-email';
    throw err;
  }

  // 1. Dispatch via server send-signin-link endpoint
  // This endpoint performs strict registry and approval verification in the database:
  // - If account does not exist / not approved: returns 404 auth/user-not-found (NO email sent)
  // - If account exists and approved: dispatches the email link via Identity Toolkit without domain restrictions
  const continueUrl = typeof window !== 'undefined' ? `${window.location.origin}/login?email=${encodeURIComponent(cleanEmail)}` : '';
  const res = await fetch('/api/auth/send-signin-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, continueUrl }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    if (res.status === 404 || data?.code === 'auth/user-not-found') {
      const notFoundErr: any = new Error(
        'We couldn’t find an approved operator account registered with this email address. Please contact your restaurant administrator or sign up first.'
      );
      notFoundErr.code = 'auth/user-not-found';
      throw notFoundErr;
    }
    if (res.status === 403 || data?.code === 'auth/user-disabled') {
      const disabledErr: any = new Error(
        'This account has been deactivated. Please contact platform administration.'
      );
      disabledErr.code = 'auth/user-disabled';
      throw disabledErr;
    }
    const err: any = new Error(data?.error || 'Failed to dispatch sign-in link.');
    err.code = data?.code || 'auth/unknown';
    throw err;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('tableline_emailForSignIn', cleanEmail);
  }

  // If backend already dispatched the email via Identity Toolkit, we are all done!
  if (data?.emailDispatched) {
    return;
  }

  // Fallback to client Firebase Auth if backend didn't dispatch
  try {
    const firebaseAuth = getFirebaseAuth();
    if (firebaseAuth) {
      const settings = getActionCodeSettings(`/login?email=${encodeURIComponent(cleanEmail)}`);
      await sendSignInLinkToEmail(firebaseAuth, cleanEmail, settings);
    }
  } catch (clientErr) {
    console.info('Client SDK magic link notice:', clientErr);
  }
}

/**
 * Verifies whether an incoming URL represents a Firebase passwordless email sign-in link.
 */
export function checkIsSignInWithEmailLink(url: string): boolean {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return false;
  return isSignInWithEmailLink(firebaseAuth, url);
}

/**
 * Completes sign-in with email link using Firebase Authentication.
 */
export async function completeMagicLinkSignIn(url: string, emailFallback?: string): Promise<User> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured.');
  }
  let email = typeof window !== 'undefined' ? window.localStorage.getItem('tableline_emailForSignIn') : null;
  if (!email && emailFallback) {
    email = emailFallback;
  }
  if (!email) {
    try {
      const parsed = new URL(url);
      email = parsed.searchParams.get('email');
    } catch {}
  }
  if (!email) {
    throw new Error('Please enter your email to confirm sign-in.');
  }
  const result = await signInWithEmailLink(firebaseAuth, email.trim(), url);
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('tableline_emailForSignIn');
  }
  return result.user;
}

/**
 * Registers a new operator account in Firebase Authentication,
 * sets their display name, and sends a real email verification link.
 */
export async function signUpWithEmail(name: string, email: string, password: string): Promise<User> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    throw new Error('Firebase Authentication is not configured for this environment.');
  }
  const cleanEmail = email.trim();
  const cleanName = name.trim();
  const credential = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
  if (cleanName) {
    await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});
  }
  const settings = getActionCodeSettings('/login?mode=verifyEmail');
  await sendEmailVerification(credential.user, settings).catch((err) => {
    console.warn('Initial email verification dispatch warning:', err);
  });
  return credential.user;
}

/**
 * Verifies a password reset action code issued by Firebase Authentication.
 * Returns the associated email address if valid, or throws an error if expired or invalid.
 */
export async function verifyResetCode(oobCode: string): Promise<string> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase Authentication is not configured.');
  return verifyPasswordResetCode(firebaseAuth, oobCode);
}

/**
 * Completes a password reset operation using the Firebase action code.
 */
export async function confirmReset(oobCode: string, newPassword: string): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase Authentication is not configured.');
  await confirmPasswordReset(firebaseAuth, oobCode, newPassword);
}

/**
 * Applies an action code to verify a user's email address.
 */
export async function verifyEmailCode(oobCode: string): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase Authentication is not configured.');
  await applyActionCode(firebaseAuth, oobCode);
}

/**
 * Updates the currently signed-in user's password in Firebase Authentication.
 * Reauthenticates the user with their current password first for maximum security.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('No active authenticated session found. Please sign in again.');
  }
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  // Re-authenticate first to ensure session freshness
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(currentUser, credential);
  await updatePassword(currentUser, newPassword);
}

/**
 * Sends an email verification link to the currently signed-in user.
 */
export async function sendVerificationEmail(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser) {
    throw new Error('No active authenticated session found.');
  }
  const settings = getActionCodeSettings('/login?mode=verifyEmail');
  await sendEmailVerification(currentUser, settings);
}

/**
 * Reloads the user session to reflect updated email verification status or claims.
 */
export async function reloadCurrentUser(): Promise<User | null> {
  const firebaseAuth = getFirebaseAuth();
  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser) return null;
  await reload(currentUser);
  return firebaseAuth.currentUser;
}

/**
 * Retrieves enrolled MFA factors for the current user.
 */
export function getEnrolledMfaFactors(): string[] {
  const firebaseAuth = getFirebaseAuth();
  const currentUser = firebaseAuth?.currentUser;
  if (!currentUser) return [];
  try {
    const factors = multiFactor(currentUser).enrolledFactors;
    return factors.map((f) => f.factorId || f.displayName || 'MFA');
  } catch {
    return [];
  }
}

export async function signOutCurrentUser(): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (firebaseAuth) {
    await signOut(firebaseAuth);
  }
}

export async function getIdToken(): Promise<string | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;
  if (!firebaseAuth.currentUser) {
    if (typeof (firebaseAuth as any).authStateReady === 'function') {
      try {
        await (firebaseAuth as any).authStateReady();
      } catch {
        // ignore
      }
    } else {
      await new Promise<void>((resolve) => {
        const unsubscribe = onAuthStateChanged(firebaseAuth, () => {
          unsubscribe();
          resolve();
        });
        setTimeout(resolve, 1500);
      });
    }
  }
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser.getIdToken();
  }
  return null;
}

export async function uploadMenuImage(
  file: File,
  restaurantSlug: string,
  itemId = 'new',
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Images must be 5MB or smaller.');
  }
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase Storage is not configured for this environment.');
  const storage = getStorage(firebaseApp);
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `restaurants/${restaurantSlug}/menu-items/${itemId}/${Date.now()}-${safeName}`;
  const uploaded = await uploadBytes(ref(storage, path), file, {
    contentType: file.type,
    customMetadata: {
      restaurantSlug,
      menuItemId: itemId,
      originalName: file.name,
    },
  });
  return getDownloadURL(uploaded.ref);
}

setAuthTokenGetter(getIdToken);
