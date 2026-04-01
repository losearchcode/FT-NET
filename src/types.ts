export type MessageType = 'TEXT' | 'SYS_MSG';

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
}

export interface SysMessage extends BaseMessage {
  type: 'SYS_MSG';
  content: string;
}

export type P2PMessage = TextMessage | SysMessage;

export interface FileMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
  senderId: string;
  encrypted: boolean;
}
