import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LogOut, Trash2, Settings, Copy, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { roomService } from '../services/roomService'
import LoadingSpinner from '../components/shared/LoadingSpinner'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    loadRooms()
  }, [user])

  const loadRooms = async () => {
    if (!user) return
    setLoading(true)
    try {
      const data = await roomService.getMyRooms(user.id)
      setRooms(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newRoomName.trim()) return
    setCreating(true)
    setError('')
    try {
      const room = await roomService.createRoom(newRoomName.trim(), user.id)
      setRooms((prev) => [room, ...prev])
      setNewRoomName('')
      setShowCreate(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (roomId) => {
    if (!confirm('Delete this room and all its data?')) return
    try {
      await roomService.deleteRoom(roomId, user.id)
      setRooms((prev) => prev.filter((r) => r.id !== roomId))
    } catch (e) {
      setError(e.message)
    }
  }

  const handleCopyLink = async (room) => {
    const url = `${window.location.origin}/guest/${room.room_code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(room.id)
      setTimeout(() => setCopied(null), 2000)
    } catch (_) {}
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>🎡 SpinWheel Admin</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#666' }}>{user?.email}</span>
          <button
            className="btn-secondary"
            onClick={signOut}
            style={{ padding: '8px 16px', fontSize: 13 }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </header>

      <main className="dashboard-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Rooms</h2>
          <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} />
            Create Room
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Create room form */}
        {showCreate && (
          <form
            onSubmit={handleCreate}
            style={{
              background: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
              animation: 'fadeIn 0.2s ease forwards',
            }}
          >
            <h3 style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>New Room</h3>
            <div className="form-group">
              <label className="form-label">Room Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Class 10A Lucky Draw"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                autoFocus
                maxLength={80}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn-primary" disabled={creating || !newRoomName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowCreate(false); setNewRoomName('') }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <LoadingSpinner />
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <span style={{ fontSize: 48 }}>🎡</span>
            <h3>No rooms yet</h3>
            <p>Create your first room to start spinning!</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room) => (
              <div key={room.id} className="room-card">
                <div className="room-card-header">
                  <div>
                    <div className="room-name">{room.room_name}</div>
                    <span className="room-code-badge">{room.room_code}</span>
                  </div>
                  <span className={`status-badge status-${room.status}`}>
                    {room.status}
                  </span>
                </div>
                <div className="room-meta">
                  Created {new Date(room.created_at).toLocaleDateString()}
                  {' · '}Spin #{room.current_spin_count}
                </div>

                {/* Guest link box */}
                <div className="room-link-box" style={{ marginTop: 10 }}>
                  <span className="room-link-text">
                    {window.location.origin}/guest/{room.room_code}
                  </span>
                  <button
                    className={`btn-copy ${copied === room.id ? 'copied' : ''}`}
                    onClick={() => handleCopyLink(room)}
                  >
                    {copied === room.id ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>

                <div className="room-card-actions">
                  <button
                    className="btn-manage"
                    onClick={() => navigate(`/room/${room.id}`)}
                  >
                    <Settings size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Manage
                  </button>
                  <button
                    className="btn-delete-room"
                    onClick={() => handleDelete(room.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

