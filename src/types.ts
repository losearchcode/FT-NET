export type MessageType = 'TEXT' | 'SYS_MSG';
export type MessageVersion = 'v1' | 'v2';
export type MessageSecurityMode = 'encrypted' | 'plain';

export interface EncryptedTextPayloadV2 {
  iv: string;
  ciphertext: string;
}

export interface EncryptedFileMetadataPayloadV2 {
  version: 'v2';
  iv: string;
  ciphertext: string;
}

export interface FileMetadataSecretV2 {
  fileName: string;
}

export interface BaseMessage {
  type: MessageType;
  sender: 'me' | 'remote' | 'system';
  timestamp: number;
  senderId?: string;
  senderName?: string;
}

export interface TextMessage extends BaseMessage {
  type: 'TEXT';
  content: string;
  isEncrypted?: boolean;
  version?: MessageVersion;
  securityMode?: MessageSecurityMode;
  algorithm?: 'AES-CBC' | 'AES-GCM';
  payload?: EncryptedTextPayloadV2;
}

export interface SysMessage extends BaseMessage {
  type: 'SYS_MSG';
  content: string;
}

export type P2PMessage = TextMessage | SysMessage;

export interface SerializedFileMetadata {
  id: string;
  fileName?: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
  senderId: string;
  encrypted: boolean;
  securityMode?: MessageSecurityMode;
  encryptionVersion?: MessageVersion;
  algorithm?: 'AES-CBC' | 'AES-GCM';
  encryptedMetadata?: EncryptedFileMetadataPayloadV2;
}

export interface FileMetadata extends SerializedFileMetadata {
  fileName: string;
  metadataState?: 'plain' | 'decrypted' | 'locked';
}
