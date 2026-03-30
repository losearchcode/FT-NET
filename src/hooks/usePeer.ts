import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { TextMessage, FileMetadata, SysMessage } from '../types';

export const usePeer = () => {
    const [peerId, setPeerId] = useState<string>('');
    const [roomPassword, setRoomPassword] = useState<string | null>(null);
    const [messages, setMessages] = useState<(TextMessage | SysMessage)[]>([]);
    const [files, setFiles] = useState<FileMetadata[]>([]);
    const [onlineCount, setOnlineCount] = useState<number>(0);

    const [uploadProgress, setUploadProgress] = useState<{ progress: number, active: boolean }>({ progress: 0, active: false });
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const generateShortId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        };
        const myId = generateShortId();
        setPeerId(myId);

        const socket = io({ autoConnect: false });
        socketRef.current = socket;

        socket.on('room_history', (data: { messages: any[], files: FileMetadata[] }) => {
            setMessages(data.messages);
            setFiles(data.files);
        });

        socket.on('sys_message', (msg: SysMessage) => {
            setMessages(prev => [...prev, { ...msg, sender: 'system' }]);
        });

        socket.on('new_message', (msg: TextMessage) => {
            setMessages(prev => [...prev, { ...msg, sender: 'remote' }]);
        });

        socket.on('file-added', (file: FileMetadata) => {
            setFiles(prev => [...prev, file]);
        });

        socket.on('files-updated', (updatedFiles: FileMetadata[]) => {
            setFiles(updatedFiles);
        });

        socket.on('user_count', (count: number) => {
            setOnlineCount(count);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const deleteFiles = async (fileIds: string[]) => {
        if (!roomPassword) return;
        try {
            await fetch(`/delete-files/${roomPassword}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileIds })
            });
        } catch (error) {
            console.error('Failed to delete files:', error);
        }
    };

    const joinRoom = (password: string) => {
        if (!socketRef.current) return;
        socketRef.current.connect();
        socketRef.current.emit('join_room', { roomId: password, senderId: peerId });
        setRoomPassword(password);
    };

    const leaveRoom = () => {
        if (!socketRef.current) return;
        socketRef.current.disconnect();
        setRoomPassword(null);
        setMessages([]);
        setFiles([]);
    };

    const sendText = (text: string) => {
        if (!socketRef.current || !roomPassword) return;

        const msg: TextMessage = {
            type: 'TEXT',
            content: text,
            sender: 'me',
            senderName: peerId,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, msg]);
        socketRef.current.emit('send_message', { ...msg, sender: 'remote' });
    };

    const uploadFile = async (file: File) => {
        if (!roomPassword) return;

        setUploadProgress({ progress: 0, active: true });

        const formData = new FormData();
        formData.append('file', file);
        formData.append('senderId', peerId);

        const MAX_RETRIES = 3;
        let attempt = 0;

        const doUpload = (): Promise<void> => {
            return new Promise((resolve, reject) => {
                attempt++;
                const xhr = new XMLHttpRequest();
                const uploadUrl = `/upload/${roomPassword}`;
                xhr.open('POST', uploadUrl, true);

                // 【关键】彻底禁用浏览器端的 XHR 超时限制，防止大文件传输中途被强切
                xhr.timeout = 0;

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = (event.loaded / event.total);
                        setUploadProgress({ progress: percentComplete, active: true });
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        setUploadProgress({ progress: 1, active: false });
                        resolve();
                    } else {
                        reject(new Error(`Server rejected: ${xhr.status} ${xhr.responseText}`));
                    }
                };

                xhr.onerror = () => reject(new Error('Network error'));
                xhr.ontimeout = () => reject(new Error('Request timed out'));
                xhr.onabort = () => reject(new Error('Upload aborted'));

                xhr.send(formData);
            });
        };

        while (attempt < MAX_RETRIES) {
            try {
                await doUpload();
                return; // 成功则直接退出
            } catch (error: any) {
                console.warn(`Upload attempt ${attempt}/${MAX_RETRIES} failed:`, error?.message);
                if (attempt >= MAX_RETRIES) {
                    console.error('Upload permanently failed after max retries.');
                    setUploadProgress({ progress: 0, active: false });
                    return;
                }
                // 重试前短暂等待
                setUploadProgress(prev => ({ ...prev, active: true }));
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    };

    return {
        peerId,
        roomPassword,
        messages,
        files,
        onlineCount,
        uploadProgress,
        joinRoom,
        leaveRoom,
        sendText,
        uploadFile,
        deleteFiles
    };
};
