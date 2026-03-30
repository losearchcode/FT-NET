import { useCallback, useState, useEffect } from 'react';
import { Upload, File as FileIcon, Download, Trash2, CheckSquare, Square, Eye, X } from 'lucide-react';
import type { FileMetadata } from '../types';

interface FileTransferProps {
    roomId: string;
    files: FileMetadata[];
    uploadProgress: { progress: number, active: boolean };
    onUpload: (file: File) => void;
    onDeleteFiles: (ids: string[]) => void;
}

export const FileTransfer = ({ roomId, files, uploadProgress, onUpload, onDeleteFiles }: FileTransferProps) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [textLoading, setTextLoading] = useState(false);

    const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(name);
    const isPdf = (name: string) => /\.pdf$/i.test(name);
    const isText = (name: string) => /\.(txt|md|markdown|json|csv|log|yaml|yml|xml|js|jsx|ts|tsx|css|scss|less|html|htm|sh|bash|bat|cmd|py|java|c|cpp|h|hpp|go|rs|toml|ini|conf|cfg|env|sql|vue|svelte)$/i.test(name);
    const canPreview = (name: string) => isImage(name) || isPdf(name) || isText(name);

    // 文本文件预览：打开预览时自动 fetch 文件内容
    useEffect(() => {
        if (previewFile && isText(previewFile.fileName)) {
            setTextLoading(true);
            setTextContent(null);
            fetch(`/download/${roomId}/${previewFile.id}?preview=1`)
                .then(res => res.text())
                .then(text => {
                    setTextContent(text);
                    setTextLoading(false);
                })
                .catch(() => {
                    setTextContent('⚠️ 文件内容加载失败');
                    setTextLoading(false);
                });
        } else {
            setTextContent(null);
        }
    }, [previewFile, roomId]);

    const handleDrop = useCallback((e: any) => {
        e.preventDefault();
        const droppedFiles = e.dataTransfer.files;
        for (let i = 0; i < droppedFiles.length; i++) {
            onUpload(droppedFiles[i]);
        }
    }, [onUpload]);

    const handleFileInput = (e: any) => {
        const selectedFiles = e.target.files;
        if (selectedFiles) {
            for (let i = 0; i < selectedFiles.length; i++) {
                onUpload(selectedFiles[i]);
            }
        }
    };

    const downloadFile = (file: FileMetadata) => {
        const url = `/download/${roomId}/${file.id}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = file.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === files.length && files.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(files.map(f => f.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBatchDelete = () => {
        if (selectedIds.size > 0) {
            onDeleteFiles(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    };

    const handleBatchDownload = async () => {
        const ids = Array.from(selectedIds);
        for (const id of ids) {
            const file = files.find(f => f.id === id);
            if (file) {
                downloadFile(file);
                await new Promise(r => setTimeout(r, 400));
            }
        }
    };

    return (
    <>
        <div className="glass-panel animate-slide-up file-transfer-container">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileIcon size={20} color="#8b5cf6" />
                群组公共存储柜
            </h2>

            <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                style={{
                    border: '2px dashed var(--panel-border)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    background: 'rgba(15, 23, 42, 0.4)',
                    cursor: uploadProgress.active ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    marginBottom: '1rem',
                    opacity: uploadProgress.active ? 0.5 : 1
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
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                        <span>正托管至云端...</span>
                        <span>{Math.round(uploadProgress.progress * 100)}%</span>
                    </div>
                    <div className="progress-bar-bg" style={{ background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px' }}>
                        <div className="progress-bar-fill" style={{ height: '100%', width: `${uploadProgress.progress * 100}%`, background: '#8b5cf6', borderRadius: '3px', transition: 'width 0.2s' }}></div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>服务器物理留存 ({files.length})</h3>
                    {files.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={toggleSelectAll} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--panel-border)' }}>
                                {selectedIds.size === files.length ? '取消全选' : '全选'}
                            </button>
                            <button onClick={handleBatchDownload} disabled={selectedIds.size === 0} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                                批量下载
                            </button>
                            <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                                批量删除
                            </button>
                        </div>
                    )}
                </div>

                <div className="file-list-area">
                    {files.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem' }}>此空间尚无缓存资料。</div>
                    ) : (
                        files.map((file) => (
                            <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                                    <div onClick={() => toggleSelect(file.id)} style={{ cursor: 'pointer', color: selectedIds.has(file.id) ? '#3b82f6' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        {selectedIds.has(file.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </div>
                                    <FileIcon size={20} color="#3b82f6" />
                                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '180px' }}>{file.fileName}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            {(file.fileSize / 1024 / 1024).toFixed(2)} MB • {file.senderId}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {canPreview(file.fileName) && (
                                        <button onClick={() => setPreviewFile(file)} style={{ padding: '0.4rem', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="预览文件">
                                            <Eye size={16} />
                                        </button>
                                    )}
                                    <button onClick={() => downloadFile(file)} style={{ padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="点此从服务器下载">
                                        <Download size={16} />
                                    </button>
                                    <button onClick={() => onDeleteFiles([file.id])} style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }} title="从服务器彻底删除">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* 文件预览弹窗 */}
        {previewFile && (
            <div onClick={() => setPreviewFile(null)} style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, padding: '2rem', cursor: 'pointer'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>{previewFile.fileName}</span>
                    <button onClick={() => setPreviewFile(null)} style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    {isImage(previewFile.fileName) && (
                        <img src={`/download/${roomId}/${previewFile.id}?preview=1`} alt={previewFile.fileName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', display: 'block' }} />
                    )}
                    {isPdf(previewFile.fileName) && (
                        <iframe src={`/download/${roomId}/${previewFile.id}?preview=1`} title={previewFile.fileName} style={{ width: '80vw', height: '80vh', border: 'none', borderRadius: '12px', background: '#fff' }} />
                    )}
                    {isText(previewFile.fileName) && (
                        <div style={{
                            width: '80vw', maxHeight: '80vh', overflow: 'auto',
                            background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px', padding: '1.5rem',
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            fontSize: '0.85rem', lineHeight: '1.7', color: '#e2e8f0'
                        }}>
                            {textLoading ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>正在加载文件内容...</div>
                            ) : (
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{textContent}</pre>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}
    </>
    );
};
