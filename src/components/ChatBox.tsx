import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Info } from 'lucide-react';
import type { P2PMessage, TextMessage } from '../types';

interface ChatBoxProps {
    messages: P2PMessage[];
    onSendMessage: (msg: string) => void;
    myId: string;
}

export const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage, myId }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    return (
        <div className="glass-panel animate-slide-up chat-container" style={{ animationDelay: '0.3s' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={20} color="#f43f5e" />
                群组通讯录
            </h2>

            <div className="messages-area">
                {messages.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        暂无人在大厅发话...
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        if (msg.type === 'SYS_MSG') {
                            return (
                                <div key={idx} style={{ textAlign: 'center', margin: '1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <Info size={14} /> {msg.content}
                                </div>
                            );
                        }

                        const textMsg = msg as TextMessage;
                        const isMe = textMsg.sender === 'me' || textMsg.senderName === myId;

                        return (
                            <div key={idx} className={`message ${isMe ? 'message-me' : 'message-remote'}`}>
                                {!isMe && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem', marginLeft: '0.5rem' }}>{textMsg.senderName || 'Unknown'}</div>}
                                <div className="message-bubble">
                                    {textMsg.content}
                                </div>
                                <div className="message-time">
                                    {new Date(textMsg.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="chat-input-area">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="向房间全部人广播..."
                />
                <button type="submit" disabled={!input.trim()} style={{ background: '#f43f5e' }}>
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
};
