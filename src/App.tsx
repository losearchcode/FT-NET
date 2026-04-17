import { useEffect, useRef } from 'react';
import { usePeer } from './hooks/usePeer';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ChatBox } from './components/ChatBox';
import { FileTransfer } from './components/FileTransfer';

function App() {
  const {
    peerId,
    refreshPeerId,
    roomPassword,
    hashedRoomId,
    encryptionKey,
    messages,
    files,
    onlineCount,
    roomCapabilities,
    uploadProgress,
    joinRoom,
    leaveRoom,
    sendText,
    uploadFile,
    cancelUpload,
    deleteFiles,
  } = usePeer();
  const mainContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (roomPassword && hashedRoomId) {
      mainContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [roomPassword, hashedRoomId]);

  return (
    <div className="app-container">
      <ConnectionPanel
        peerId={peerId}
        onRefreshPeerId={refreshPeerId}
        roomPassword={roomPassword}
        onlineCount={onlineCount}
        onJoin={joinRoom}
        onLeave={leaveRoom}
        roomCapabilities={roomCapabilities}
        supportsStreamSave={typeof (window as any).showSaveFilePicker === 'function'}
      />

      <div className="main-content" ref={mainContentRef}>
        {roomPassword && hashedRoomId && encryptionKey ? (
          <>
            <FileTransfer
              files={files}
              uploadProgress={uploadProgress}
              onUpload={uploadFile}
              onCancelUpload={cancelUpload}
              onDeleteFiles={deleteFiles}
              roomId={hashedRoomId}
              roomPassword={roomPassword}
              roomCapabilities={roomCapabilities}
            />
            <ChatBox
              messages={messages}
              onSendMessage={sendText}
              myId={peerId}
              roomCapabilities={roomCapabilities}
            />
          </>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.5, flexDirection: 'column', gap: '1rem' }}>
            <h1 style={{ fontSize: '2.5rem', margin: 0, letterSpacing: '2px', fontWeight: 600 }}>FT-NET</h1>
            <p style={{ letterSpacing: '1px' }}>👉 请先在左侧输入暗号密码进入加密房间 👈</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
