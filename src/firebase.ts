import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut, 
  User 
} from 'firebase/auth';
import { 
  getFirestore, 
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
  FOUNDER_EMAIL 
} from './types';
import { compressImage } from './utils/imageCompressor';

const app = initializeApp(firebaseConfig);

// Initialize Auth with localStorage-based persistence to completely eliminate
// the fragile IndexedDB "Database is closing / hidden" errors when mobile PWAs background or open popups.
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
    });
  } catch (_e) {
    return getAuth(app);
  }
})();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with memoryLocalCache and auto-detect long polling
// This completely prevents 'Database connection is closing' / IndexedDB lock issues in PWA standalone mode
export const db = firebaseConfig.firestoreDatabaseId 
  ? initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    }, firebaseConfig.firestoreDatabaseId)
  : initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    });

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auth Helpers
export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
      console.log('Popup blocked or cancelled, initiating redirect flow...');
      await signInWithRedirect(auth, googleProvider);
      // Wait indefinitely while page redirects
      return new Promise(() => {});
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
  } catch (err) {
    console.warn('getRedirectResult check:', err);
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

// User Profile Firestore Helpers
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
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
          const staffEntities = await getStaffEntitiesForMobile(cleanMobile);
          if (staffEntities.length > 0) {
            data.role = 'Staff';
            updates.role = 'Staff';
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await updateDoc(userDocRef, updates);
      }
      return data;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveUserProfile(uid: string, profileData: Partial<UserProfile>): Promise<UserProfile> {
  const path = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);

    const newCleanMobile = (profileData.mobileNumber || '').replace(/\D/g, '');
    const oldCleanMobile = docSnap.exists() ? (docSnap.data()?.mobileNumber || '').replace(/\D/g, '') : '';

    // 1. Mobile Number Uniqueness Check across users
    if (newCleanMobile) {
      const usersCol = collection(db, 'users');
      const allUsersSnap = await getDocs(usersCol);
      let duplicateUser: UserProfile | null = null;

      allUsersSnap.forEach((uDoc) => {
        if (uDoc.id !== uid) {
          const uData = uDoc.data() as UserProfile;
          const uClean = (uData.mobileNumber || '').replace(/\D/g, '');
          if (uClean && uClean === newCleanMobile) {
            duplicateUser = uData;
          }
        }
      });

      if (duplicateUser) {
        const dupName = (duplicateUser as UserProfile).displayName || (duplicateUser as UserProfile).email || 'another user';
        throw new Error(`Mobile number ${newCleanMobile} is already registered by ${dupName}. Please use a different mobile number.`);
      }
    }

    // 2. Migrate staff mobile numbers in entities if user changed their mobile number
    if (oldCleanMobile && newCleanMobile && oldCleanMobile !== newCleanMobile) {
      const staffEntities = await getStaffEntitiesForMobile(oldCleanMobile);
      for (const ent of staffEntities) {
        const updatedStaffMobiles = (ent.staffMobiles || []).map(m => m === oldCleanMobile ? newCleanMobile : m);
        const entDocRef = doc(db, 'entities', ent.id);
        await updateDoc(entDocRef, {
          staffMobiles: updatedStaffMobiles,
          updatedAt: new Date().toISOString()
        });
      }
    }

    const isFounder = profileData.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
    let defaultRole: UserRole = isFounder ? 'Founder' : (profileData.role || (docSnap.exists() ? docSnap.data()?.role : 'Public Member') || 'Public Member');

    // Auto-check if mobile is in staffMobiles
    if (defaultRole === 'Public Member' && newCleanMobile) {
      const staffEntities = await getStaffEntitiesForMobile(newCleanMobile);
      if (staffEntities.length > 0) {
        defaultRole = 'Staff';
      }
    }

    const payload: UserProfile = {
      uid,
      displayName: profileData.displayName || (docSnap.exists() ? docSnap.data()?.displayName : 'User'),
      email: profileData.email || (docSnap.exists() ? docSnap.data()?.email : ''),
      photoURL: profileData.photoURL || (docSnap.exists() ? docSnap.data()?.photoURL : ''),
      mobileNumber: newCleanMobile,
      role: defaultRole,
      isApproved: isFounder ? true : (docSnap.exists() ? docSnap.data()?.isApproved || false : false),
      createdAt: docSnap.exists() ? docSnap.data()?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!docSnap.exists()) {
      await setDoc(userDocRef, payload);
    } else {
      await updateDoc(userDocRef, {
        displayName: payload.displayName,
        email: payload.email,
        photoURL: payload.photoURL,
        mobileNumber: payload.mobileNumber,
        role: payload.role,
        updatedAt: payload.updatedAt
      });
    }
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
    const snapshot = await getDocs(usersCol);
    const users: UserProfile[] = [];
    snapshot.forEach(docSnap => {
      users.push(docSnap.data() as UserProfile);
    });
    return users;
  } catch (error) {
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
    await updateDoc(userDocRef, {
      role: newRole,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function approveUser(targetUid: string): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    const userDocRef = doc(db, 'users', targetUid);
    await updateDoc(userDocRef, {
      isApproved: true,
      updatedAt: new Date().toISOString()
    });
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
    await deleteDoc(userDocRef);
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
    const existingSnap = await getDoc(entityRef);

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
      createdAt: existingSnap.exists() ? existingSnap.data()?.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(entityRef, payload);
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
    const snapshot = await getDocs(q);
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getAllEntities(): Promise<EntityRecord[]> {
  const path = 'entities';
  try {
    const snapshot = await getDocs(collection(db, 'entities'));
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function addStaffToEntity(entityId: string, mobileNumber: string): Promise<void> {
  const path = `entities/${entityId}`;
  try {
    const entityRef = doc(db, 'entities', entityId);
    const snap = await getDoc(entityRef);
    if (!snap.exists()) return;

    const data = snap.data() as EntityRecord;
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    if (!data.staffMobiles.includes(cleanMobile)) {
      const updatedMobiles = [...data.staffMobiles, cleanMobile];
      await updateDoc(entityRef, {
        staffMobiles: updatedMobiles,
        updatedAt: new Date().toISOString()
      });
    }

    // Also upgrade any registered user matching this mobile number
    const usersCol = collection(db, 'users');
    const allUsersSnap = await getDocs(usersCol);
    allUsersSnap.forEach(async (uDoc) => {
      const uData = uDoc.data() as UserProfile;
      const uCleanMob = (uData.mobileNumber || '').replace(/\D/g, '');
      if (uCleanMob && uCleanMob === cleanMobile && uData.role === 'Public Member') {
        await updateDoc(doc(db, 'users', uDoc.id), { role: 'Staff' });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeStaffFromEntity(entityId: string, mobileNumber: string): Promise<void> {
  const path = `entities/${entityId}`;
  try {
    const entityRef = doc(db, 'entities', entityId);
    const snap = await getDoc(entityRef);
    if (!snap.exists()) return;

    const data = snap.data() as EntityRecord;
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const updatedMobiles = data.staffMobiles.filter(m => m !== cleanMobile);

    await updateDoc(entityRef, {
      staffMobiles: updatedMobiles,
      updatedAt: new Date().toISOString()
    });
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
    const snapshot = await getDocs(q);
    const entities: EntityRecord[] = [];
    snapshot.forEach(d => entities.push(d.data() as EntityRecord));
    return entities;
  } catch (error) {
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

    // As requested: Do NOT store photo in database. Store empty photoURL; only faceEmbedding vector is saved to Firestore.
    const payload: WorkerRecord = sanitizePayload({
      ...worker,
      photoURL: '',
      id: newDocRef.id,
      createdAt: new Date().toISOString()
    });
    await setDoc(newDocRef, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
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
    await updateDoc(docRef, cleanedUpdates);
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
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getAllWorkers(): Promise<WorkerRecord[]> {
  const path = 'workers';
  try {
    const snapshot = await getDocs(collection(db, 'workers'));
    const workers: WorkerRecord[] = [];
    snapshot.forEach(d => workers.push(d.data() as WorkerRecord));
    return workers;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function deleteWorker(workerId: string, currentUser: UserProfile): Promise<void> {
  const path = `workers/${workerId}`;
  try {
    const workerRef = doc(db, 'workers', workerId);
    const workerSnap = await getDoc(workerRef);
    if (!workerSnap.exists()) return;

    const worker = workerSnap.data() as WorkerRecord;

    const isFounderOrAdmin = ['Founder', 'Super Admin'].includes(currentUser.role) || 
      currentUser.email?.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
    const isRegistrar = worker.registeredByUid === currentUser.uid;

    // Check entity owner status
    let isOwnerOfEntity = false;
    const allEnts = await getAllEntities();
    const relatedEntityIds = [worker.entityId, worker.companyEntityId, worker.roomEntityId].filter(Boolean);

    for (const ent of allEnts) {
      if (relatedEntityIds.includes(ent.id) && ent.ownerUid === currentUser.uid) {
        isOwnerOfEntity = true;
        break;
      }
    }

    if (!isFounderOrAdmin && !isRegistrar && !isOwnerOfEntity) {
      throw new Error('Unauthorized to delete this worker registration.');
    }

    await deleteDoc(workerRef);
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
    await setDoc(newDocRef, payload);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function getComments(): Promise<CommentRecord[]> {
  const path = 'comments';
  try {
    const snapshot = await getDocs(collection(db, 'comments'));
    const comments: CommentRecord[] = [];
    snapshot.forEach(d => comments.push(d.data() as CommentRecord));
    // Sort by createdAt descending
    return comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function updateComment(commentId: string, content: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    const docRef = doc(db, 'comments', commentId);
    await updateDoc(docRef, {
      content,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  const path = `comments/${commentId}`;
  try {
    const docRef = doc(db, 'comments', commentId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
