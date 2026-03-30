
import { usePeer } from './hooks/usePeer';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ChatBox } from './components/ChatBox';
import { FileTransfer } from './components/FileTransfer';

function App() {
  const {
    peerId, roomPassword, messages, files, onlineCount,
    uploadProgress, joinRoom, leaveRoom, sendText, uploadFile, deleteFiles
  } = usePeer();

  return (
    <div className="app-container">
      <ConnectionPanel
        peerId={peerId}
        roomPassword={roomPassword}
        onlineCount={onlineCount}
        onJoin={joinRoom}
        onLeave={leaveRoom}
      />

      <div className="main-content">
        {roomPassword ? (
          <>
            <FileTransfer
              files={files}
              uploadProgress={uploadProgress}
              onUpload={uploadFile}
              onDeleteFiles={deleteFiles}
              roomId={roomPassword}
            />
            <ChatBox
              messages={messages}
              onSendMessage={sendText}
              myId={peerId}
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
