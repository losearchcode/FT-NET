import { useState } from 'react';
import type { RoomCapabilities } from '../types';
import { DoorOpen, Globe, KeyRound, Users, RefreshCw } from 'lucide-react';

interface RoomLoginPanelProps {
    peerId: string;
    roomPassword: string | null;
    onlineCount: number;
    onJoin: (password: string) => void;
    onLeave: () => void;
    onRefreshPeerId?: () => void;
    roomCapabilities: RoomCapabilities;
    supportsStreamSave: boolean;
}

export const ConnectionPanel: React.FC<RoomLoginPanelProps> = ({ peerId, roomPassword, onlineCount, onJoin, onLeave, onRefreshPeerId, roomCapabilities, supportsStreamSave }) => {
    const [passwordInput, setPasswordInput] = useState('');

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput.trim()) {
            onJoin(passwordInput.trim());
        }
    };

    return (
        <div className="sidebar">
            <div className="glass-panel animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Globe size={20} color="#3b82f6" />
                    我的身份标识
                </h2>
                <div style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--panel-border)',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    letterSpacing: '1px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                }}>
                    <span>{peerId || '...'}</span>
                    {onRefreshPeerId && (
                        <button
                            onClick={onRefreshPeerId}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '4px',
                                cursor: 'pointer',
                                color: '#3b82f6',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                            title="刷新身份标识"
                        >
                            <RefreshCw size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel animate-slide-up" style={{ animationDelay: '0.2s', flex: 1 }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <KeyRound size={20} color="#10b981" />
                    安全房间管理
                </h2>

                {roomPassword ? (
                    <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--success)', marginBottom: '1rem', fontWeight: 600 }}>
                            在活跃房间中
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', marginBottom: '1rem', letterSpacing: '2px' }}>
                            {roomPassword}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                            <Users size={16} color="#3b82f6" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#3b82f6' }}>{onlineCount} 人在线</span>
                        </div>

                        {/* 安全状态摘要 */}
                        <div style={{
                            marginBottom: '1rem',
                            padding: '0.65rem 0.8rem',
                            background: 'rgba(15, 23, 42, 0.5)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '0.75rem',
                            lineHeight: '1.7',
                        }}>
                            <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#94a3b8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                🔒 安全状态摘要
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>消息加密</span>
                                    <span style={{ color: roomCapabilities.messageCryptoV2Enabled ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {roomCapabilities.messageCryptoV2Enabled ? 'AES-GCM v2' : 'AES-CBC v1'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>文件加密</span>
                                    <span style={{ color: roomCapabilities.fileCryptoV2Enabled ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {roomCapabilities.fileCryptoV2Enabled ? 'AES-GCM v2' : 'AES-CBC v1'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>文件名保护</span>
                                    <span style={{ color: roomCapabilities.fileCryptoV2Enabled ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {roomCapabilities.fileCryptoV2Enabled ? '已加密' : '明文'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>下载落盘</span>
                                    <span style={{ color: supportsStreamSave ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {supportsStreamSave ? '流式保存' : '内存回退'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>密钥体系</span>
                                    <span style={{ color: '#10b981', fontWeight: 600 }}>PBKDF2 + HKDF</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#94a3b8' }}>断点续传</span>
                                    <span style={{ color: roomCapabilities.fileCryptoV2Enabled ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                        {roomCapabilities.fileCryptoV2Enabled ? '已启用' : '不支持 (V1)'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onLeave} style={{ background: '#ef4444', border: '1px solid #7f1d1d' }}>
                            销毁并退出 <DoorOpen size={16} />
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                请输入房间统一密码（区分大小写）
                            </label>
                            <input
                                type="text"
                                placeholder="输入暗号..."
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                            />
                            {passwordInput && passwordInput.length < 6 && (
                                <div style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.5rem', fontWeight: 500 }}>
                                    ⚠️ 密码过短，加密强度较低，建议使用 6 位以上密码
                                </div>
                            )}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                            * 您将进入对应密码的公共空间。如果房间不存在将自动创立。当房间内人员全部退出后，存储的数据和历史记录将被永久销毁。
                        </p>
                        <button type="submit" disabled={!passwordInput.trim()}>
                            加入房间
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};
