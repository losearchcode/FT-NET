import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import EncryptWorker from '../workers/encryptWorker?worker';
import EncryptWorkerV2 from '../workers/encryptWorkerV2?worker';
import type {
    EncryptedFileMetadataPayloadV2,
    FileMetadata,
    SerializedFileMetadata,
    SysMessage,
    TextMessage,
    RoomCapabilities,
} from '../types';
import {
    clearKeyCache,
    decryptText,
    deriveEncryptionKey,
    encryptText,
    hashRoomPassword,
} from '../utils/cryptoUtils';
import {
    clearMessageKeyCacheV2,
    decryptTextV2,
    encryptTextV2,
    encryptSenderNameV2,
    decryptSenderNameV2,
    isMessageCryptoV2Available,
} from '../utils/messageCryptoV2';
import { isFileCryptoV2Available } from '../utils/fileCryptoV2';
import {
    clearMetadataKeyCacheV2,
    decryptFileMetadataV2,
    encryptFileMetadataV2,
    isMetadataCryptoV2Available,
} from '../utils/metadataCryptoV2';

type RoomMessage = TextMessage | SysMessage;
type RoomHistoryPayload = {
    messages: RoomMessage[];
    files: SerializedFileMetadata[];
};

type EncryptWorkerResponse =
    | { type: 'HEADER'; chunk: Uint8Array }
    | { type: 'PROCESSED'; chunk?: Uint8Array }
    | { type: 'FINAL'; chunk?: Uint8Array }
    | { type: 'ERROR'; error: string };

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_RETRIES = 3;
const V1_ENCRYPTION_SALT = 'FT-NET-SECURE-SALT-2024';
const UNKNOWN_FILE_NAME = 'unnamed-file';
const LOCKED_FILE_NAME = '[encrypted file name unavailable]';

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : 'Unknown error'
);

const normalizeFileName = (value: unknown): string => (
    typeof value === 'string' && value.trim() ? value.trim() : UNKNOWN_FILE_NAME
);

const hydrateIncomingFile = async (
    file: SerializedFileMetadata,
    roomPasswordValue: string | null,
): Promise<FileMetadata> => {
    if (file.encryptedMetadata?.version === 'v2') {
        if (!roomPasswordValue || !isMetadataCryptoV2Available()) {
            return {
                ...file,
                fileName: LOCKED_FILE_NAME,
                metadataState: 'locked',
            };
        }

        try {
            const decryptedMetadata = await decryptFileMetadataV2(
                file.encryptedMetadata,
                roomPasswordValue,
            );

            return {
                ...file,
                fileName: decryptedMetadata.fileName,
                metadataState: 'decrypted',
            };
        } catch (error) {
            console.error('Failed to decrypt file metadata:', error);
            return {
                ...file,
                fileName: LOCKED_FILE_NAME,
                metadataState: 'locked',
            };
        }
    }

    return {
        ...file,
        fileName: normalizeFileName(file.fileName),
        metadataState: 'plain',
    };
};

const hydrateIncomingFiles = (
    files: SerializedFileMetadata[],
    roomPasswordValue: string | null,
): Promise<FileMetadata[]> => Promise.all(
    files.map((file) => hydrateIncomingFile(file, roomPasswordValue)),
);

const generateShortId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const generateResumeId = async (file: File): Promise<string | null> => {
    const rawString = `${file.name}-${file.size}-${file.lastModified}`;
    if (globalThis.crypto?.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(rawString);
            const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(hash))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 32);
        } catch {
            // fallback below
        }
    }
    
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        const char = rawString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16);
    return 'fb-' + hex.padStart(8, '0') + '-' + file.size.toString(16);
};

