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
}

export interface SysMessage extends BaseMessage {
  type: 'SYS_MSG';
  content: string;
}

export type P2PMessage = TextMessage | SysMessage;

// Centralized Room File Metadata
export interface FileMetadata {
  id: string;         // Unique server physical ID
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: number;
  senderId: string;
}
