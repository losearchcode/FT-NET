import { useEffect, useRef, useState } from 'react';
import { Info, MessageSquare, Send, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { P2PMessage, TextMessage, RoomCapabilities } from '../types';

interface ChatBoxProps {
    messages: P2PMessage[];
    onSendMessage: (msg: string) => void | Promise<void>;
    myId: string;
    roomCapabilities: RoomCapabilities;
}

export const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage, myId, roomCapabilities }) => {
    const [input, setInput] = useState('');
    const messagesAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const messagesArea = messagesAreaRef.current;
        if (!messagesArea) {
            return;
        }

        messagesArea.scrollTo({
            top: messagesArea.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages]);

    const handleSend = (event: React.FormEvent) => {
        event.preventDefault();
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="glass-panel animate-slide-up chat-container" style={{ animationDelay: '0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageSquare size={20} color="#f43f5e" />
                    群组通讯录
                </h2>
                {roomCapabilities.messageCryptoV2Enabled ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }} title="房间成员均支持最高级别的 V2 端到端加密机制">
                        <ShieldCheck size={14} /> E2EE Secured v2
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }} title="部分成员客户端版本过低，已降级为兼容加密模式">
                        <ShieldAlert size={14} /> E2EE Secured v1
                    </div>
                )}
            </div>

            <div className="messages-area" ref={messagesAreaRef}>
                {messages.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        暂无人在大厅发言...
                    </div>
                ) : (
                    messages.map((message, index) => {
                        if (message.type === 'SYS_MSG') {
                            return (
                                <div key={index} style={{ textAlign: 'center', margin: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Info size={14} /> {message.content}
                                </div>
                            );
                        }

                        const textMessage = message as TextMessage;
                        const isMe = textMessage.sender === 'me' || textMessage.senderName === myId;

                        return (
                            <div key={index} className={`message ${isMe ? 'message-me' : 'message-remote'}`}>
                                {!isMe && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem', marginLeft: '0.5rem' }}>
                                        {textMessage.senderName || 'Unknown'}
                                    </div>
                                )}
                                <div className="message-bubble">
                                    {textMessage.content}
                                </div>
                                <div className="message-time">
                                    {new Date(textMessage.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <form onSubmit={handleSend} className="chat-input-area">
                <input
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="向房间全体成员广播..."
                />
                <button type="submit" disabled={!input.trim()} style={{ background: '#f43f5e' }}>
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
};
