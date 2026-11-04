import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase/client'
import { roomService } from '../services/roomService'
import { participantService } from '../services/participantService'
import { spinService } from '../services/spinService'
import SpinWheel from '../components/wheel/SpinWheel'
import WinnerPopup from '../components/wheel/WinnerPopup'
import Sidebar from '../components/sidebar/Sidebar'
import Toolbar from '../components/shared/Toolbar'
import SpinHistory from '../components/admin/SpinHistory'
import LoadingSpinner from '../components/shared/LoadingSpinner'

export default function GuestPage() {
  const { roomCode } = useParams()
  const wheelRef = useRef(null)
  const channelRef = useRef(null)
  const processedEvents = useRef(new Set())

  const [room, setRoom] = useState(null)
  const [participants, setParticipants] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [error, setError] = useState('')
  const [winner, setWinner] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [wheelSize, setWheelSize] = useState(460)
  const [notFound, setNotFound] = useState(false)

  // Responsive wheel size
  useEffect(() => {
    const update = () => {
      const available = Math.min(
        window.innerWidth * 0.72 - 80,
        window.innerHeight - 160
      )
      setWheelSize(Math.max(260, Math.min(520, available)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    loadRoomByCode()
  }, [roomCode])

  const loadRoomByCode = async () => {
    setLoading(true)
    setError('')
    try {
      const roomData = await roomService.getRoomByCode(roomCode)
      if (!roomData) { setNotFound(true); return }
      setRoom(roomData)
      const [parts, histData] = await Promise.all([
        participantService.getParticipants(roomData.id),
        spinService.getHistory(roomData.id),
      ])
      setParticipants(parts)
      setHistory(histData)
      subscribeToRoom(roomData.id, parts)
    } catch (e) {
      if (e.code === 'PGRST116') setNotFound(true)
      else setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const subscribeToRoom = useCallback((roomId, initialParticipants) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`room-guest-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'spin_history', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const record = payload.new
          if (processedEvents.current.has(record.event_id)) return
          processedEvents.current.add(record.event_id)

          // Update history
          setHistory((prev) => {
            if (prev.some((h) => h.event_id === record.event_id)) return prev
            return [record, ...prev]
          })

          // Get latest participants for index lookup
          const currentParticipants = await participantService.getParticipants(roomId)
          setParticipants(currentParticipants)

          // Animate wheel
          const winnerIdx = currentParticipants.findIndex((p) => p.id === record.participant_id)
          if (winnerIdx >= 0 && wheelRef.current) {
            const duration = record.animation_duration || 5000
            wheelRef.current.animateTo(winnerIdx, duration, null, () => {
              // Fetch winner name
              const winnerParticipant = currentParticipants[winnerIdx]
              setWinner({
                name: winnerParticipant?.name || 'Winner',
                spinNumber: record.spin_number,
                resultType: record.result_type,
              })
              setRoom((prev) => prev ? { ...prev, current_spin_count: record.spin_number } : prev)
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        async () => {
          const parts = await participantService.getParticipants(roomId)
          setParticipants(parts)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          setRoom((prev) => (prev ? { ...prev, ...payload.new } : payload.new))
          const parts = await participantService.getParticipants(roomId)
          setParticipants(parts)
          if (payload.new?.current_spin_count === 0) {
            setHistory([])
            wheelRef.current?.resetRotation()
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected')
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('disconnected')
        else setConnectionStatus('connecting')
      })

    channelRef.current = channel
  }, [])

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  if (loading) return <LoadingSpinner fullscreen />

  if (notFound) {
    return (
      <div className="empty-state" style={{ height: '100vh', justifyContent: 'center' }}>
        <span style={{ fontSize: 64 }}>🎡</span>
        <h3>Room Not Found</h3>
        <p>The room code "{roomCode}" doesn't exist or has been deleted.</p>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Toolbar
        room={room}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onFullscreen={handleFullscreen}
        isAdmin={false}
        connectionStatus={connectionStatus}
      />

      <div className="app-body">
        {/* Wheel Area */}
        <div className="wheel-area">
          {error && (
            <div className="alert alert-error" style={{ position: 'absolute', top: 8, zIndex: 10 }}>
              {error}
            </div>
          )}

          <SpinWheel
            ref={wheelRef}
            participants={participants}
            size={wheelSize}
            colors={room?.settings?.colors}
          />

          {/* Info bar */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="spin-count">
              Completed spins: <strong>{room?.current_spin_count || 0}</strong>
            </span>
            <button
              className="btn-secondary"
              onClick={() => setShowHistory((v) => !v)}
              style={{ padding: '10px 18px' }}
            >
              History ({history.length})
            </button>
          </div>

          {/* Latest result */}
          {history.length > 0 && (
            <p style={{ color: '#666', fontSize: 14 }}>
              Last winner: <strong style={{ color: '#ea4335' }}>
                {history[0]?.participants?.name || history[0]?.participant_id?.slice(0, 8)}
              </strong>
            </p>
          )}

          {/* Guest notice */}
          <div className="alert alert-info" style={{ fontSize: 12, maxWidth: 380, textAlign: 'center' }}>
            👀 You are viewing as a Guest. The admin controls the wheel.
          </div>

          {/* History panel */}
          {showHistory && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 16,
                padding: 20,
                maxHeight: 280,
                overflowY: 'auto',
                width: '100%',
                maxWidth: 480,
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
            >
              <SpinHistory
                history={history}
                isAdmin={false}
                onDeleteAll={null}
              />
            </div>
          )}
        </div>

        {/* Sidebar (read-only) */}
        <Sidebar
          participants={participants}
          isAdmin={false}
          onAdd={null}
          onDelete={null}
          onRename={null}
          onShuffle={null}
          rules={[]}
          onRuleAdd={null}
          onRuleDelete={null}
          onRuleToggle={null}
          loading={false}
          spinHistory={history}
        />
      </div>

      {winner && (
        <WinnerPopup
          winner={winner.name}
          spinNumber={winner.spinNumber}
          resultType={winner.resultType}
          onClose={() => setWinner(null)}
        />
      )}
    </div>
  )
}
