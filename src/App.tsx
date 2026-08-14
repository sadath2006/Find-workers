import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, getUserProfile, getStaffEntitiesForMobile, checkRedirectAuthResult } from './firebase';
import { UserProfile, AppScreen, FOUNDER_EMAIL, UserRole } from './types';
import { SplashLoading } from './components/SplashLoading';
import { LoginPage } from './components/LoginPage';
import { MobileNumberStep } from './components/MobileNumberStep';
import { WelcomeDashboard } from './components/WelcomeDashboard';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('splash');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Checking authentication...');

  const loadAndSetUserProfile = async (firebaseUser: User) => {
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
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || '',
        mobileNumber: userMobile,
        role: computedRole,
        isApproved: firestoreProfile?.isApproved || (computedRole === 'Founder')
      };

      setCurrentUser(profile);

      // Check if mobile number is present
      if (userMobile) {
        setScreen('welcome');
      } else {
        setScreen('mobile_update');
      }
    } catch (error) {
      console.error('Error loading profile from Firestore:', error);
      setCurrentUser({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || '',
        mobileNumber: '',
        role: isFounder ? 'Founder' : 'Public Member',
        isApproved: isFounder
      });
      setScreen('mobile_update');
    }
  };

  useEffect(() => {
    // Check for any pending redirect auth result from PWA/mobile Google login
    checkRedirectAuthResult().catch(() => {});

    let isSplashDone = false;
    let cachedUser: User | null = null;
    let hasAuthResolved = false;

    const splashTimer = setTimeout(() => {
      isSplashDone = true;
      if (hasAuthResolved) {
        if (cachedUser) {
          loadAndSetUserProfile(cachedUser);
        } else {
          setCurrentUser(null);
          setScreen('login');
        }
      }
    }, 800);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      hasAuthResolved = true;
      cachedUser = firebaseUser;
      if (isSplashDone) {
        if (firebaseUser) {
          await loadAndSetUserProfile(firebaseUser);
        } else {
          setCurrentUser(null);
          setScreen('login');
        }
      }
    });

    // Handle tab visibility restore and online network restoration
    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        getUserProfile(auth.currentUser.uid).then(profile => {
          if (profile) {
            setCurrentUser(prev => prev ? { ...prev, ...profile } : profile);
          }
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      clearTimeout(splashTimer);
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
    }
  };

  const handleMobileSubmit = (updatedProfile: UserProfile) => {
    setCurrentUser(updatedProfile);
    setScreen('welcome');
  };

  const handleEditMobile = () => {
    setScreen('mobile_update');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setScreen('login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {screen === 'splash' && <SplashLoading message={loadingMessage} />}

      {screen === 'login' && <LoginPage onSuccess={handleLoginSuccess} />}

      {screen === 'mobile_update' && currentUser && (
        <MobileNumberStep
          user={currentUser}
          onComplete={handleMobileSubmit}
          onLogout={handleLogout}
          onCancel={currentUser.mobileNumber ? () => setScreen('welcome') : undefined}
        />
      )}

      {screen === 'welcome' && currentUser && (
        <WelcomeDashboard
          user={currentUser}
          onEditMobile={handleEditMobile}
          onLogout={handleLogout}
          onUserRefresh={handleRefreshUser}
        />
      )}

      {/* PWA Banner for mobile web install */}
      <PwaInstallPrompt />
    </div>
  );
}
