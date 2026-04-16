import { startTransition, useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, File as FileIcon, Download, Trash2, CheckSquare, Square, Eye, X, Info } from 'lucide-react';
import type { FileMetadata } from '../types';
import DecryptWorker from '../workers/decryptWorker?worker';
import DecryptWorkerV2 from '../workers/decryptWorkerV2?worker';
import { isFileCryptoV2Available } from '../utils/fileCryptoV2';

interface FileTransferProps {
    roomId: string;
    roomPassword: string;
    files: FileMetadata[];
    uploadProgress: {
        progress: number;
        active: boolean;
        stage: 'encrypting' | 'streaming' | 'idle';
    };
    onUpload: (file: File, encrypted: boolean) => void;
    onCancelUpload: () => void;
    onDeleteFiles: (ids: string[]) => void;
}

type DecryptWorkerMessage =
    | { type: 'CHUNK'; chunk: Uint8Array }
    | { type: 'DONE' }
    | { type: 'ERROR'; error: string };

type DownloadProgressState = {
    active: boolean;
    fileName: string;
    progress: number;
    stage: 'downloading' | 'decrypting' | 'saving' | 'idle';
};

const DOWNLOAD_PROGRESS_THROTTLE_MS = 80;
const DOWNLOAD_PROGRESS_MIN_STEP = 0.01;
const DOWNLOAD_PROGRESS_INITIAL_STATE: DownloadProgressState = {
    active: false,
    fileName: '',
    progress: 0,
    stage: 'idle',
};

type SaveFilePickerOptions = {
    suggestedName?: string;
};

type WritableFileStream = {
    write: (data: BufferSource | Blob | string) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
};

type SaveFileHandle = {
    createWritable: () => Promise<WritableFileStream>;
};

type WindowWithSavePicker = Window & typeof globalThis & {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

type DecryptWorkerConstructor = new () => Worker;

const MIME_TYPE_BY_EXT: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    txt: 'text/plain; charset=utf-8',
    log: 'text/plain; charset=utf-8',
    md: 'text/plain; charset=utf-8',
    markdown: 'text/plain; charset=utf-8',
    json: 'application/json; charset=utf-8',
    csv: 'text/plain; charset=utf-8',
    yaml: 'text/plain; charset=utf-8',
    yml: 'text/plain; charset=utf-8',
    xml: 'text/xml; charset=utf-8',
    js: 'text/plain; charset=utf-8',
    jsx: 'text/plain; charset=utf-8',
    ts: 'text/plain; charset=utf-8',
    tsx: 'text/plain; charset=utf-8',
    css: 'text/plain; charset=utf-8',
    scss: 'text/plain; charset=utf-8',
    less: 'text/plain; charset=utf-8',
    html: 'text/plain; charset=utf-8',
    htm: 'text/plain; charset=utf-8',
    sh: 'text/plain; charset=utf-8',
    bash: 'text/plain; charset=utf-8',
    bat: 'text/plain; charset=utf-8',
    cmd: 'text/plain; charset=utf-8',
    py: 'text/plain; charset=utf-8',
    java: 'text/plain; charset=utf-8',
    c: 'text/plain; charset=utf-8',
    cpp: 'text/plain; charset=utf-8',
    h: 'text/plain; charset=utf-8',
    hpp: 'text/plain; charset=utf-8',
    go: 'text/plain; charset=utf-8',
    rs: 'text/plain; charset=utf-8',
    toml: 'text/plain; charset=utf-8',
    ini: 'text/plain; charset=utf-8',
    conf: 'text/plain; charset=utf-8',
    cfg: 'text/plain; charset=utf-8',
    env: 'text/plain; charset=utf-8',
    sql: 'text/plain; charset=utf-8',
    vue: 'text/plain; charset=utf-8',
    svelte: 'text/plain; charset=utf-8',
};

const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(name);
const isPdf = (name: string) => /\.pdf$/i.test(name);
const isText = (name: string) => /\.(txt|md|markdown|json|csv|log|yaml|yml|xml|js|jsx|ts|tsx|css|scss|less|html|htm|sh|bash|bat|cmd|py|java|c|cpp|h|hpp|go|rs|toml|ini|conf|cfg|env|sql|vue|svelte)$/i.test(name);
const canPreview = (name: string) => isImage(name) || isPdf(name) || isText(name);
const isLockedMetadataFile = (file: FileMetadata) => file.metadataState === 'locked';

