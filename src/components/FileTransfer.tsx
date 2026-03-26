import { useCallback, useState } from 'react';
import { Upload, File as FileIcon, Download, Trash2, CheckSquare, Square } from 'lucide-react';
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

    const handleDrop = useCallback((e: any) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onUpload(file);
    }, [onUpload]);

    const handleFileInput = (e: any) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file);
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
    );
};
