import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut, 
  User 
} from 'firebase/auth';
import { 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  UserProfile, 
  UserRole, 
  EntityRecord, 
  WorkerRecord, 
  CommentRecord, 
  WorkerTransferLog,
  WorkerScanLog,
  WorkerComment,
  FOUNDER_EMAIL 
} from './types';
import { compressImage } from './utils/imageCompressor';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore strictly with in-memory caching and forced long-polling to prevent connection drops across proxies/PWAs
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId || undefined
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const rawMsg = error instanceof Error ? error.message : String(error);
  if (isTransientFirestoreError(error)) {
    console.warn(`Transient Firestore connection issue during ${operationType} on ${path}:`, rawMsg);
    throw new Error('Database connection re-establishing. Please try again in a moment.');
  }
  const errInfo: FirestoreErrorInfo = {
    error: rawMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(rawMsg);
}

/**
 * Checks if an error is a transient connection, closing database, or offline error.
 */
function isTransientFirestoreError(error: any): boolean {
  if (!error) return false;
  const msg = (error?.message || String(error)).toLowerCase();
  const code = (error?.code || '').toLowerCase();
  const name = (error?.name || '').toLowerCase();
  return (
    msg.includes('closing') ||
    msg.includes('closed') ||
    msg.includes('hidden') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('failed to get document') ||
    msg.includes('connection') ||
    msg.includes('indexeddb') ||
    msg.includes('internal') ||
    name.includes('domexception') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded')
  );
}

/**
 * Executes a Firestore asynchronous operation with automatic retries on transient connection or closing errors.
 */
async function withFirestoreRetry<T>(fn: () => Promise<T>, maxRetries = 5, delayMs = 350): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isTransientFirestoreError(err)) {
        await new Promise(res => setTimeout(res, delayMs * Math.pow(1.5, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Auth Helpers
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    const code = err?.code || '';
    const msg = (err?.message || '').toLowerCase();

    if (code === 'auth/unauthorized-domain') {
      throw err;
    }

    // Auto-fallback to direct redirect sign-in if popup is blocked, cancelled by webview/PWA, or not supported in this environment
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/cancelled-popup-request' ||
      msg.includes('popup') ||
      msg.includes('not-supported')
    ) {
      console.info('Switching to redirect sign-in for PWA / mobile browser compatibility:', code || msg);
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function loginWithGoogleRedirect(): Promise<void> {
  await signInWithRedirect(auth, googleProvider);
}

export async function checkRedirectAuthResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result ? result.user : null;
  } catch (err: any) {
    console.warn('getRedirectResult check:', err);
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    if (auth.currentUser) {
      localStorage.removeItem(`fmp_user_profile_${auth.currentUser.uid}`);
    }
    localStorage.removeItem('fmp_pwa_cached_user_session');
  } catch (_) {}
  await firebaseSignOut(auth);
}

// User Profile Firestore Helpers
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  const localCacheKey = `fmp_user_profile_${uid}`;

  // 1. Check local storage cache first for instant loading
  let cachedProfile: UserProfile | null = null;
  try {
    const cached = localStorage.getItem(localCacheKey);
    if (cached) {
      cachedProfile = JSON.parse(cached) as UserProfile;
    }
  } catch (_) {}

  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await withFirestoreRetry(() => getDoc(userDocRef)).catch(() => null);

    if (docSnap && docSnap.exists()) {
      const data = docSnap.data() as UserProfile;
      let needsUpdate = false;
      const updates: Partial<UserProfile> = {};

      // Auto-enforce Founder for sadath2006@gmail.com
      if (data.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase() && data.role !== 'Founder') {
        data.role = 'Founder';
        updates.role = 'Founder';
        needsUpdate = true;
      }

      // Check if user's mobile is registered as staff under any entity
      if (data.role === 'Public Member' && data.mobileNumber) {
        const cleanMobile = data.mobileNumber.replace(/\D/g, '');
        if (cleanMobile) {
          try {
            const staffEntities = await getStaffEntitiesForMobile(cleanMobile);
            if (staffEntities.length > 0) {
              data.role = 'Staff';
              updates.role = 'Staff';
              needsUpdate = true;
            }
          } catch (_) {}
        }
      }

      if (needsUpdate) {
        await withFirestoreRetry(() => updateDoc(userDocRef, updates)).catch(() => {});
      }

      try {
        localStorage.setItem(localCacheKey, JSON.stringify(data));
      } catch (_) {}

      return data;
    }
  } catch (error) {
    console.warn('getUserProfile fetch notice (falling back to cache):', error);
  }

  // 2. Return cached profile if available
  if (cachedProfile) {
    return cachedProfile;
  }

  // 3. Fallback for authenticated user if document in Firestore is not created yet or connection is resetting
  if (auth.currentUser && auth.currentUser.uid === uid) {
    const isFounder = auth.currentUser.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
    const fallbackProfile: UserProfile = {
      uid,
      displayName: auth.currentUser.displayName || 'User',
      email: auth.currentUser.email || '',
      photoURL: auth.currentUser.photoURL || '',
      mobileNumber: '',
      role: isFounder ? 'Founder' : 'Public Member',
      isApproved: isFounder
    };
    try {
      localStorage.setItem(localCacheKey, JSON.stringify(fallbackProfile));
    } catch (_) {}
    return fallbackProfile;
  }

  return null;
}

