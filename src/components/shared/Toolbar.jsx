import { Volume2, VolumeX, Maximize2, Link, ArrowLeft } from 'lucide-react'
import ConnectionBadge from './ConnectionBadge'
import { buildGuestUrl } from '../../utils/roomCode'

export default function Toolbar({
  room,
  soundEnabled,
  onToggleSound,
  onFullscreen,
  isAdmin,
  connectionStatus,
  onBack,
}) {
  const handleCopyLink = () => {
    if (!room) return
    const url = buildGuestUrl(room.room_code)
    navigator.clipboard.writeText(url).catch(() => {})
    // Brief visual feedback handled by parent if needed
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {onBack && (
          <button className="toolbar-btn" onClick={onBack} title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
        )}
        <span className="toolbar-title">
          {room?.room_name || 'Spin The Wheel'}
        </span>
        {room && (
          <span style={{ fontSize: 12, color: '#999', fontFamily: 'monospace' }}>
            #{room.room_code}
          </span>
        )}
      </div>
      <div className="toolbar-right">
        <ConnectionBadge status={connectionStatus} />
        <button
          className={`toolbar-btn ${soundEnabled ? 'active' : ''}`}
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute' : 'Unmute'}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {isAdmin && room && (
          <button className="toolbar-btn" onClick={handleCopyLink} title="Copy guest link">
            <Link size={18} />
          </button>
        )}
        <button className="toolbar-btn" onClick={onFullscreen} title="Fullscreen">
          <Maximize2 size={18} />
        </button>
      </div>
    </div>
  )
}

