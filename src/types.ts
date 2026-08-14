export const FOUNDER_EMAIL = 'sadath2006@gmail.com';

export type UserRole = 
  | 'Founder' 
  | 'Super Admin' 
  | 'Committee' 
  | 'Room Owner' 
  | 'Company Owner' 
  | 'Staff' 
  | 'Public Member';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  mobileNumber: string;
  role: UserRole;
  isApproved?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EntityRecord {
  id: string;
  type: 'Company' | 'Room';
  name: string;
  registrationNumber?: string;
  address?: string;
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  staffMobiles: string[]; // List of mobile numbers assigned as staff
  hasUpdatedDetails?: boolean; // True once owner has updated entity details
  createdAt: string;
  updatedAt: string;
}

export interface WorkerTransferLog {
  id: string;
  timestamp: string;
  actionType: 'created' | 'transferred' | 'room_updated' | 'company_updated';
  fromCompany?: string;
  toCompany?: string;
  fromRoom?: string;
  toRoom?: string;
  transferredByUid: string;
  transferredByName: string;
  transferredByRole: string;
  notes?: string;
}

export interface WorkerScanLog {
  id: string;
  timestamp: string;
  scannedByUid: string;
  scannedByName: string;
  scannedByRole: string;
  scannedByMobile?: string;
  method: 'camera' | 'upload';
  similarityScore: number;
  confidence: number;
}

export interface WorkerComment {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  authorRole?: string;
  content: string;
  createdAt: string;
}

export interface WorkerRecord {
  id: string;
  entityId: string;
  entityName: string;
  name: string;
  photoURL?: string;
  faceEmbedding?: number[]; // Vector embeddings for face matching
  faceEmbeddingVersion?: string; // Model version tag e.g. 'facenet_v2'
  companyEntityId?: string;
  companyEntityName?: string; // "Company Name" or "Not Assigned"
  residentType?: 'Company' | 'Outliving' | 'Room';
  roomEntityId?: string;
  roomEntityName?: string; // "Room Name" or "Not Assigned"
  mobile: string;
  aadhar?: string;
  skill?: string;
  registeredByUid: string;
  registeredByName: string;
  registeredByRole?: string;
  registeredByEmail?: string;
  transferLogs?: WorkerTransferLog[];
  scanLogs?: WorkerScanLog[];
  comments?: WorkerComment[];
  createdAt: string;
  updatedAt?: string;
}

export interface CommentRecord {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export type AppScreen = 'splash' | 'login' | 'mobile_update' | 'welcome';