export const usePeer = () => {
    const [peerId, setPeerId] = useState(() => {
        const savedId = localStorage.getItem('ftnet_peer_id');
        if (savedId) {
            return savedId;
        }
        const newId = generateShortId();
        localStorage.setItem('ftnet_peer_id', newId);
        return newId;
    });
    const [roomPassword, setRoomPassword] = useState<string | null>(null);
    const [hashedRoomId, setHashedRoomId] = useState<string | null>(null);
    const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [onlineCount, setOnlineCount] = useState(0);
    const [roomCapabilities, setRoomCapabilities] = useState<RoomCapabilities>({
        messageCryptoV2Enabled: false,
        fileCryptoV2Enabled: false,
    });
    const [uploadProgress, setUploadProgress] = useState<{
        progress: number;
        active: boolean;
        stage: 'encrypting' | 'streaming' | 'idle' | 'error';
        error?: string;
    }>({ progress: 0, active: false, stage: 'idle' });

    const socketRef = useRef<Socket | null>(null);
    const roomPasswordRef = useRef<string | null>(null);
    const encryptionKeyRef = useRef<string | null>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingRejectRef = useRef<((reason?: Error) => void) | null>(null);
    const uploadSessionRef = useRef<{ roomId: string; uploadId: string } | null>(null);

    useEffect(() => {
        roomPasswordRef.current = roomPassword;
    }, [roomPassword]);

    useEffect(() => {
        encryptionKeyRef.current = encryptionKey;
    }, [encryptionKey]);

    const decryptIncomingMessage = async (
        message: RoomMessage,
        roomPasswordValue: string | null,
        legacyKey: string | null,
    ): Promise<RoomMessage> => {
        if (message.type === 'TEXT' && message.isEncrypted) {
            try {
                if (message.version === 'v2') {
                    if (!message.payload || !roomPasswordValue || !isMessageCryptoV2Available()) {
                        return {
                            ...message,
                            content: '[当前环境无法解密 v2 消息]',
                            isEncrypted: false,
                        };
                    }

                    const decryptedContent = await decryptTextV2(message.payload, roomPasswordValue);
                    let decryptedSenderName = message.senderName;
                    if (message.payload.encryptedSenderName && message.payload.senderNameIv) {
                        try {
                            decryptedSenderName = await decryptSenderNameV2(
                                message.payload.encryptedSenderName,
                                message.payload.senderNameIv,
                                roomPasswordValue,
                            );
                        } catch {
                            // 兼容老消息或解密失败，回退明文 senderName
                        }
                    }
                    return {
                        ...message,
                        content: decryptedContent,
                        senderName: decryptedSenderName,
                        isEncrypted: false,
                    };
                }

                if (!legacyKey) {
                    return {
                        ...message,
                        content: '[当前环境无法解密历史消息]',
                        isEncrypted: false,
                    };
                }

                return {
                    ...message,
                    content: decryptText(message.content, legacyKey),
                    isEncrypted: false,
                };
            } catch (error) {
                console.error('Failed to decrypt message:', error);
                const isIntegrityError = (error instanceof DOMException && error.name === 'OperationError')
                    || (error instanceof Error && error.message.includes('integrity'));
                return {
                    ...message,
                    content: isIntegrityError
                        ? '[⚠️ 消息完整性校验失败，数据可能已损坏]'
                        : '[Unable to decrypt message]',
                    isEncrypted: false,
                };
            }
        }

        return message;
    };

    const abortUploadSession = async (session: { roomId: string; uploadId: string }) => {
        try {
            await fetch(`/upload/abort/${session.roomId}/${session.uploadId}`, {
                method: 'POST',
            });
        } catch (error) {
            console.warn('Failed to abort upload session:', error);
        }
    };

    const abortActiveUpload = (reason: string = 'Upload aborted') => {
        if (pendingRejectRef.current) {
            const rejectPending = pendingRejectRef.current;
            pendingRejectRef.current = null;
            rejectPending(new Error(reason));
        }

        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        if (xhrRef.current) {
            xhrRef.current.abort();
            xhrRef.current = null;
        }

        const session = uploadSessionRef.current;
        uploadSessionRef.current = null;
        if (session) {
            void abortUploadSession(session);
        }

        setUploadProgress({ progress: 0, active: false, stage: 'idle' });
    };

    const sendWorkerMessage = (
        worker: Worker,
        payload: unknown,
        transfer: Transferable[] = [],
    ): Promise<EncryptWorkerResponse> => new Promise((resolve, reject) => {
        const cleanup = () => {
            pendingRejectRef.current = null;
            worker.onmessage = null;
            worker.onerror = null;
        };

        pendingRejectRef.current = (error = new Error('Upload aborted')) => {
            cleanup();
            reject(error);
        };

        worker.onmessage = (event: MessageEvent<EncryptWorkerResponse>) => {
            cleanup();
            if (event.data.type === 'ERROR') {
                reject(new Error(event.data.error));
                return;
            }
            resolve(event.data);
        };

        worker.onerror = (event: ErrorEvent) => {
            cleanup();
            reject(new Error(event.message || 'Encrypt worker failed'));
        };

        worker.postMessage(payload, transfer);
    });

    useEffect(() => {
        const socket = io({ autoConnect: false });
        socketRef.current = socket;

        socket.on('room_history', (data: RoomHistoryPayload) => {
            const currentKey = encryptionKeyRef.current;
            const currentPassword = roomPasswordRef.current;

            void Promise.all(
                data.messages.map((message) => decryptIncomingMessage(message, currentPassword, currentKey)),
            ).then((decryptedMessages) => {
                setMessages(decryptedMessages);
            });

            void hydrateIncomingFiles(data.files, currentPassword).then((nextFiles) => {
                setFiles(nextFiles);
            });
        });

        socket.on('sys_message', (message: SysMessage) => {
            setMessages((prev) => [...prev, { ...message, sender: 'system' }]);
        });

        socket.on('new_message', (message: TextMessage) => {
            const currentKey = encryptionKeyRef.current;
            const currentPassword = roomPasswordRef.current;

            void decryptIncomingMessage(message, currentPassword, currentKey).then((nextMessage) => {
                setMessages((prev) => [...prev, { ...nextMessage, sender: 'remote' }]);
            });
        });

        socket.on('file-added', (file: SerializedFileMetadata) => {
            const currentPassword = roomPasswordRef.current;
            void hydrateIncomingFile(file, currentPassword).then((nextFile) => {
                setFiles((prev) => [...prev, nextFile]);
            });
        });

        socket.on('files-updated', (updatedFiles: SerializedFileMetadata[]) => {
            const currentPassword = roomPasswordRef.current;
            void hydrateIncomingFiles(updatedFiles, currentPassword).then((nextFiles) => {
                setFiles(nextFiles);
            });
        });

        socket.on('user_count', (count: number) => {
            setOnlineCount(count);
        });

        socket.on('room_capabilities', (capabilities: RoomCapabilities) => {
            setRoomCapabilities(capabilities);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const deleteFiles = async (fileIds: string[]) => {
        if (!roomPassword) {
            return;
        }

        const targetRoomId = hashedRoomId ?? hashRoomPassword(roomPassword);
        try {
            await fetch(`/delete-files/${targetRoomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileIds, senderId: peerId }),
            });
        } catch (error) {
            console.error('Failed to delete files:', error);
        }
    };

    const refreshPeerId = () => {
        const newId = generateShortId();
        localStorage.setItem('ftnet_peer_id', newId);
        setPeerId(newId);
    };

    const joinRoom = async (password: string) => {
        if (!socketRef.current) {
            return;
        }

        try {
            const nextEncryptionKey = deriveEncryptionKey(password);
            const nextHashedRoomId = hashRoomPassword(password);

            roomPasswordRef.current = password;
            encryptionKeyRef.current = nextEncryptionKey;
            setEncryptionKey(nextEncryptionKey);
            setHashedRoomId(nextHashedRoomId);
            setRoomPassword(password);
            setMessages([]);
            setFiles([]);
            setOnlineCount(0);
            setRoomCapabilities({
                messageCryptoV2Enabled: false,
                fileCryptoV2Enabled: false,
            });

            socketRef.current.connect();
            socketRef.current.emit('join_room', {
                roomId: nextHashedRoomId,
                senderId: peerId,
                capabilities: {
                    webCryptoV2: isMessageCryptoV2Available(),
                },
            });

            if (isMessageCryptoV2Available()) {
                void import('../utils/messageCryptoV2').then(m => m.encryptTextV2('', password).catch(() => {}));
                void import('../utils/fileCryptoV2').then(m => m.deriveFileKeyV2(password).catch(() => {}));
                void import('../utils/metadataCryptoV2').then(m => m.deriveMetadataKeyV2(password).catch(() => {}));
            }
        } catch (error) {
            console.error('E2EE initialization failed:', error);
            alert('Failed to initialize the encrypted room.');
        }
    };

    const leaveRoom = () => {
        if (!socketRef.current) {
            return;
        }

        abortActiveUpload();
        clearKeyCache(roomPassword ?? undefined);
        clearMessageKeyCacheV2(roomPassword ?? undefined);
        clearMetadataKeyCacheV2(roomPassword ?? undefined);
        socketRef.current.disconnect();
        roomPasswordRef.current = null;
        encryptionKeyRef.current = null;

        setRoomPassword(null);
        setHashedRoomId(null);
        setEncryptionKey(null);
        setMessages([]);
        setFiles([]);
        setOnlineCount(0);
        setRoomCapabilities({
            messageCryptoV2Enabled: false,
            fileCryptoV2Enabled: false,
        });
    };

    const sendText = async (text: string) => {
        if (!socketRef.current || !roomPassword || !encryptionKey) {
            return;
        }

        const useV2 = roomCapabilities.messageCryptoV2Enabled && isMessageCryptoV2Available();

        let message: TextMessage;
        if (useV2) {
            const encryptedName = await encryptSenderNameV2(peerId, roomPassword);
            message = {
                type: 'TEXT',
                content: '',
                sender: 'me',
                senderName: peerId,
                timestamp: Date.now(),
                isEncrypted: true,
                version: 'v2',
                securityMode: 'encrypted',
                algorithm: 'AES-GCM',
                payload: {
                    ...(await encryptTextV2(text, roomPassword)),
                    encryptedSenderName: encryptedName.encryptedSenderName,
                    senderNameIv: encryptedName.senderNameIv,
                },
            };
        } else {
            message = {
                type: 'TEXT',
                content: encryptText(text, encryptionKey),
                sender: 'me',
                senderName: peerId,
                timestamp: Date.now(),
                isEncrypted: true,
                version: 'v1',
                securityMode: 'encrypted',
                algorithm: 'AES-CBC',
            };
        }

        setMessages((prev) => [...prev, { ...message, content: text, isEncrypted: false }]);
        socketRef.current.emit('send_message', { ...message, sender: 'remote' });
    };

    const createUploadSession = async (
        roomId: string,
        file: File,
        encrypted: boolean,
        metadata: {
            fileName?: string;
            encryptedMetadata?: EncryptedFileMetadataPayloadV2;
        },
        encryptionVersion?: 'v1' | 'v2',
        algorithm?: 'AES-CBC' | 'AES-GCM',
        resumeId?: string | null,
    ): Promise<{ uploadId: string; nextChunkIndex: number }> => {
        const response = await fetch(`/upload/init/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: metadata.fileName,
                encryptedMetadata: metadata.encryptedMetadata,
                fileSize: file.size,
                fileType: file.type,
                senderId: peerId,
                encrypted,
                securityMode: encrypted ? 'encrypted' : 'plain',
                encryptionVersion,
                algorithm,
                resumeId,
            }),
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        return {
            uploadId: data.uploadId as string,
            nextChunkIndex: (data.nextChunkIndex as number) || 0,
        };
    };

    const completeUploadSession = async (roomId: string, uploadId: string) => {
        const response = await fetch(`/upload/complete/${roomId}/${uploadId}`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
    };

    const uploadChunk = (
        roomId: string,
        uploadId: string,
        chunkIndex: number,
        chunk: Uint8Array,
        uploadedPlainBytes: number,
        currentPlainBytes: number,
        totalPlainBytes: number,
    ): Promise<void> => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open('POST', `/upload/chunk/${roomId}/${uploadId}?index=${chunkIndex}`, true);
        xhr.timeout = 0;
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || totalPlainBytes === 0) {
                return;
            }

            const currentProgress = currentPlainBytes > 0
                ? uploadedPlainBytes + currentPlainBytes * (event.loaded / event.total)
                : uploadedPlainBytes;

                setUploadProgress({
                    progress: Math.min(currentProgress / totalPlainBytes, 0.999),
                    active: true,
                    stage: 'streaming',
                });
            };

        xhr.onload = () => {
            xhrRef.current = null;
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }
            reject(new Error(`Server rejected: ${xhr.status} ${xhr.responseText}`));
        };

        xhr.onerror = () => {
            xhrRef.current = null;
            reject(new Error('Network error'));
        };

        xhr.ontimeout = () => {
            xhrRef.current = null;
            reject(new Error('Request timed out'));
        };

        xhr.onabort = () => {
            xhrRef.current = null;
            reject(new Error('Upload aborted'));
        };

        xhr.send(chunk.buffer as ArrayBuffer);
    });

    const uploadChunkWithRetry = async (
        roomId: string,
        uploadId: string,
        chunkIndex: number,
        chunk: Uint8Array,
        uploadedPlainBytes: number,
        currentPlainBytes: number,
        totalPlainBytes: number,
    ) => {
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            try {
                attempt += 1;
                await uploadChunk(
                    roomId,
                    uploadId,
                    chunkIndex,
                    chunk,
                    uploadedPlainBytes,
                    currentPlainBytes,
                    totalPlainBytes,
                );
                return;
            } catch (error) {
                const message = getErrorMessage(error);
                if (message === 'Upload aborted') {
                    throw error;
                }

                if (attempt >= MAX_RETRIES) {
                    throw error;
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    };

    const uploadFile = async (file: File, encrypted: boolean = true) => {
        if (!roomPassword) {
            return;
        }

        const targetRoomId = hashedRoomId ?? hashRoomPassword(roomPassword);
        const useFileCryptoV2 = encrypted
            && roomCapabilities.fileCryptoV2Enabled
            && isFileCryptoV2Available();
        const useMetadataCryptoV2 = encrypted
            && roomCapabilities.fileCryptoV2Enabled
            && isMetadataCryptoV2Available();
        let uploadId: string | null = null;
        let worker: Worker | null = null;

        try {
            setUploadProgress({ progress: 0, active: true, stage: encrypted ? 'encrypting' : 'streaming' });

            const metadata = useMetadataCryptoV2
                ? {
                    encryptedMetadata: await encryptFileMetadataV2(
                        { fileName: file.name },
                        roomPassword,
                    ),
                }
                : {
                    fileName: file.name,
                };

            const supportsResume = !encrypted || useFileCryptoV2;
            const resumeId = supportsResume ? await generateResumeId(file) : null;

            const sessionInitData = await createUploadSession(
                targetRoomId,
                file,
                encrypted,
                metadata,
                encrypted ? (useFileCryptoV2 ? 'v2' : 'v1') : undefined,
                encrypted ? (useFileCryptoV2 ? 'AES-GCM' : 'AES-CBC') : undefined,
                resumeId,
            );
            
            uploadId = sessionInitData.uploadId;
            const nextChunkIndex = sessionInitData.nextChunkIndex;
            
            uploadSessionRef.current = { roomId: targetRoomId, uploadId };

            let chunkIndex = nextChunkIndex;
            let uploadedPlainBytes = 0;

            if (encrypted) {
                worker = useFileCryptoV2 ? new EncryptWorkerV2() : new EncryptWorker();
                workerRef.current = worker;

                const headerResponse = await sendWorkerMessage(worker, {
                    type: 'INIT',
                    key: roomPassword,
                    salt: V1_ENCRYPTION_SALT,
                    iterations: 1000,
                });

                if (headerResponse.type !== 'HEADER') {
                    throw new Error('Invalid encrypt worker init response');
                }

                if (chunkIndex === 0) {
                    await uploadChunkWithRetry(
                        targetRoomId,
                        uploadId,
                        chunkIndex,
                        headerResponse.chunk,
                        uploadedPlainBytes,
                        0,
                        file.size,
                    );
                    chunkIndex += 1;
                } else if (useFileCryptoV2) {
                    uploadedPlainBytes = (chunkIndex - 1) * CHUNK_SIZE;
                }
            } else {
                uploadedPlainBytes = chunkIndex * CHUNK_SIZE;
            }

            for (let offset = uploadedPlainBytes; offset < file.size; offset += CHUNK_SIZE) {
                const end = Math.min(offset + CHUNK_SIZE, file.size);
                const plainChunk = await file.slice(offset, end).arrayBuffer();
                const plainChunkSize = end - offset;

                setUploadProgress({
                    progress: uploadedPlainBytes / file.size,
                    active: true,
                    stage: 'streaming',
                });

                if (encrypted) {
                    const processed = await sendWorkerMessage(
                        worker as Worker,
                        { type: 'PROCESS', chunk: plainChunk },
                        [plainChunk],
                    );

                    if (processed.type !== 'PROCESSED') {
                        throw new Error('Invalid encrypt worker process response');
                    }

                    if (processed.chunk && processed.chunk.byteLength > 0) {
                        await uploadChunkWithRetry(
                            targetRoomId,
                            uploadId,
                            chunkIndex,
                            processed.chunk,
                            uploadedPlainBytes,
                            plainChunkSize,
                            file.size,
                        );
                        chunkIndex += 1;
                    }
                } else {
                    const plainBytes = new Uint8Array(plainChunk);
                    await uploadChunkWithRetry(
                        targetRoomId,
                        uploadId,
                        chunkIndex,
                        plainBytes,
                        uploadedPlainBytes,
                        plainChunkSize,
                        file.size,
                    );
                    chunkIndex += 1;
                }

                uploadedPlainBytes += plainChunkSize;
                setUploadProgress({
                    progress: uploadedPlainBytes / file.size,
                    active: true,
                    stage: 'streaming',
                });
            }

            if (encrypted) {
                const finalResponse = await sendWorkerMessage(worker as Worker, { type: 'FINALIZE' });
                if (finalResponse.type !== 'FINAL') {
                    throw new Error('Invalid encrypt worker finalize response');
                }

                if (finalResponse.chunk && finalResponse.chunk.byteLength > 0) {
                    await uploadChunkWithRetry(
                        targetRoomId,
                        uploadId,
                        chunkIndex,
                        finalResponse.chunk,
                        file.size,
                        0,
                        file.size,
                    );
                }
            }

            await completeUploadSession(targetRoomId, uploadId);
            uploadSessionRef.current = null;
            if (worker) {
                worker.terminate();
                workerRef.current = null;
            }
            setUploadProgress({ progress: 1, active: false, stage: 'idle' });
        } catch (error) {
            const message = getErrorMessage(error);
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }

            const session = uploadSessionRef.current;
            uploadSessionRef.current = null;
            if (session) {
                await abortUploadSession(session);
            }

            if (message !== 'Upload aborted') {
                console.error('Chunked upload failed:', error);
                setUploadProgress({ progress: 0, active: true, stage: 'error', error: message });
            } else {
                setUploadProgress({ progress: 0, active: false, stage: 'idle' });
            }
        } finally {
            pendingRejectRef.current = null;
            xhrRef.current = null;
            if (worker && workerRef.current === worker) {
                worker.terminate();
                workerRef.current = null;
            }
        }
    };

    const cancelUpload = () => {
        abortActiveUpload();
    };

    return {
        peerId,
        refreshPeerId,
        roomPassword,
        hashedRoomId,
        encryptionKey,
        messages,
        files,
        onlineCount,
        roomCapabilities,
        uploadProgress,
        joinRoom,
        leaveRoom,
        sendText,
        uploadFile,
        cancelUpload,
        deleteFiles,
    };
};
