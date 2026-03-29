import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import http from 'http';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 注入读取外部宏定义环境表配置 (.env)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// 终极武器：让 Node直接代理分发所有前端的静态网页文件！
// 这样我们从始至终就只用 1 个全能端口了，永不再惧怕被防火墙阻断分离端口。
app.use(express.static(path.join(__dirname, '../dist')));

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Config Multer for chunk-less HTTP File Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const roomId = req.params.roomId;
        const roomDir = path.join(UPLOADS_DIR, roomId);
        if (!fs.existsSync(roomDir)) {
            fs.mkdirSync(roomDir, { recursive: true });
        }
        cb(null, roomDir);
    },
    filename: (req, file, cb) => {
        const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1e4);
        // We use latin1 encode/decode to prevent multer from breaking raw utf-8 original filenames
        const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, uniquePrefix + '-' + utf8Name);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB 上限
});

// 从环境宏定义文件中抽取指定的端口号，若未定义或异常则平滑降级 fallback 到兜底的 31208
const port = process.env.PORT || 31208;
const server = http.createServer(app);

// 【关键修复】彻底移除 Node.js http 服务器的默认超时限制
// 这是大文件传输被中途静默截断的根因！
server.timeout = 0;           // 读写总超时 → 无限
server.headersTimeout = 0;    // 请求头等待超时 → 无限
server.requestTimeout = 0;    // 整个请求超时 → 无限
server.keepAliveTimeout = 0;  // 保活超时 → 无限

const io = new Server(server, { 
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8 // Socket.io 单消息包体上限 100MB
});

// In-Memory Database: rooms.get(roomId) -> { messages: [], files: [], users: Set }
const rooms = new Map();

// --- HTTP ENDPOINTS FOR FILES ---

app.post('/upload/:roomId', upload.single('file'), (req, res) => {
    const { roomId } = req.params;
    const { senderId } = req.body;
    if (!req.file) return res.status(400).send('No file uploaded.');

    const room = rooms.get(roomId);
    if (!room) return res.status(404).send('Room not found or empty.');

    const utf8Name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const fileMeta = {
        id: req.file.filename,
        fileName: utf8Name,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        uploadedAt: Date.now(),
        senderId: senderId || 'Unknown'
    };

    room.files.push(fileMeta);
    io.to(roomId).emit('file-added', fileMeta);

    res.status(200).json({ success: true, file: fileMeta });
});

app.post('/delete-files/:roomId', (req, res) => {
    const { roomId } = req.params;
    const { fileIds } = req.body;

    const room = rooms.get(roomId);
    if (!room || !Array.isArray(fileIds)) return res.status(400).send('Invalid request');

    fileIds.forEach(id => {
        const fileIndex = room.files.findIndex(f => f.id === id);
        if (fileIndex !== -1) {
            room.files.splice(fileIndex, 1);
        }
        const filePath = path.join(UPLOADS_DIR, roomId, id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    io.to(roomId).emit('files-updated', room.files);
    res.json({ success: true });
});

app.get('/download/:roomId/:fileId', (req, res) => {
    const { roomId, fileId } = req.params;
    const filePath = path.join(UPLOADS_DIR, roomId, fileId);

    // Safety check
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found or already destroyed.');
    }

    // Extract original name from format: timestamp-random-OriginalName.ext
    const firstDash = fileId.indexOf('-');
    const secondDash = fileId.indexOf('-', firstDash + 1);
    const originalName = fileId.substring(secondDash + 1);

    res.download(filePath, originalName);
});


// --- SOCKET.IO FOR CHAT & ROOM LIFECYCLE ---

io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId, senderId }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.senderId = senderId;

        // Create Room if not exists
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { messages: [], files: [], users: new Set() });
            console.log(`Room [${roomId}] dynamically created by ${senderId}`);
        }

        const room = rooms.get(roomId);
        room.users.add(socket.id);
        console.log(`User ${senderId} joined [${roomId}]. Living users: ${room.users.size}`);

        // Sync old data to the newcomer
        socket.emit('room_history', {
            messages: room.messages,
            files: room.files
        });

        socket.to(roomId).emit('sys_message', { content: `User ${senderId} 进入了房间`, timestamp: Date.now() });
    });

    socket.on('send_message', (msg) => {
        if (!socket.roomId) return;
        const room = rooms.get(socket.roomId);
        if (room) {
            room.messages.push(msg);
            socket.to(socket.roomId).emit('new_message', msg);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.users.delete(socket.id);
                console.log(`User ${socket.senderId} left [${socket.roomId}]. Remaining: ${room.users.size}`);
                socket.to(socket.roomId).emit('sys_message', { content: `User ${socket.senderId} 退出了房间`, timestamp: Date.now() });

                // Automatic Destruction (Garbage Collection)
                if (room.users.size === 0) {
                    rooms.delete(socket.roomId);
                    const roomDir = path.join(UPLOADS_DIR, socket.roomId);
                    fs.rm(roomDir, { recursive: true, force: true }, (err) => {
                        if (err && err.code !== 'ENOENT') {
                            console.error(`Failed to delete room files for [${socket.roomId}]`, err);
                        } else {
                            console.log(`♻️ Room [${socket.roomId}] is now empty. All Data & Files have been permanently DESTROYED.`);
                        }
                    });
                }
            }
        }
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Server-Backed Room System is listening on http://0.0.0.0:${port}`);
});
