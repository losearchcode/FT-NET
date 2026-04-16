import { useEffect, useRef, useState } from 'react';
import { Info, MessageSquare, Send } from 'lucide-react';
import type { P2PMessage, TextMessage } from '../types';

interface ChatBoxProps {
    messages: P2PMessage[];
    onSendMessage: (msg: string) => void | Promise<void>;
    myId: string;
}

export const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage, myId }) => {
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
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquare size={20} color="#f43f5e" />
                群组通讯录
            </h2>

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