export async function saveUserProfile(uid: string, profileData: Partial<UserProfile>): Promise<UserProfile> {
  const path = `users/${uid}`;
  const localCacheKey = `fmp_user_profile_${uid}`;

  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await withFirestoreRetry(() => getDoc(userDocRef)).catch(() => null);

    const newCleanMobile = (profileData.mobileNumber || '').replace(/\D/g, '');
    const oldCleanMobile = docSnap && docSnap.exists() ? (docSnap.data()?.mobileNumber || '').replace(/\D/g, '') : '';

    // 1. Mobile Number Uniqueness Check across users
    if (newCleanMobile) {
      const usersCol = collection(db, 'users');
      const allUsersSnap = await withFirestoreRetry(() => getDocs(usersCol)).catch(() => null);
      let duplicateUser: UserProfile | null = null;

      if (allUsersSnap) {
        allUsersSnap.forEach((uDoc) => {
          if (uDoc.id !== uid) {
            const uData = uDoc.data() as UserProfile;
            const uClean = (uData.mobileNumber || '').replace(/\D/g, '');
            if (uClean && uClean === newCleanMobile) {
              duplicateUser = uData;
            }
          }
        });
      }

      if (duplicateUser) {
        const dupName = (duplicateUser as UserProfile).displayName || (duplicateUser as UserProfile).email || 'another user';
        throw new Error(`Mobile number ${newCleanMobile} is already registered by ${dupName}. Please use a different mobile number.`);
      }
    }

    // 2. Migrate staff mobile numbers in entities if user changed their mobile number
    if (oldCleanMobile && newCleanMobile && oldCleanMobile !== newCleanMobile) {
      try {
        const staffEntities = await getStaffEntitiesForMobile(oldCleanMobile);
        for (const ent of staffEntities) {
          const updatedStaffMobiles = (ent.staffMobiles || []).map(m => m === oldCleanMobile ? newCleanMobile : m);
          const entDocRef = doc(db, 'entities', ent.id);
          await withFirestoreRetry(() => updateDoc(entDocRef, {
            staffMobiles: updatedStaffMobiles,
            updatedAt: new Date().toISOString()
          })).catch(() => {});
        }
      } catch (_) {}
    }

    const isFounder = profileData.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
    let defaultRole: UserRole = isFounder ? 'Founder' : (profileData.role || (docSnap && docSnap.exists() ? docSnap.data()?.role : 'Public Member') || 'Public Member');

    // Auto-check if mobile is in staffMobiles
    if (defaultRole === 'Public Member' && newCleanMobile) {
      try {
        const staffEntities = await getStaffEntitiesForMobile(newCleanMobile);
        if (staffEntities.length > 0) {
          defaultRole = 'Staff';
        }
      } catch (_) {}
    }

    const payload: UserProfile = {
      uid,
      displayName: profileData.displayName || (docSnap && docSnap.exists() ? docSnap.data()?.displayName : 'User'),
      email: profileData.email || (docSnap && docSnap.exists() ? docSnap.data()?.email : ''),
      photoURL: profileData.photoURL || (docSnap && docSnap.exists() ? docSnap.data()?.photoURL : ''),
      mobileNumber: newCleanMobile,
      role: defaultRole,
      isApproved: isFounder ? true : (docSnap && docSnap.exists() ? docSnap.data()?.isApproved || false : false),
      createdAt: docSnap && docSnap.exists() ? docSnap.data()?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!docSnap || !docSnap.exists()) {
      await withFirestoreRetry(() => setDoc(userDocRef, payload));
    } else {
      await withFirestoreRetry(() => updateDoc(userDocRef, {
        displayName: payload.displayName,
        email: payload.email,
        photoURL: payload.photoURL,
        mobileNumber: payload.mobileNumber,
        role: payload.role,
        updatedAt: payload.updatedAt
      }));
    }

    try {
      localStorage.setItem(localCacheKey, JSON.stringify(payload));
    } catch (_) {}

    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const usersCol = collection(db, 'users');
    const snapshot = await withFirestoreRetry(() => getDocs(usersCol));
    const users: UserProfile[] = [];
    snapshot.forEach(docSnap => {
      users.push(docSnap.data() as UserProfile);
    });
    return users;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      console.warn('getAllUsers transient connection warning:', error);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function updateUserRole(
  targetUid: string, 
  newRole: UserRole, 
  requesterRole: UserRole
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    // Role Hierarchy Checks
    if (requesterRole !== 'Founder' && requesterRole !== 'Super Admin' && requesterRole !== 'Committee') {
      throw new Error('Unauthorized to change user roles.');
    }
    if (requesterRole === 'Super Admin' && (newRole === 'Founder' || newRole === 'Super Admin')) {
      throw new Error('Super Admin cannot assign Founder or Super Admin roles.');
    }

    const userDocRef = doc(db, 'users', targetUid);
    const userSnap = await withFirestoreRetry(() => getDoc(userDocRef));
    const userData = userSnap.exists() ? (userSnap.data() as UserProfile) : null;

    await withFirestoreRetry(() => updateDoc(userDocRef, {
      role: newRole,
      updatedAt: new Date().toISOString()
    }));

    // If role changed to Public Member, remove staff assignment from all entities
    if (newRole === 'Public Member' && userData?.mobileNumber) {
      const cleanMobile = userData.mobileNumber.replace(/\D/g, '');
      if (cleanMobile) {
        const staffEntities = await getStaffEntitiesForMobile(cleanMobile);
        for (const ent of staffEntities) {
          const updatedMobiles = (ent.staffMobiles || []).filter(m => m !== cleanMobile);
          await withFirestoreRetry(() => updateDoc(doc(db, 'entities', ent.id), {
            staffMobiles: updatedMobiles,
            updatedAt: new Date().toISOString()
          })).catch(() => {});
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function approveUser(targetUid: string): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    const userDocRef = doc(db, 'users', targetUid);
    await withFirestoreRetry(() => updateDoc(userDocRef, {
      isApproved: true,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserDocument(targetUid: string, requesterRole: UserRole): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    if (requesterRole !== 'Founder' && requesterRole !== 'Super Admin') {
      throw new Error('Only Founder or Super Admin can delete user profiles.');
    }
    const userDocRef = doc(db, 'users', targetUid);
    await withFirestoreRetry(() => deleteDoc(userDocRef));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Entity Firestore Helpers (Company & Room Management)
export async function createOrUpdateEntity(entityData: Partial<EntityRecord>): Promise<EntityRecord> {
  const path = 'entities';
  try {
    const entityId = entityData.id || doc(collection(db, 'entities')).id;
    const entityRef = doc(db, 'entities', entityId);
    const existingSnap = await withFirestoreRetry(() => getDoc(entityRef)).catch(() => null);

    const payload: EntityRecord = {
      id: entityId,
      type: entityData.type || 'Company',
      name: entityData.name || 'Unnamed Entity',
      registrationNumber: entityData.registrationNumber || '',
      address: entityData.address || '',
      ownerUid: entityData.ownerUid || auth.currentUser?.uid || '',
      ownerName: entityData.ownerName || auth.currentUser?.displayName || 'Owner',
      ownerEmail: entityData.ownerEmail || auth.currentUser?.email || '',
      ownerMobile: entityData.ownerMobile || '',
      staffMobiles: entityData.staffMobiles || [],
      hasUpdatedDetails: true, // Marked as true once updated
      createdAt: existingSnap && existingSnap.exists() ? existingSnap.data()?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await withFirestoreRetry(() => setDoc(entityRef, payload));
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function getOwnerEntities(ownerUid: string): Promise<EntityRecord[]> {
  const path = 'entities';
  try {
    const q = query(collection(db, 'entities'), where('ownerUid', '==', ownerUid));
    const snapshot = await withFirestoreRetry(() => getDocs(q));
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      console.warn('getOwnerEntities transient error:', error);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getAllEntities(): Promise<EntityRecord[]> {
  const path = 'entities';
  try {
    const snapshot = await withFirestoreRetry(() => getDocs(collection(db, 'entities')));
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      console.warn('getAllEntities transient error:', error);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function addStaffToEntity(entityId: string, mobileNumber: string): Promise<void> {
  const path = `entities/${entityId}`;
  try {
    const entityRef = doc(db, 'entities', entityId);
    const snap = await withFirestoreRetry(() => getDoc(entityRef));
    if (!snap.exists()) return;

    const data = snap.data() as EntityRecord;
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (!data.staffMobiles.includes(cleanMobile)) {
      const updatedMobiles = [...data.staffMobiles, cleanMobile];
      await withFirestoreRetry(() => updateDoc(entityRef, {
        staffMobiles: updatedMobiles,
        updatedAt: new Date().toISOString()
      }));
    }

    // Also upgrade any registered user matching this mobile number
    const usersCol = collection(db, 'users');
    const allUsersSnap = await withFirestoreRetry(() => getDocs(usersCol)).catch(() => null);
    if (allUsersSnap) {
      allUsersSnap.forEach(async (uDoc) => {
        const uData = uDoc.data() as UserProfile;
        const uCleanMob = (uData.mobileNumber || '').replace(/\D/g, '');
        if (uCleanMob && uCleanMob === cleanMobile && uData.role === 'Public Member') {
          await withFirestoreRetry(() => updateDoc(doc(db, 'users', uDoc.id), { role: 'Staff' })).catch(() => {});
        }
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeStaffFromEntity(entityId: string, mobileNumber: string): Promise<void> {
  const path = `entities/${entityId}`;
  try {
    const entityRef = doc(db, 'entities', entityId);
    const snap = await withFirestoreRetry(() => getDoc(entityRef));
    if (!snap.exists()) return;

    const data = snap.data() as EntityRecord;
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const updatedMobiles = data.staffMobiles.filter(m => m !== cleanMobile);

    await withFirestoreRetry(() => updateDoc(entityRef, {
      staffMobiles: updatedMobiles,
      updatedAt: new Date().toISOString()
    }));

    // Check if this mobile is still staff in ANY other entity
    if (cleanMobile) {
      const remainingStaffEntities = await getStaffEntitiesForMobile(cleanMobile);
      // If no other entity has this staff mobile, check if the registered user is 'Staff' and demote to 'Public Member'
      if (remainingStaffEntities.length === 0) {
        const usersCol = collection(db, 'users');
        const allUsersSnap = await withFirestoreRetry(() => getDocs(usersCol)).catch(() => null);
        if (allUsersSnap) {
          for (const uDoc of allUsersSnap.docs) {
            const uData = uDoc.data() as UserProfile;
            const uCleanMob = (uData.mobileNumber || '').replace(/\D/g, '');
            if (uCleanMob === cleanMobile && uData.role === 'Staff') {
              await withFirestoreRetry(() => updateDoc(doc(db, 'users', uDoc.id), {
                role: 'Public Member',
                updatedAt: new Date().toISOString()
              })).catch(() => {});
            }
          }
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getStaffEntitiesForMobile(mobileNumber: string): Promise<EntityRecord[]> {
  const path = 'entities';
  try {
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (!cleanMobile) return [];
    const q = query(collection(db, 'entities'), where('staffMobiles', 'array-contains', cleanMobile));
    const snapshot = await withFirestoreRetry(() => getDocs(q));
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      console.warn('getStaffEntitiesForMobile transient error:', error);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Worker Firestore Helpers
function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned as T;
}

export async function addWorker(worker: Omit<WorkerRecord, 'id' | 'createdAt'>): Promise<WorkerRecord> {
  const path = 'workers';
  try {
    const newDocRef = doc(collection(db, 'workers'));

    const initialTransferLog: WorkerTransferLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      actionType: 'created',
      fromCompany: 'None',
      toCompany: worker.companyEntityName || worker.entityName || 'Not Assigned',
      fromRoom: 'None',
      toRoom: worker.roomEntityName || 'Not Assigned',
      transferredByUid: worker.registeredByUid,
      transferredByName: worker.registeredByName,
      transferredByRole: worker.registeredByRole || 'Registrar',
      notes: 'Initial worker registration'
    };

    // As requested: Do NOT store photo in database. Store empty photoURL; only faceEmbedding vector is saved to Firestore.
    const payload: WorkerRecord = sanitizePayload({
      ...worker,
      photoURL: '',
      id: newDocRef.id,
      transferLogs: worker.transferLogs && worker.transferLogs.length > 0 ? worker.transferLogs : [initialTransferLog],
      scanLogs: worker.scanLogs || [],
      comments: worker.comments || [],
      createdAt: new Date().toISOString()
    });
    await withFirestoreRetry(() => setDoc(newDocRef, payload));

    // Save to local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const filtered = cached.filter((w: any) => w.id !== payload.id);
      filtered.push(payload);
      localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(filtered));
    } catch (e) {
      // Local storage fallback
    }

    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function transferWorkerEntity(
  workerId: string,
  targetEntity: EntityRecord,
  residentType: 'Company' | 'Outliving' | 'Room',
  roomEntity: EntityRecord | null,
  currentUser: UserProfile,
  notes?: string
): Promise<WorkerRecord> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await withFirestoreRetry(() => getDoc(workerRef));
    if (!workerSnap.exists()) {
      throw new Error('Worker not found');
    }
    const currentWorker = workerSnap.data() as WorkerRecord;

    const isCompany = targetEntity.type === 'Company';
    const isRoom = targetEntity.type === 'Room';

    const newCompanyEntityId = isCompany ? targetEntity.id : (currentWorker.companyEntityId || '');
    const newCompanyEntityName = isCompany ? targetEntity.name : (currentWorker.companyEntityName || 'Not Assigned');

    const newRoomEntityId = isRoom 
      ? targetEntity.id 
      : (roomEntity ? roomEntity.id : (residentType === 'Company' && isCompany ? targetEntity.id : ''));
    const newRoomEntityName = isRoom 
      ? targetEntity.name 
      : (roomEntity ? roomEntity.name : (residentType === 'Company' && isCompany ? targetEntity.name : 'Not Assigned'));

    const newTransferLog: WorkerTransferLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      actionType: 'transferred',
      fromCompany: currentWorker.companyEntityName || currentWorker.entityName || 'None',
      toCompany: newCompanyEntityName,
      fromRoom: currentWorker.roomEntityName || 'None',
      toRoom: newRoomEntityName,
      transferredByUid: currentUser.uid,
      transferredByName: currentUser.displayName,
      transferredByRole: currentUser.role,
      notes: notes || `Transferred to ${targetEntity.name} (${targetEntity.type}) by ${currentUser.displayName}`
    };

    const existingTransferLogs = currentWorker.transferLogs || [];
    const updatedTransferLogs = [newTransferLog, ...existingTransferLogs];

    const updates: Partial<WorkerRecord> = sanitizePayload({
      entityId: targetEntity.id,
      entityName: targetEntity.name,
      companyEntityId: newCompanyEntityId,
      companyEntityName: newCompanyEntityName,
      residentType: residentType || currentWorker.residentType || 'Company',
      roomEntityId: newRoomEntityId,
      roomEntityName: newRoomEntityName,
      registeredByUid: currentUser.uid,
      registeredByName: currentUser.displayName,
      registeredByRole: currentUser.role,
      registeredByEmail: currentUser.email,
      transferLogs: updatedTransferLogs,
      updatedAt: new Date().toISOString()
    });

    await withFirestoreRetry(() => updateDoc(workerRef, updates));

    const updatedWorker: WorkerRecord = {
      ...currentWorker,
      ...updates
    };

    // Update local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const index = cached.findIndex((w: any) => w.id === workerId);
      if (index >= 0) {
        cached[index] = { ...cached[index], ...updates };
      } else {
        cached.push(updatedWorker);
      }
      localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(cached));
    } catch (e) {}

    // Synchronize server-side FAISS
    try {
      const allWorkers = await getAllWorkers();
      fetch('/api/face/faiss-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: allWorkers })
      }).catch(() => {});
    } catch (e) {}

    return updatedWorker;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function addWorkerComment(
  workerId: string,
  content: string,
  currentUser: UserProfile
): Promise<WorkerComment> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await withFirestoreRetry(() => getDoc(workerRef));
    if (!workerSnap.exists()) {
      throw new Error('Worker record not found');
    }
    const worker = workerSnap.data() as WorkerRecord;

    const newComment: WorkerComment = {
      id: 'wc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      authorUid: currentUser.uid,
      authorName: currentUser.displayName,
      authorPhoto: currentUser.photoURL || '',
      authorRole: currentUser.role,
      content: content.trim(),
      createdAt: new Date().toISOString()
    };

    const existingComments = worker.comments || [];
    const updatedComments = [newComment, ...existingComments];

    await withFirestoreRetry(() => updateDoc(workerRef, {
      comments: updatedComments,
      updatedAt: new Date().toISOString()
    }));

    // Update local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const idx = cached.findIndex((w: any) => w.id === workerId);
      if (idx >= 0) {
        cached[idx].comments = updatedComments;
        localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(cached));
      }
    } catch (e) {}

    return newComment;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteWorkerComment(
  workerId: string,
  commentId: string
): Promise<void> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await withFirestoreRetry(() => getDoc(workerRef));
    if (!workerSnap.exists()) return;

    const worker = workerSnap.data() as WorkerRecord;
    const updatedComments = (worker.comments || []).filter(c => c.id !== commentId);

    await withFirestoreRetry(() => updateDoc(workerRef, {
      comments: updatedComments,
      updatedAt: new Date().toISOString()
    }));

    // Update local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const idx = cached.findIndex((w: any) => w.id === workerId);
      if (idx >= 0) {
        cached[idx].comments = updatedComments;
        localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(cached));
      }
    } catch (e) {}
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logWorkerScan(
  workerId: string,
  scanData: {
    scannedByUid: string;
    scannedByName: string;
    scannedByRole: string;
    scannedByMobile?: string;
    method: 'camera' | 'upload';
    similarityScore: number;
    confidence: number;
  }
): Promise<void> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await withFirestoreRetry(() => getDoc(workerRef));
    if (!workerSnap.exists()) return;

    const worker = workerSnap.data() as WorkerRecord;

    const scanLog: WorkerScanLog = {
      id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      scannedByUid: scanData.scannedByUid,
      scannedByName: scanData.scannedByName,
      scannedByRole: scanData.scannedByRole,
      scannedByMobile: scanData.scannedByMobile || '',
      method: scanData.method,
      similarityScore: scanData.similarityScore,
      confidence: scanData.confidence
    };

    const existingScanLogs = worker.scanLogs || [];
    const updatedScanLogs = [scanLog, ...existingScanLogs].slice(0, 50);

    await withFirestoreRetry(() => updateDoc(workerRef, {
      scanLogs: updatedScanLogs,
      updatedAt: new Date().toISOString()
    }));

    // Update local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const idx = cached.findIndex((w: any) => w.id === workerId);
      if (idx >= 0) {
        cached[idx].scanLogs = updatedScanLogs;
        localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(cached));
      }
    } catch (e) {}
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateWorker(workerId: string, updates: Partial<WorkerRecord>): Promise<void> {
  const path = `workers/${workerId}`;
  try {
    const docRef = doc(db, 'workers', workerId);

    // As requested: Do NOT store photo in database
    const cleanedUpdates = sanitizePayload({
      ...updates,
      photoURL: '',
      updatedAt: new Date().toISOString()
    });
    await withFirestoreRetry(() => updateDoc(docRef, cleanedUpdates));

    // Update local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const index = cached.findIndex((w: any) => w.id === workerId);
      if (index >= 0) {
        cached[index] = { ...cached[index], ...cleanedUpdates };
        localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(cached));
      }
    } catch (e) {
      // Local storage fallback
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function getWorkersForEntity(entityId: string): Promise<WorkerRecord[]> {
  const path = 'workers';
  try {
    const all = await getAllWorkers();
    return all.filter(w => 
      w.entityId === entityId || 
      w.companyEntityId === entityId || 
      w.roomEntityId === entityId
    );
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getAllWorkers(): Promise<WorkerRecord[]> {
  const path = 'workers';
  try {
    const snapshot = await withFirestoreRetry(() => getDocs(collection(db, 'workers')));
    const workers: WorkerRecord[] = [];
    snapshot.forEach(d => {
      const data = d.data();
      workers.push({ id: d.id, ...data } as WorkerRecord);
    });

    // Save accurate Firestore state to cache (including empty array when all workers are deleted)
    try {
      localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(workers));
    } catch (e) {}

    return workers;
  } catch (error) {
    console.warn('getAllWorkers transient/fetch error, using cached data if available:', error);
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      if (Array.isArray(cached)) {
        return cached;
      }
    } catch (e) {}
    if (!isTransientFirestoreError(error)) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    return [];
  }
}

export async function deleteWorker(workerId: string, currentUser: UserProfile): Promise<void> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await withFirestoreRetry(() => getDoc(workerRef));

    if (workerSnap.exists()) {
      const worker = workerSnap.data() as WorkerRecord;

      const isFounderOrAdmin = ['Founder', 'Super Admin', 'Committee', 'Room Owner', 'Company Owner'].includes(currentUser.role) || 
        currentUser.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
      const isRegistrar = worker.registeredByUid === currentUser.uid;

      // Check entity owner/staff status
      let isOwnerOrStaffOfEntity = false;
      const allEnts = await getAllEntities();
      const relatedEntityIds = [worker.entityId, worker.companyEntityId, worker.roomEntityId].filter(Boolean);
      const cleanMobile = (currentUser.mobileNumber || '').replace(/\D/g, '');

      for (const ent of allEnts) {
        if (relatedEntityIds.includes(ent.id)) {
          if (ent.ownerUid === currentUser.uid || (cleanMobile && ent.staffMobiles?.includes(cleanMobile))) {
            isOwnerOrStaffOfEntity = true;
            break;
          }
        }
      }

      if (!isFounderOrAdmin && !isRegistrar && !isOwnerOrStaffOfEntity) {
        throw new Error('Unauthorized to delete this worker registration.');
      }

      await withFirestoreRetry(() => deleteDoc(workerRef));
    }

    // Always cleanse local cache
    try {
      const cached = JSON.parse(localStorage.getItem('findworkers_cached_workers_v2') || '[]');
      const updated = cached.filter((w: any) => w.id !== workerId);
      localStorage.setItem('findworkers_cached_workers_v2', JSON.stringify(updated));
    } catch (e) {}

    // Synchronize server-side FAISS index
    try {
      const remainingWorkers = await getAllWorkers();
      fetch('/api/face/faiss-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: remainingWorkers })
      }).catch(() => {});
    } catch (e) {}
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// Comment Firestore Helpers (Public Members)
export async function addComment(content: string, user: UserProfile): Promise<CommentRecord> {
  const path = 'comments';
  try {
    const newDocRef = doc(collection(db, 'comments'));
    const payload: CommentRecord = {
      id: newDocRef.id,
      authorUid: user.uid,
      authorName: user.displayName,
      authorPhoto: user.photoURL,
      content,
      createdAt: new Date().toISOString()
    };
    await withFirestoreRetry(() => setDoc(newDocRef, payload));
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function getComments(): Promise<CommentRecord[]> {
  const path = 'comments';
  try {
    const snapshot = await withFirestoreRetry(() => getDocs(collection(db, 'comments')));
    const comments: CommentRecord[] = [];
    snapshot.forEach(d => comments.push(d.data() as CommentRecord));
    // Sort by createdAt descending
    return comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    if (isTransientFirestoreError(error)) {
      console.warn('getComments transient error:', error);
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function updateComment(commentId: string, content: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    const docRef = doc(db, 'comments', commentId);
    await withFirestoreRetry(() => updateDoc(docRef, {
      content,
      updatedAt: new Date().toISOString()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    const docRef = doc(db, 'comments', commentId);
    await withFirestoreRetry(() => deleteDoc(docRef));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
