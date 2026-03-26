import { useState, useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { TextMessage, FileMetadata, SysMessage } from '../types';

export const usePeer = () => {
    const [peerId, setPeerId] = useState<string>('');
    const [roomPassword, setRoomPassword] = useState<string | null>(null);
    const [messages, setMessages] = useState<(TextMessage | SysMessage)[]>([]);
    const [files, setFiles] = useState<FileMetadata[]>([]);

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

        try {
            const xhr = new XMLHttpRequest();
            const uploadUrl = `/upload/${roomPassword}`;
            xhr.open('POST', uploadUrl, true);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total);
                    setUploadProgress({ progress: percentComplete, active: true });
                }
            };

            xhr.onload = () => {
                if (xhr.status === 200) {
                    setUploadProgress({ progress: 1, active: false });
                } else {
                    console.error('File Upload rejected:', xhr.responseText);
                    setUploadProgress({ progress: 0, active: false });
                }
            };

            xhr.onerror = () => {
                console.error('Upload Error: network failure');
                setUploadProgress({ progress: 0, active: false });
            };

            xhr.send(formData);
        } catch (error) {
            console.error('Upload Process Failed:', error);
            setUploadProgress({ progress: 0, active: false });
        }
    };

    return {
        peerId,
        roomPassword,
        messages,
        files,
        uploadProgress,
        joinRoom,
        leaveRoom,
        sendText,
        uploadFile,
        deleteFiles
    };
};