const getMimeType = (name: string): string => {
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    return MIME_TYPE_BY_EXT[extension] ?? 'application/octet-stream';
};

const isAbortError = (error: unknown): boolean => (
    error instanceof DOMException && error.name === 'AbortError'
);

const streamDecryptToBlob = async (
    response: Response,
    key: string,
    mimeType: string,
    WorkerCtor: DecryptWorkerConstructor,
    onProgress?: (progress: DownloadProgressState) => void,
    fileName: string = '',
): Promise<Blob> => {
    const body = response.body;
    if (!body) {
        throw new Error('该浏览器不支持流式接收数据');
    }

    return new Promise((resolve, reject) => {
        const worker = new WorkerCtor();
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        const totalBytes = Number(response.headers.get('content-length') ?? '0');
        let loadedBytes = 0;

        worker.onmessage = (event: MessageEvent<DecryptWorkerMessage>) => {
            if (event.data.type === 'CHUNK') {
                chunks.push(event.data.chunk);
                return;
            }

            if (event.data.type === 'DONE') {
                worker.terminate();
                onProgress?.({
                    active: true,
                    fileName,
                    progress: 1,
                    stage: 'decrypting',
                });
                resolve(new Blob(chunks as BlobPart[], { type: mimeType }));
                return;
            }

            worker.terminate();
            reject(new Error(event.data.error));
        };

        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        worker.postMessage({ type: 'FINALIZE' });
                        break;
                    }

                    if (!value) {
                        continue;
                    }

                    loadedBytes += value.byteLength;
                    if (totalBytes > 0) {
                        onProgress?.({
                            active: true,
                            fileName,
                            progress: Math.min(loadedBytes / totalBytes, 0.98),
                            stage: 'downloading',
                        });
                    }

                    worker.postMessage({
                        type: 'CHUNK',
                        chunk: value,
                        key,
                        iterations: 1000,
                    }, [value.buffer]);
                }
            } catch (error) {
                worker.terminate();
                reject(error instanceof Error ? error : new Error('流式解密失败'));
            }
        };

        void pump();
    });
};

const streamDecryptToWritable = async (
    response: Response,
    key: string,
    writable: WritableFileStream,
    WorkerCtor: DecryptWorkerConstructor,
    onProgress?: (progress: DownloadProgressState) => void,
    fileName: string = '',
) => {
    const body = response.body;
    if (!body) {
        throw new Error('该浏览器不支持流式接收数据');
    }

    return new Promise<void>((resolve, reject) => {
        const worker = new WorkerCtor();
        const reader = body.getReader();
        const totalBytes = Number(response.headers.get('content-length') ?? '0');
        let loadedBytes = 0;
        let writeChain = Promise.resolve();
        let closed = false;

        const cleanup = async () => {
            worker.terminate();
            if (closed) {
                return;
            }
            closed = true;
            if (typeof writable.abort === 'function') {
                await writable.abort();
            }
        };

        worker.onmessage = (event: MessageEvent<DecryptWorkerMessage>) => {
            if (event.data.type === 'CHUNK') {
                const chunk = event.data.chunk;
                writeChain = writeChain
                    .then(async () => {
                        onProgress?.({
                            active: true,
                            fileName,
                            progress: totalBytes > 0 ? Math.min(loadedBytes / totalBytes, 0.995) : 0.995,
                            stage: 'saving',
                        });
                        await writable.write(chunk.buffer as ArrayBuffer);
                    })
                    .catch(async (error) => {
                        await cleanup();
                        reject(error);
                    });
                return;
            }

            if (event.data.type === 'DONE') {
                writeChain
                    .then(async () => {
                        if (!closed) {
                            closed = true;
                            await writable.close();
                        }
                        worker.terminate();
                        onProgress?.({
                            active: true,
                            fileName,
                            progress: 1,
                            stage: 'saving',
                        });
                        resolve();
                    })
                    .catch(async (error) => {
                        await cleanup();
                        reject(error);
                    });
                return;
            }

            if (event.data.type === 'ERROR') {
                const workerError = event.data.error;
                void cleanup().finally(() => reject(new Error(workerError)));
            }
        };

        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        worker.postMessage({ type: 'FINALIZE' });
                        break;
                    }

                    if (!value) {
                        continue;
                    }

                    loadedBytes += value.byteLength;
                    if (totalBytes > 0) {
                        onProgress?.({
                            active: true,
                            fileName,
                            progress: Math.min(loadedBytes / totalBytes, 0.98),
                            stage: 'saving',
                        });
                    }

                    worker.postMessage({
                        type: 'CHUNK',
                        chunk: value,
                        key,
                        iterations: 1000,
                    }, [value.buffer]);
                }
            } catch (error) {
                await cleanup();
                reject(error instanceof Error ? error : new Error('流式解密失败'));
            }
        };

        void pump();
    });
};

