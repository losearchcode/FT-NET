import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const port = process.env.PORT || 31208;
const server = http.createServer(app);
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
server.keepAliveTimeout = 0;

const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8,
});

const rooms = new Map();
const uploadSessions = new Map();

const makeId = () => `${Date.now()}-${Math.round(Math.random() * 1e8)}`;
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isEncryptedMetadataPayloadV2 = (value) => (
    Boolean(value)
    && typeof value === 'object'
    && value.version === 'v2'
    && isNonEmptyString(value.iv)
    && isNonEmptyString(value.ciphertext)
);

const ensureRoomDir = (roomId) => {
    const roomDir = path.join(UPLOADS_DIR, roomId);
    if (!fs.existsSync(roomDir)) {
        fs.mkdirSync(roomDir, { recursive: true });
    }
    return roomDir;
};

const cleanupUploadSession = (uploadId) => {
    const session = uploadSessions.get(uploadId);
    if (!session) {
        return;
    }

    if (fs.existsSync(session.tempFilePath)) {
        fs.rmSync(session.tempFilePath, { force: true });
    }

    uploadSessions.delete(uploadId);
};

const cleanupRoomUploadSessions = (roomId) => {
    for (const [uploadId, session] of uploadSessions.entries()) {
        if (session.roomId === roomId) {
            cleanupUploadSession(uploadId);
        }
    }
};

const getRoomCapabilities = (room) => ({
    messageCryptoV2Enabled:
        room.users.size > 0
        && Array.from(room.users.values()).every((user) => user.webCryptoV2),
    fileCryptoV2Enabled:
        room.users.size > 0
        && Array.from(room.users.values()).every((user) => user.webCryptoV2),
});

const findFileMeta = (roomId, fileId) => {
    const room = rooms.get(roomId);
    if (!room) {
        return null;
    }

    return room.files.find((file) => file.id === fileId) ?? null;
};

const getLegacyFileNameFromId = (fileId) => {
    const firstDash = fileId.indexOf('-');
    const secondDash = fileId.indexOf('-', firstDash + 1);
    if (firstDash === -1 || secondDash === -1 || secondDash + 1 >= fileId.length) {
        return null;
    }

    return fileId.substring(secondDash + 1);
};

app.post('/upload/init/:roomId', (req, res) => {
    const { roomId } = req.params;
    const {
        fileName,
        encryptedMetadata,
        fileSize,
        fileType,
        senderId,
        encrypted,
        securityMode,
        encryptionVersion,
        algorithm,
        resumeId,
    } = req.body ?? {};

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).send('Room not found or empty.');
    }

    const normalizedFileName = isNonEmptyString(fileName) ? fileName.trim() : null;
    const normalizedEncryptedMetadata = isEncryptedMetadataPayloadV2(encryptedMetadata)
        ? encryptedMetadata
        : null;

    if ((!normalizedFileName && !normalizedEncryptedMetadata) || typeof fileSize !== 'number') {
        return res.status(400).send('Invalid upload metadata.');
    }

    if (resumeId && uploadSessions.has(resumeId)) {
        const session = uploadSessions.get(resumeId);
        return res.json({
            success: true,
            uploadId: resumeId,
            nextChunkIndex: session.nextChunkIndex,
        });
    }

    const roomDir = ensureRoomDir(roomId);
    const storedFileId = makeId();
    const uploadId = resumeId || makeId();
    const tempFilePath = path.join(roomDir, `${storedFileId}.part.${uploadId}`);

    fs.writeFileSync(tempFilePath, Buffer.alloc(0));

    const fileMeta = {
        id: storedFileId,
        fileSize,
        fileType: fileType || 'application/octet-stream',
        uploadedAt: Date.now(),
        senderId: senderId || 'Unknown',
        encrypted: Boolean(encrypted),
        securityMode: securityMode || (encrypted ? 'encrypted' : 'plain'),
        encryptionVersion,
        algorithm,
    };

    if (normalizedFileName) {
        fileMeta.fileName = normalizedFileName;
    }

    if (normalizedEncryptedMetadata) {
        fileMeta.encryptedMetadata = normalizedEncryptedMetadata;
    }

    uploadSessions.set(uploadId, {
        roomId,
        tempFilePath,
        finalFileName: storedFileId,
        nextChunkIndex: 0,
        receivedChunkSizes: new Map(),
        fileMeta,
    });

    return res.json({ success: true, uploadId });
});

