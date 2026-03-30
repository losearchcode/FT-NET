import { useState } from 'react';
import { DoorOpen, Globe, KeyRound, Users } from 'lucide-react';

interface RoomLoginPanelProps {
    peerId: string;
    roomPassword: string | null;
    onlineCount: number;
    onJoin: (password: string) => void;
    onLeave: () => void;
}

export const ConnectionPanel: React.FC<RoomLoginPanelProps> = ({ peerId, roomPassword, onlineCount, onJoin, onLeave }) => {
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
                    letterSpacing: '1px'
                }}>
                    {peerId || '...'}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                            <Users size={16} color="#3b82f6" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#3b82f6' }}>{onlineCount} 人在线</span>
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
