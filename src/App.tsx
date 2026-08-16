import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, getUserProfile, getStaffEntitiesForMobile, checkRedirectAuthResult, logoutUser } from './firebase';
import { UserProfile, AppScreen, FOUNDER_EMAIL, UserRole } from './types';
import { SplashLoading } from './components/SplashLoading';
import { LoginPage } from './components/LoginPage';
import { MobileNumberStep } from './components/MobileNumberStep';
import { WelcomeDashboard } from './components/WelcomeDashboard';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';

const SESSION_CACHE_KEY = 'fmp_pwa_cached_user_session';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.uid) return parsed;
      }
    } catch (_) {}
    return null;
  });
  const [loadingMessage, setLoadingMessage] = useState('Checking authentication...');

  const pendingLoadRef = React.useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const loadAndSetUserProfile = async (firebaseUser: User) => {
    if (pendingLoadRef.current && pendingLoadRef.current.uid === firebaseUser.uid) {
      return pendingLoadRef.current.promise;
    }

    const loadPromise = (async () => {
      setLoadingMessage('Loading user profile & permissions...');
      const isFounder = firebaseUser.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();

      try {
        const firestoreProfile = await getUserProfile(firebaseUser.uid);

        let computedRole: UserRole = 'Public Member';
        if (isFounder) {
          computedRole = 'Founder';
        } else if (firestoreProfile?.role) {
          computedRole = firestoreProfile.role;
        }

        const userMobile = firestoreProfile?.mobileNumber || '';

        // Check if user's mobile is registered as staff under any entity
        if (computedRole === 'Public Member' && userMobile) {
          try {
            const staffEntities = await getStaffEntitiesForMobile(userMobile);
            if (staffEntities.length > 0) {
              computedRole = 'Staff';
            }
          } catch (_) {}
        }

        const profile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firestoreProfile?.displayName || 'User',
          email: firebaseUser.email || firestoreProfile?.email || '',
          photoURL: firebaseUser.photoURL || firestoreProfile?.photoURL || '',
          mobileNumber: userMobile,
          role: computedRole,
          isApproved: firestoreProfile?.isApproved || (computedRole === 'Founder')
        };

        setCurrentUser(profile);
        try {
          localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(profile));
        } catch (_) {}

        // Check if mobile number is present
        if (userMobile) {
          setScreen('welcome');
        } else {
          setScreen('mobile_update');
        }
      } catch (error) {
        console.warn('Notice loading profile from Firestore:', error);
        const fallbackProfile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || '',
          mobileNumber: '',
          role: isFounder ? 'Founder' : 'Public Member',
          isApproved: isFounder
        };
        setCurrentUser(fallbackProfile);
        try {
          localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(fallbackProfile));
        } catch (_) {}
        setScreen('mobile_update');
      } finally {
        if (pendingLoadRef.current?.uid === firebaseUser.uid) {
          pendingLoadRef.current = null;
        }
      }
    })();

    pendingLoadRef.current = { uid: firebaseUser.uid, promise: loadPromise };
    return loadPromise;
  };

  useEffect(() => {
    let isMounted = true;
    let authResolved = false;

    // Check for cached session to show dashboard immediately on PWA restart
    try {
      const cachedSessionStr = localStorage.getItem(SESSION_CACHE_KEY);
      if (cachedSessionStr) {
        const cachedProfile = JSON.parse(cachedSessionStr) as UserProfile;
        if (cachedProfile && cachedProfile.uid) {
          setCurrentUser(cachedProfile);
          setScreen(cachedProfile.mobileNumber ? 'welcome' : 'mobile_update');
        }
      }
    } catch (_) {}

    // Check for redirect result if returning from redirect login
    checkRedirectAuthResult().then(async (redirectUser) => {
      if (redirectUser && isMounted) {
        authResolved = true;
        await loadAndSetUserProfile(redirectUser);
      }
    }).catch(() => {});

    // Safety fallback timer to prevent infinite splash loading if Firebase auth takes too long
    const timeoutFallback = setTimeout(() => {
      if (!authResolved && isMounted) {
        if (auth.currentUser) {
          loadAndSetUserProfile(auth.currentUser);
        } else {
          const cachedSessionStr = localStorage.getItem(SESSION_CACHE_KEY);
          if (!cachedSessionStr) {
            setScreen('login');
          }
        }
      }
    }, 2800);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      authResolved = true;
      if (!isMounted) return;

      if (firebaseUser) {
        await loadAndSetUserProfile(firebaseUser);
      } else {
        // User is not authenticated with Firebase: clear cached session and go to login
        try {
          localStorage.removeItem(SESSION_CACHE_KEY);
        } catch (_) {}
        setCurrentUser(null);
        setScreen('login');
      }
    });

    // Handle tab visibility restore and online network restoration
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        getUserProfile(auth.currentUser.uid).then(profile => {
          if (profile && isMounted) {
            setCurrentUser(prev => {
              const updated = prev ? { ...prev, ...profile } : profile;
              try {
                localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(updated));
              } catch (_) {}
              return updated;
            });
          }
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      isMounted = false;
      clearTimeout(timeoutFallback);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
    };
  }, []);

  const handleRefreshUser = async () => {
    if (auth.currentUser) {
      await loadAndSetUserProfile(auth.currentUser);
    }
  };

  const handleLoginSuccess = async () => {
    if (auth.currentUser) {
      await loadAndSetUserProfile(auth.currentUser);
    } else {
      setScreen('login');
    }
  };

  const handleMobileSubmit = (updatedProfile: UserProfile) => {
    setCurrentUser(updatedProfile);
    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(updatedProfile));
    } catch (_) {}
    setScreen('welcome');
  };

  const handleEditMobile = () => {
    setScreen('mobile_update');
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
      await logoutUser();
    } catch (_) {}
    setCurrentUser(null);
    setScreen('login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {screen === 'splash' && (
        <SplashLoading 
          message={loadingMessage} 
          onSkip={() => setScreen(currentUser ? (currentUser.mobileNumber ? 'welcome' : 'mobile_update') : 'login')}
        />
      )}

      {screen === 'login' && <LoginPage onSuccess={handleLoginSuccess} />}

      {screen === 'mobile_update' && (
        currentUser ? (
          <MobileNumberStep
            user={currentUser}
            onComplete={handleMobileSubmit}
            onLogout={handleLogout}
            onCancel={currentUser.mobileNumber ? () => setScreen('welcome') : undefined}
          />
        ) : (
          <LoginPage onSuccess={handleLoginSuccess} />
        )
      )}

      {screen === 'welcome' && (
        currentUser ? (
          <WelcomeDashboard
            user={currentUser}
            onEditMobile={handleEditMobile}
            onLogout={handleLogout}
            onUserRefresh={handleRefreshUser}
          />
        ) : (
          <LoginPage onSuccess={handleLoginSuccess} />
        )
      )}

      {/* PWA Banner for mobile web install */}
      <PwaInstallPrompt />
    </div>
  );
}

