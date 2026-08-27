import { useEffect, useRef, useState } from 'react';

// Minimal BotText re-renders **bold** for the floating widget too
function FcBotText({ text }) {
  function parseBold(str) {
    const parts = str.split(/(\*\*[^*\n]+\*\*)/g);
    if (parts.length === 1) return str;
    return parts.map((part, i) => {
      const m = part.match(/^\*\*([^*\n]+)\*\*$/);
      return m ? <strong key={i}>{m[1]}</strong> : part;
    });
  }
  const lines = text.split('\n').filter(Boolean);
  if (lines.length <= 1) return <>{parseBold(text)}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} style={{ display: 'block', marginBottom: i < lines.length - 1 ? '4px' : 0 }}>
          {parseBold(line)}
        </span>
      ))}
    </>
  );
}

export default function FloatingChatWidget({
  messages = [],
  isOpen,
  onOpen,
  onClose,
  onSend,
}) {
  const [inputVal, setInputVal]   = useState('');
  const [unread,   setUnread]     = useState(0);
  const msgsRef         = useRef(null);
  const prevCountRef    = useRef(messages.length);

  // Derive responding state from the messages list
  const isResponding = messages.some((m) => m.type === 'typing');

  // Scroll to bottom + count unread when minimised
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;

    if (!isOpen && messages.length > prevCountRef.current) {
      // Count new bot/combo messages as unread
      const newOnes = messages.slice(prevCountRef.current);
      const newBot  = newOnes.filter((m) => m.type === 'bot' || m.type === 'combo').length;
      if (newBot > 0) setUnread((u) => u + newBot);
    }
    prevCountRef.current = messages.length;
  }, [messages, isOpen]);

  // Clear badge when opened
  useEffect(() => { if (isOpen) setUnread(0); }, [isOpen]);

  const handleSend = () => {
    const text = inputVal.trim();
    if (!text || isResponding) return;
    setInputVal('');
    onSend?.(text);
  };

  const hasContent = messages.some((m) => m.type === 'bot' || m.type === 'user' || m.type === 'combo');

  return (
    <div className="fc-widget">
      {isOpen && (
        <div className="fc-panel">
          {/* ── Header ── */}
          <div className="fc-header">
            <div className="fc-avatar">A</div>
            <div className="fc-info">
              <div className="fc-title">ACN Bank AI</div>
              <div className="fc-status">
                <span className="fc-status-dot" />
                {isResponding ? 'Typing…' : 'Online'}
              </div>
            </div>
            <button className="fc-close" onClick={onClose} aria-label="Minimise chat">✕</button>
          </div>

          {/* ── Messages ── */}
          <div className="fc-messages" ref={msgsRef}>
            {!hasContent && !isResponding && (
              <div className="fc-empty">
                <div className="fc-empty-icon">💬</div>
                <p>Your conversation will appear here</p>
              </div>
            )}
            {messages.map((msg) => {
              if (msg.type === 'bot') return (
                <div key={msg.id} className="fc-bot-bubble">
                  <FcBotText text={msg.text} />
                </div>
              );
              if (msg.type === 'user') return (
                <div key={msg.id} className="fc-user-bubble">{msg.text}</div>
              );
              if (msg.type === 'typing') return (
                <div key={msg.id} className="fc-typing">
                  <span /><span /><span />
                </div>
              );
              // Combo / receipt / widget — show heading as bot bubble
              if (msg.type === 'combo' && msg.heading) return (
                <div key={msg.id} className="fc-bot-bubble">
                  <FcBotText text={msg.heading} />
                  {msg.actions?.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                      {msg.actions.length} option{msg.actions.length !== 1 ? 's' : ''} — open full chat to reply
                    </div>
                  )}
                </div>
              );
              if (msg.type === 'receipt') return (
                <div key={msg.id} className="fc-bot-bubble">
                  ✓ {msg.payload?.title || 'Done'}
                </div>
              );
              return null;
            })}
          </div>

          {/* ── Input ── */}
          <div className="fc-input-bar">
            <input
              className="fc-input"
              type="text"
              placeholder="Type a message…"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={isResponding}
              autoComplete="off"
              aria-label="Message input"
            />
            <button
              className="fc-send"
              onClick={handleSend}
              disabled={isResponding}
              aria-label="Send message"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        className="fc-fab"
        onClick={isOpen ? onClose : onOpen}
        title={isOpen ? 'Minimise chat' : 'Open ACN Bank AI chat'}
        aria-label={isOpen ? 'Minimise chat' : 'Open AI chat'}
      >
        {unread > 0 && !isOpen && (
          <span className="fc-badge">{unread > 9 ? '9+' : unread}</span>
        )}
        {isOpen ? (
          /* Down-chevron to minimise */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        ) : (
          /* Chat bubble icon */
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>
    </div>
  );
}
