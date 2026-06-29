import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

const firebaseConfig = {
  projectId: "keen-scheme-pwr9b",
  appId: "1:640360468920:web:f342ebe9dda66a9f71ff4d",
  apiKey: "AIzaSyClEotQ4lVTEINt1j4-uIi5wPHBgDyeSNM",
  authDomain: "keen-scheme-pwr9b.firebaseapp.com",
  storageBucket: "keen-scheme-pwr9b.firebasestorage.app",
  messagingSenderId: "640360468920",
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore specifying the database id supplied in the project setup
export const db = getFirestore(app, "ai-studio-a1501ba9-0952-496f-9cc2-18b45134fe13");

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Try retrieving cached token from localStorage first for refresh longevity if applicable,
  // but Workspace API skill advises in-memory cache. Let's do in-memory primarily but fallback to sessionStorage safely to handle iframe refreshes elegantly
  const sessionToken = sessionStorage.getItem('gcal_token');
  if (sessionToken) {
    cachedAccessToken = sessionToken;
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      sessionStorage.removeItem('gcal_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google with requested calendar scope
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('gcal_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || sessionStorage.getItem('gcal_token');
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem('gcal_token');
};