app.post(
    '/upload/chunk/:roomId/:uploadId',
    express.raw({ type: 'application/octet-stream', limit: '20mb' }),
    (req, res) => {
        const { roomId, uploadId } = req.params;
        const chunkIndex = Number(req.query.index);
        const session = uploadSessions.get(uploadId);

        if (!session || session.roomId !== roomId) {
            return res.status(404).send('Upload session not found.');
        }

        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
            return res.status(400).send('Invalid chunk index.');
        }

        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).send('Invalid chunk body.');
        }

        const previousChunkSize = session.receivedChunkSizes.get(chunkIndex);
        if (chunkIndex < session.nextChunkIndex) {
            if (previousChunkSize === req.body.length) {
                return res.json({ success: true, duplicate: true });
            }
            return res.status(409).send('Conflicting duplicate chunk.');
        }

        if (chunkIndex > session.nextChunkIndex) {
            return res.status(409).send('Out-of-order chunk.');
        }

        fs.appendFileSync(session.tempFilePath, req.body);
        session.receivedChunkSizes.set(chunkIndex, req.body.length);
        session.nextChunkIndex += 1;

        return res.json({ success: true, nextChunkIndex: session.nextChunkIndex });
    },
);

app.post('/upload/complete/:roomId/:uploadId', (req, res) => {
    const { roomId, uploadId } = req.params;
    const room = rooms.get(roomId);
    const session = uploadSessions.get(uploadId);

    if (!room || !session || session.roomId !== roomId) {
        return res.status(404).send('Upload session not found.');
    }

    const finalFilePath = path.join(ensureRoomDir(roomId), session.finalFileName);
    fs.renameSync(session.tempFilePath, finalFilePath);

    room.files.push(session.fileMeta);
    io.to(roomId).emit('file-added', session.fileMeta);
    uploadSessions.delete(uploadId);

    return res.json({ success: true, file: session.fileMeta });
});

app.post('/upload/abort/:roomId/:uploadId', (req, res) => {
    const { roomId, uploadId } = req.params;
    const session = uploadSessions.get(uploadId);

    if (!session || session.roomId !== roomId) {
        return res.json({ success: true });
    }

    cleanupUploadSession(uploadId);
    return res.json({ success: true });
});