export const FileTransfer = ({
    roomId,
    roomPassword,
    files,
    uploadProgress,
    onUpload,
    onCancelUpload,
    onDeleteFiles,
}: FileTransferProps) => {
    const [encryptUploads, setEncryptUploads] = useState(() => {
        const stored = localStorage.getItem('ft-net-encrypt-uploads');
        return stored !== 'false';
    });

    const handleSetEncryptUploads = (value: boolean) => {
        setEncryptUploads(value);
        localStorage.setItem('ft-net-encrypt-uploads', String(value));
    };
    const [fileFilter, setFileFilter] = useState<'all' | 'encrypted' | 'plain'>('all');
    const [showStreamSaveHint, setShowStreamSaveHint] = useState(false);
    const [showUploadModeHint, setShowUploadModeHint] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState>(DOWNLOAD_PROGRESS_INITIAL_STATE);
    const supportsStreamSave = typeof window !== 'undefined' && typeof (window as WindowWithSavePicker).showSaveFilePicker === 'function';
    const previewRequestRef = useRef(0);
    const previewUrlRef = useRef<string | null>(null);
    const downloadProgressRef = useRef<DownloadProgressState>(DOWNLOAD_PROGRESS_INITIAL_STATE);
    const pendingDownloadProgressRef = useRef<DownloadProgressState | null>(null);
    const downloadProgressTimerRef = useRef<number | null>(null);
    const visibleFiles = files.filter((file) => {
        if (fileFilter === 'encrypted') {
            return file.encrypted;
        }
        if (fileFilter === 'plain') {
            return !file.encrypted;
        }
        return true;
    });

    const commitDownloadProgress = useCallback((next: DownloadProgressState, urgent: boolean = false) => {
        const current = downloadProgressRef.current;
        if (
            current.active === next.active
            && current.fileName === next.fileName
            && current.stage === next.stage
            && Math.abs(current.progress - next.progress) < 0.001
        ) {
            return;
        }

        downloadProgressRef.current = next;
        if (urgent) {
            setDownloadProgress(next);
            return;
        }

        startTransition(() => {
            setDownloadProgress(next);
        });
    }, []);

    const updateDownloadProgress = useCallback((next: DownloadProgressState) => {
        const current = pendingDownloadProgressRef.current ?? downloadProgressRef.current;
        const urgent = (
            next.stage !== current.stage
            || next.fileName !== current.fileName
            || next.progress >= 1
            || !next.active
        );

        if (
            !urgent
            && current.active === next.active
            && current.fileName === next.fileName
            && current.stage === next.stage
            && Math.abs(current.progress - next.progress) < DOWNLOAD_PROGRESS_MIN_STEP
        ) {
            return;
        }

        if (urgent) {
            pendingDownloadProgressRef.current = null;
            if (downloadProgressTimerRef.current !== null) {
                window.clearTimeout(downloadProgressTimerRef.current);
                downloadProgressTimerRef.current = null;
            }
            commitDownloadProgress(next, true);
            return;
        }

        pendingDownloadProgressRef.current = next;
        if (downloadProgressTimerRef.current !== null) {
            return;
        }

        downloadProgressTimerRef.current = window.setTimeout(() => {
            downloadProgressTimerRef.current = null;
            const pending = pendingDownloadProgressRef.current;
            pendingDownloadProgressRef.current = null;
            if (pending) {
                commitDownloadProgress(pending);
            }
        }, DOWNLOAD_PROGRESS_THROTTLE_MS);
    }, [commitDownloadProgress]);

    const replacePreviewUrl = useCallback((nextUrl: string | null) => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
    }, []);

    useEffect(() => () => {
        previewRequestRef.current += 1;
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
        }
        if (downloadProgressTimerRef.current !== null) {
            window.clearTimeout(downloadProgressTimerRef.current);
        }
    }, []);

    const fetchPlainBlob = useCallback(async (file: FileMetadata): Promise<Blob> => {
        const response = await fetch(`/download/${roomId}/${file.id}?preview=1`);
        if (!response.ok) {
            throw new Error('下载失败');
        }
        return response.blob();
    }, [roomId]);

    const getDecryptWorkerCtor = useCallback((file: FileMetadata): DecryptWorkerConstructor => {
        if (file.encryptionVersion === 'v2') {
            return DecryptWorkerV2;
        }
        return DecryptWorker;
    }, []);

    const fetchAndDecrypt = useCallback(async (
        file: FileMetadata,
        onProgress?: (progress: DownloadProgressState) => void,
    ): Promise<Blob> => {
        if (!file.encrypted) {
            return fetchPlainBlob(file);
        }

        if (file.encryptionVersion === 'v2' && !isFileCryptoV2Available()) {
            throw new Error('当前访问环境不支持 v2 加密文件解密');
        }

        const response = await fetch(`/download/${roomId}/${file.id}?preview=1`);
        if (!response.ok) {
            throw new Error('下载失败');
        }

        return streamDecryptToBlob(
            response,
            roomPassword,
            getMimeType(file.fileName),
            getDecryptWorkerCtor(file),
            onProgress,
            file.fileName,
        );
    }, [fetchPlainBlob, getDecryptWorkerCtor, roomId, roomPassword]);

    const openPreview = useCallback(async (file: FileMetadata) => {
        const requestId = previewRequestRef.current + 1;
        previewRequestRef.current = requestId;

        setPreviewFile(file);
        setPreviewLoading(true);
        setTextContent(null);
        replacePreviewUrl(null);

        try {
            const decryptedBlob = await fetchAndDecrypt(file);
            if (previewRequestRef.current !== requestId) {
                return;
            }

            if (isText(file.fileName)) {
                const text = await decryptedBlob.text();
                if (previewRequestRef.current === requestId) {
                    setTextContent(text);
                }
                return;
            }

            replacePreviewUrl(URL.createObjectURL(decryptedBlob));
        } catch (error) {
            if (previewRequestRef.current === requestId) {
                console.error('解密预览失败:', error);
                setTextContent('⚠️ 文件解密或加载失败');
            }
        } finally {
            if (previewRequestRef.current === requestId) {
                setPreviewLoading(false);
            }
        }
    }, [fetchAndDecrypt, replacePreviewUrl]);

    const closePreview = useCallback(() => {
        previewRequestRef.current += 1;
        setPreviewFile(null);
        setTextContent(null);
        setPreviewLoading(false);
        replacePreviewUrl(null);
    }, [replacePreviewUrl]);

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const droppedFiles = event.dataTransfer.files;
        for (let i = 0; i < droppedFiles.length; i++) {
            onUpload(droppedFiles[i], encryptUploads);
        }
    }, [encryptUploads, onUpload]);

    const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (!selectedFiles) {
            return;
        }

        for (let i = 0; i < selectedFiles.length; i++) {
            onUpload(selectedFiles[i], encryptUploads);
        }

        event.target.value = '';
    };

    const downloadFile = useCallback(async (file: FileMetadata) => {
        try {
            if (!file.encrypted) {
                const anchor = document.createElement('a');
                anchor.href = `/download/${roomId}/${file.id}`;
                anchor.download = file.fileName;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                return;
            }

            updateDownloadProgress({
                active: true,
                fileName: file.fileName,
                progress: 0,
                stage: supportsStreamSave ? 'saving' : 'downloading',
            });

            if (supportsStreamSave) {
                const saveWindow = window as WindowWithSavePicker;
                const fileHandle = await saveWindow.showSaveFilePicker?.({
                    suggestedName: file.fileName,
                });

                if (!fileHandle) {
                    throw new Error('无法创建保存文件句柄');
                }

                const writable = await fileHandle.createWritable();
                const response = await fetch(`/download/${roomId}/${file.id}?preview=1`);
                if (!response.ok) {
                    throw new Error('下载失败');
                }

                await streamDecryptToWritable(
                    response,
                    roomPassword,
                    writable,
                    getDecryptWorkerCtor(file),
                    updateDownloadProgress,
                    file.fileName,
                );

                updateDownloadProgress({
                    active: true,
                    fileName: file.fileName,
                    progress: 1,
                    stage: 'idle',
                });
                window.setTimeout(() => {
                    updateDownloadProgress({
                        active: false,
                        fileName: '',
                        progress: 0,
                        stage: 'idle',
                    });
                }, 600);
                return;
            }

            const decryptedBlob = await fetchAndDecrypt(file, updateDownloadProgress);
            const url = URL.createObjectURL(decryptedBlob);

            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = file.fileName;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            updateDownloadProgress({
                active: true,
                fileName: file.fileName,
                progress: 1,
                stage: 'idle',
            });
            window.setTimeout(() => {
                updateDownloadProgress({
                    active: false,
                    fileName: '',
                    progress: 0,
                    stage: 'idle',
                });
            }, 600);
        } catch (error) {
            updateDownloadProgress({
                active: false,
                fileName: '',
                progress: 0,
                stage: 'idle',
            });
            if (isAbortError(error)) {
                return;
            }
            alert('文件下载并解密失败');
        }
    }, [fetchAndDecrypt, getDecryptWorkerCtor, roomId, roomPassword, supportsStreamSave, updateDownloadProgress]);

    const toggleSelectAll = () => {
        const visibleIds = visibleFiles.map((file) => file.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

        if (allVisibleSelected) {
            setSelectedIds(new Set());
            return;
        }

        setSelectedIds(new Set(visibleIds));
    };

    const toggleSelect = (id: string) => {
        const nextSelectedIds = new Set(selectedIds);
        if (nextSelectedIds.has(id)) {
            nextSelectedIds.delete(id);
        } else {
            nextSelectedIds.add(id);
        }
        setSelectedIds(nextSelectedIds);
    };

    const handleBatchDelete = () => {
        if (selectedIds.size === 0) {
            return;
        }

        onDeleteFiles(Array.from(selectedIds));
        setSelectedIds(new Set());
    };

    const handleBatchDownload = async () => {
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            const file = files.find((item) => item.id === id);
            if (!file) {
                continue;
            }

            await downloadFile(file);
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    };

    return (
        <>
            <div className="glass-panel animate-slide-up file-transfer-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileIcon size={20} color="#8b5cf6" />
                        群组公共存储柜
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                        <div
                            onMouseEnter={() => setShowUploadModeHint(true)}
                            onMouseLeave={() => setShowUploadModeHint(false)}
                            style={{
                                position: 'relative',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.45rem 0.7rem',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'rgba(255,255,255,0.03)',
                                boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
                            }}
                        >
                            <Info size={15} color={encryptUploads ? '#a78bfa' : '#f59e0b'} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                上传模式：{encryptUploads ? '端到端加密上传' : '明文直传'}
                            </span>

                            {showUploadModeHint && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 10px)',
                                        right: 0,
                                        zIndex: 999,
                                        width: '320px',
                                        padding: '0.8rem 0.9rem',
                                        borderRadius: '12px',
                                        background: 'rgba(15, 23, 42, 0.96)',
                                        border: '1px solid rgba(167, 139, 250, 0.24)',
                                        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.32)',
                                        backdropFilter: 'blur(10px)',
                                    }}
                                >
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ddd6fe', marginBottom: '0.45rem' }}>
                                        上传模式说明
                                    </div>
                                    {encryptUploads ? (
                                        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.77rem', lineHeight: '1.65', color: '#cbd5e1' }}>
                                            <li style={{ marginBottom: '0.45rem' }}>优点：文件会在客户端完成加密后再上传，服务端仅保存密文，下载端也会按加密链路解密查看，更适合需要隐私保护的房间与敏感内容传输。</li>
                                            <li>缺点：上传与下载都会增加客户端的 CPU、内存与耗时开销。</li>
                                        </ul>
                                    ) : (
                                        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.77rem', lineHeight: '1.65', color: '#cbd5e1' }}>
                                            <li style={{ marginBottom: '0.45rem' }}>优点：文件会直接上传，上传与下载性能更好，下载端也可直接走原生下载链路，整体资源占用更低，适合性能较弱的设备。</li>
                                            <li>缺点：服务端会以明文形式保存文件，不建议用于敏感内容传输。</li>
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleSetEncryptUploads(true)}
                            disabled={uploadProgress.active}
                            style={{
                                padding: '0.45rem 0.7rem',
                                fontSize: '0.78rem',
                                background: encryptUploads ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255,255,255,0.03)',
                                border: encryptUploads ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid var(--panel-border)',
                                color: encryptUploads ? '#d8b4fe' : 'var(--text-muted)',
                                boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
                            }}
                        >
                            推荐：加密上传
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSetEncryptUploads(false)}
                            disabled={uploadProgress.active}
                            style={{
                                padding: '0.45rem 0.7rem',
                                fontSize: '0.78rem',
                                background: !encryptUploads ? 'rgba(245, 158, 11, 0.16)' : 'rgba(255,255,255,0.03)',
                                border: !encryptUploads ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--panel-border)',
                                color: !encryptUploads ? '#fde68a' : 'var(--text-muted)',
                                boxShadow: '0 8px 22px rgba(0,0,0,0.18)',
                            }}
                        >
                            高性能：明文直传
                        </button>
                    </div>
                </div>

                <div
                    onDrop={handleDrop}
                    onDragOver={(event) => event.preventDefault()}
                    style={{
                        border: '2px dashed var(--panel-border)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        textAlign: 'center',
                        background: 'rgba(15, 23, 42, 0.4)',
                        cursor: uploadProgress.active ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s ease',
                        marginBottom: '1rem',
                        opacity: uploadProgress.active ? 0.5 : 1,
                    }}
                >
                    <input
                        type="file"
                        id="file-upload"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFileInput}
                        disabled={uploadProgress.active}
                    />
                    <label htmlFor="file-upload" style={{ cursor: uploadProgress.active ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ background: 'var(--panel-bg)', padding: '0.75rem', borderRadius: '50%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                            <Upload size={24} color="#8b5cf6" />
                        </div>
                        <div>
                            <span style={{ color: '#8b5cf6', fontWeight: 600 }}>点击挑选文件</span>
                            <span style={{ color: 'var(--text-muted)' }}> 上传发送至中继网盘</span>
                        </div>
                    </label>
                </div>

                {uploadProgress.active && (
                    <div style={{ marginBottom: '1rem', background: 'rgba(139, 92, 246, 0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                            <span style={{ color: '#a78bfa', fontWeight: 500 }}>
                                {uploadProgress.stage === 'encrypting'
                                    ? '🔒 正在准备加密通道...'
                                    : '🔒☁️ 正在安全加密并上传...'}
                            </span>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <span>{Math.round(uploadProgress.progress * 100)}%</span>
                                <button
                                    onClick={onCancelUpload}
                                    style={{
                                        padding: '2px 8px',
                                        fontSize: '0.7rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: '#ef4444',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <div className="progress-bar-bg" style={{ background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px' }}>
                            <div className="progress-bar-fill" style={{ height: '100%', width: `${uploadProgress.progress * 100}%`, background: '#8b5cf6', borderRadius: '3px', transition: 'width 0.2s' }} />
                        </div>
                    </div>
                )}

                        {downloadProgress.active && (
                    <div style={{ marginBottom: '1rem', background: 'rgba(59, 130, 246, 0.06)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.22)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', gap: '0.75rem' }}>
                            <span style={{ color: '#93c5fd', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                {downloadProgress.stage === 'saving'
                                    ? `💾 正在写入本地文件 ${downloadProgress.fileName}...`
                                    : downloadProgress.stage === 'decrypting'
                                    ? `🔓 正在收尾解密 ${downloadProgress.fileName}...`
                                    : `📥 正在下载并解密 ${downloadProgress.fileName}...`}
                            </span>
                            <span>{Math.round(downloadProgress.progress * 100)}%</span>
                        </div>
                        <div className="progress-bar-bg" style={{ background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px' }}>
                            <div className="progress-bar-fill" style={{ height: '100%', width: `${downloadProgress.progress * 100}%`, background: '#3b82f6', borderRadius: '3px', transition: 'width 0.2s' }} />
                        </div>
                    </div>
                )}

                {!supportsStreamSave && files.some((file) => file.encrypted) && (
                    <div style={{ marginBottom: '1rem', background: 'rgba(245, 158, 11, 0.08)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.24)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <Info size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '0.8rem', lineHeight: '1.5', color: '#fcd34d' }}>
                            当前浏览器不支持流式保存。下载加密文件时会先在浏览器内存中完成下载和解密，因此会占用电脑运行内存。
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>服务器物理留存 ({visibleFiles.length}/{files.length})</h3>
                            <span
                                style={{
                                    fontSize: '0.72rem',
                                    lineHeight: 1,
                                    padding: '0.3rem 0.45rem',
                                    borderRadius: '999px',
                                    border: supportsStreamSave
                                        ? '1px solid rgba(34, 197, 94, 0.28)'
                                        : '1px solid rgba(245, 158, 11, 0.28)',
                                    background: supportsStreamSave
                                        ? 'rgba(34, 197, 94, 0.1)'
                                        : 'rgba(245, 158, 11, 0.1)',
                                    color: supportsStreamSave ? '#86efac' : '#fcd34d',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {supportsStreamSave ? '流式保存已启用' : '内存回退模式'}
                            </span>
                            <div
                                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                                onMouseEnter={() => setShowStreamSaveHint(true)}
                                onMouseLeave={() => setShowStreamSaveHint(false)}
                            >
                                <button
                                    type="button"
                                    aria-label="流式保存说明"
                                    style={{
                                        padding: 0,
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94a3b8',
                                        width: '18px',
                                        height: '18px',
                                        minWidth: '18px',
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'help',
                                    }}
                                >
                                    <Info size={16} strokeWidth={2.1} />
                                </button>

                                {showStreamSaveHint && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            bottom: 'calc(100% + 10px)',
                                            left: '-8px',
                                            zIndex: 999,
                                            width: '320px',
                                            padding: '0.8rem 0.9rem',
                                            borderRadius: '12px',
                                            background: 'rgba(15, 23, 42, 0.96)',
                                            border: '1px solid rgba(167, 139, 250, 0.24)',
                                            boxShadow: '0 18px 40px rgba(0, 0, 0, 0.32)',
                                            backdropFilter: 'blur(10px)',
                                        }}
                                    >
                                        {supportsStreamSave ? (
                                            <>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ddd6fe', marginBottom: '0.45rem' }}>
                                                    流式保存说明
                                                </div>
                                                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.77rem', lineHeight: '1.6', color: '#cbd5e1' }}>
                                                    <li>当前访问环境已启用流式保存能力。</li>
                                                    <li>系统可在下载过程中直接写入本地文件，从而降低浏览器内存占用。</li>
                                                    <li>该能力通常依赖支持 File System Access API 的浏览器，以及 HTTPS 或 localhost 访问环境。</li>
                                                </ul>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ddd6fe', marginBottom: '0.45rem' }}>
                                                    内存回退模式说明
                                                </div>
                                                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.77rem', lineHeight: '1.6', color: '#cbd5e1' }}>
                                                    <li>当前访问环境未启用流式保存能力，下载加密文件时会先在浏览器内存中完成下载与解密。</li>
                                                    <li>如需切换到流式保存，建议使用较新的浏览器，并通过 HTTPS 或 localhost 访问系统。</li>
                                                    <li>局域网 HTTP 地址通常会被浏览器判定为不安全上下文，因此无法启用流式保存能力。</li>
                                                </ul>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {files.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={toggleSelectAll} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--panel-border)' }}>
                                    {visibleFiles.length > 0 && visibleFiles.every((file) => selectedIds.has(file.id)) ? '取消全选' : '全选'}
                                </button>
                                <button onClick={() => void handleBatchDownload()} disabled={selectedIds.size === 0} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                                    批量下载
                                </button>
                                <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                                    批量删除
                                </button>
                            </div>
                        )}
                    </div>

                    {files.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={() => setFileFilter('all')}
                                style={{
                                    padding: '0.3rem 0.55rem',
                                    fontSize: '0.72rem',
                                    background: fileFilter === 'all' ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255,255,255,0.03)',
                                    border: fileFilter === 'all' ? '1px solid rgba(59, 130, 246, 0.32)' : '1px solid var(--panel-border)',
                                    color: fileFilter === 'all' ? '#93c5fd' : 'var(--text-muted)',
                                }}
                            >
                                全部
                            </button>
                            <button
                                type="button"
                                onClick={() => setFileFilter('encrypted')}
                                style={{
                                    padding: '0.3rem 0.55rem',
                                    fontSize: '0.72rem',
                                    background: fileFilter === 'encrypted' ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255,255,255,0.03)',
                                    border: fileFilter === 'encrypted' ? '1px solid rgba(139, 92, 246, 0.32)' : '1px solid var(--panel-border)',
                                    color: fileFilter === 'encrypted' ? '#d8b4fe' : 'var(--text-muted)',
                                }}
                            >
                                已加密
                            </button>
                            <button
                                type="button"
                                onClick={() => setFileFilter('plain')}
                                style={{
                                    padding: '0.3rem 0.55rem',
                                    fontSize: '0.72rem',
                                    background: fileFilter === 'plain' ? 'rgba(34, 197, 94, 0.16)' : 'rgba(255,255,255,0.03)',
                                    border: fileFilter === 'plain' ? '1px solid rgba(34, 197, 94, 0.32)' : '1px solid var(--panel-border)',
                                    color: fileFilter === 'plain' ? '#86efac' : 'var(--text-muted)',
                                }}
                            >
                                未加密
                            </button>
                        </div>
                    )}

                    <div className="file-list-area">
                        {visibleFiles.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem' }}>此空间尚无缓存资料。</div>
                        ) : (
                            visibleFiles.map((file) => {
                                const metadataLocked = isLockedMetadataFile(file);
                                return (
                                <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                        <div onClick={() => toggleSelect(file.id)} style={{ cursor: 'pointer', color: selectedIds.has(file.id) ? '#3b82f6' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                            {selectedIds.has(file.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </div>
                                        <FileIcon size={20} color="#3b82f6" />
                                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '180px' }}>{file.fileName}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    {(file.fileSize / 1024 / 1024).toFixed(2)} MB • {file.senderId}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    lineHeight: 1,
                                                    padding: '0.22rem 0.38rem',
                                                    borderRadius: '999px',
                                                    border: file.encrypted
                                                        ? '1px solid rgba(139, 92, 246, 0.3)'
                                                        : '1px solid rgba(34, 197, 94, 0.28)',
                                                    background: file.encrypted
                                                        ? 'rgba(139, 92, 246, 0.12)'
                                                        : 'rgba(34, 197, 94, 0.1)',
                                                    color: file.encrypted ? '#d8b4fe' : '#86efac',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {file.encrypted ? '已加密' : '未加密'}
                                                </span>
                                                {metadataLocked && (
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        lineHeight: 1,
                                                        padding: '0.22rem 0.38rem',
                                                        borderRadius: '999px',
                                                        border: '1px solid rgba(245, 158, 11, 0.28)',
                                                        background: 'rgba(245, 158, 11, 0.1)',
                                                        color: '#fcd34d',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        文件名未解锁
                                                    </span>
                                                )}
                                            </div>
                                            {metadataLocked && (
                                                <span style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: '#fbbf24' }}>
                                                    文件内容仍可下载，但当前环境无法恢复原始文件名。
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {!metadataLocked && canPreview(file.fileName) && (
                                            <button onClick={() => void openPreview(file)} style={{ padding: '0.4rem', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="预览文件">
                                                <Eye size={16} />
                                            </button>
                                        )}
                                        <button onClick={() => void downloadFile(file)} style={{ padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title={file.encrypted ? '下载并解密文件' : '直接下载文件'}>
                                            <Download size={16} />
                                        </button>
                                        <button onClick={() => onDeleteFiles([file.id])} style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="从服务器彻底删除">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                            })
                        )}
                    </div>
                </div>
            </div>

            {previewFile && (
                <div onClick={closePreview} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, padding: '2rem', cursor: 'pointer',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{previewFile.fileName}</span>
                        <button onClick={closePreview} style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    </div>
                    <div onClick={(event) => event.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                        {previewLoading ? (
                            <div style={{ padding: '3rem', color: '#fff', textAlign: 'center' }}>正在强力解密中...</div>
                        ) : (
                            <>
                                {isImage(previewFile.fileName) && previewUrl && (
                                    <img src={previewUrl} alt={previewFile.fileName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', display: 'block' }} />
                                )}
                                {isPdf(previewFile.fileName) && previewUrl && (
                                    <iframe src={previewUrl} title={previewFile.fileName} style={{ width: '80vw', height: '80vh', border: 'none', borderRadius: '12px', background: '#fff' }} />
                                )}
                                {isText(previewFile.fileName) && (
                                    <div style={{
                                        width: '80vw', maxHeight: '80vh', overflow: 'auto',
                                        background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px', padding: '1.5rem',
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        fontSize: '0.85rem', lineHeight: '1.7', color: '#e2e8f0',
                                    }}>
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textContent}</pre>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