app.post('/delete-files/:roomId', (req, res) => {
    const { roomId } = req.params;
    const { fileIds, senderId } = req.body;

    const room = rooms.get(roomId);
    if (!room || !Array.isArray(fileIds) || !senderId) {
        return res.status(400).send('Invalid request');
    }

    let isAuthorized = false;
    for (const user of room.users.values()) {
        if (user.senderId === senderId) {
            isAuthorized = true;
            break;
        }
    }

    if (!isAuthorized) {
        return res.status(403).send('Unauthorized to delete files in this room');
    }

    room.files = room.files.filter((file) => !fileIds.includes(file.id));

    fileIds.forEach((id) => {
        const filePath = path.join(UPLOADS_DIR, roomId, id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    io.to(roomId).emit('files-updated', room.files);
    return res.json({ success: true });
});

app.get('/download/:roomId/:fileId', (req, res) => {
    const { roomId, fileId } = req.params;
    const filePath = path.join(UPLOADS_DIR, roomId, fileId);
    const fileMeta = findFileMeta(roomId, fileId);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found or already destroyed.');
    }

    const originalName = fileMeta?.fileName || getLegacyFileNameFromId(fileId) || fileId;

    if (req.query.preview === '1') {
        const ext = path.extname(originalName).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain; charset=utf-8',
            '.log': 'text/plain; charset=utf-8',
            '.md': 'text/plain; charset=utf-8',
            '.markdown': 'text/plain; charset=utf-8',
            '.csv': 'text/plain; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.xml': 'text/xml; charset=utf-8',
            '.yaml': 'text/plain; charset=utf-8',
            '.yml': 'text/plain; charset=utf-8',
            '.toml': 'text/plain; charset=utf-8',
            '.ini': 'text/plain; charset=utf-8',
            '.conf': 'text/plain; charset=utf-8',
            '.cfg': 'text/plain; charset=utf-8',
            '.env': 'text/plain; charset=utf-8',
            '.js': 'text/plain; charset=utf-8',
            '.jsx': 'text/plain; charset=utf-8',
            '.ts': 'text/plain; charset=utf-8',
            '.tsx': 'text/plain; charset=utf-8',
            '.css': 'text/plain; charset=utf-8',
            '.scss': 'text/plain; charset=utf-8',
            '.less': 'text/plain; charset=utf-8',
            '.html': 'text/plain; charset=utf-8',
            '.htm': 'text/plain; charset=utf-8',
            '.sh': 'text/plain; charset=utf-8',
            '.bash': 'text/plain; charset=utf-8',
            '.bat': 'text/plain; charset=utf-8',
            '.cmd': 'text/plain; charset=utf-8',
            '.py': 'text/plain; charset=utf-8',
            '.java': 'text/plain; charset=utf-8',
            '.c': 'text/plain; charset=utf-8',
            '.cpp': 'text/plain; charset=utf-8',
            '.h': 'text/plain; charset=utf-8',
            '.hpp': 'text/plain; charset=utf-8',
            '.go': 'text/plain; charset=utf-8',
            '.rs': 'text/plain; charset=utf-8',
            '.sql': 'text/plain; charset=utf-8',
            '.vue': 'text/plain; charset=utf-8',
            '.svelte': 'text/plain; charset=utf-8',
        };

        const contentType = fileMeta?.fileType || mimeMap[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
        return res.sendFile(filePath);
    }

    return res.download(filePath, originalName);
});

io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId, senderId, capabilities = {} }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.senderId = senderId;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { messages: [], files: [], users: new Map(), destructionTimeout: null });
            console.log(`Room [${roomId}] dynamically created by ${senderId}`);
        }

        const room = rooms.get(roomId);
        if (room.destructionTimeout) {
            clearTimeout(room.destructionTimeout);
            room.destructionTimeout = null;
            console.log(`Room [${roomId}] destruction aborted (user rejoined).`);
        }
        
        room.users.set(socket.id, {
            senderId,
            webCryptoV2: Boolean(capabilities.webCryptoV2),
        });
        console.log(`User ${senderId} joined [${roomId}]. Living users: ${room.users.size}`);
        const roomCapabilities = getRoomCapabilities(room);

        socket.emit('room_history', {
            messages: room.messages,
            files: room.files,
        });

        io.to(roomId).emit('room_capabilities', roomCapabilities);
        socket.to(roomId).emit('sys_message', { content: `User ${senderId} entered the room`, timestamp: Date.now() });
        io.to(roomId).emit('user_count', room.users.size);
    });

    socket.on('send_message', (message) => {
        if (!socket.roomId) {
            return;
        }

        const room = rooms.get(socket.roomId);
        if (!room) {
            return;
        }

        room.messages.push(message);
        socket.to(socket.roomId).emit('new_message', message);
    });

    socket.on('disconnect', () => {
        if (!socket.roomId) {
            return;
        }

        const room = rooms.get(socket.roomId);
        if (!room) {
            return;
        }

        room.users.delete(socket.id);
        console.log(`User ${socket.senderId} left [${socket.roomId}]. Remaining: ${room.users.size}`);
        socket.to(socket.roomId).emit('sys_message', { content: `User ${socket.senderId} left the room`, timestamp: Date.now() });
        io.to(socket.roomId).emit('user_count', room.users.size);
        io.to(socket.roomId).emit('room_capabilities', getRoomCapabilities(room));

        if (room.users.size === 0) {
            console.log(`Room [${socket.roomId}] is empty. Scheduling destruction in 45 seconds...`);
            room.destructionTimeout = setTimeout(() => {
                if (rooms.has(socket.roomId)) {
                    rooms.delete(socket.roomId);
                    cleanupRoomUploadSessions(socket.roomId);
                    const roomDir = path.join(UPLOADS_DIR, socket.roomId);

                    fs.rm(roomDir, { recursive: true, force: true }, (error) => {
                        if (error && error.code !== 'ENOENT') {
                            console.error(`Failed to delete room files for [${socket.roomId}]`, error);
                        } else {
                            console.log(`Room [${socket.roomId}] is now empty. All data and files were destroyed.`);
                        }
                    });
                }
            }, 45000);
        }
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server-Backed Room System is listening on http://0.0.0.0:${port}`);
});
