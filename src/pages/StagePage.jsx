import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Volume2, VolumeX, Maximize2 } from 'lucide-react'
import { supabase } from '../supabase/client'
import { roomService } from '../services/roomService'
import { participantService } from '../services/participantService'
import { spinService } from '../services/spinService'
import SpinWheel from '../components/wheel/SpinWheel'
import WinnerPopup from '../components/wheel/WinnerPopup'
import ConnectionBadge from '../components/shared/ConnectionBadge'
import LoadingSpinner from '../components/shared/LoadingSpinner'
import { useSound } from '../hooks/useSound'
import { getSegmentColor } from '../utils/colors'

/**
 * StagePage — Host/MC presentation screen.
 *
 * URL: /stage/:roomCode/:stageToken
 *
 * Features:
 *  - Has SPIN button (so MC can press it in front of audience)
 *  - Clean wheel UI — NO Rules tab, NO Fixed/Random badge in popup
 *  - Winner popup shows "Remove from wheel" and "Keep in wheel" buttons
 *  - Syncs in real-time with Admin and Guest devices
 *  - No login required (token = auth)
 */
export default function StagePage() {
  const { roomCode, stageToken } = useParams()
  const { playTick, playWin } = useSound()

  const wheelRef       = useRef(null)
  const channelRef     = useRef(null)
  const isSpinningRef  = useRef(false)
  const processedEvents = useRef(new Set())

  const [room, setRoom]                   = useState(null)
  const [participants, setParticipants]   = useState([])
  const [history, setHistory]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [spinning, setSpinning]           = useState(false)
  const [winner, setWinner]               = useState(null)   // { name, spinNumber, participantId }
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [soundEnabled, setSoundEnabled]   = useState(true)
  const [error, setError]                 = useState('')
  const [notFound, setNotFound]           = useState(false)
  const [wheelSize, setWheelSize]         = useState(500)

  // Responsive wheel size — fills available space
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Stage mode: wheel is center-stage, sidebar is narrow
      const sidebarW = vw >= 900 ? 240 : 0
      const available = Math.min(vw - sidebarW - 48, vh - 180)
      setWheelSize(Math.max(280, Math.min(640, available)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Load room + participants
  useEffect(() => {
    if (!roomCode || !stageToken) return
    loadAll()
  }, [roomCode, stageToken])

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const roomData = await roomService.getRoomByCodeAndToken(roomCode, stageToken)
      if (!roomData) { setNotFound(true); return }
      setRoom(roomData)

      const [parts, hist] = await Promise.all([
        participantService.getParticipants(roomData.id),
        spinService.getHistory(roomData.id),
      ])
      setParticipants(parts)
      setHistory(hist)
      subscribeRealtime(roomData.id)
    } catch (e) {
      if (e?.code === 'PGRST116' || e?.message?.includes('Invalid')) {
        setNotFound(true)
      } else {
        setError(e.message || 'Failed to load room')
      }
    } finally {
      setLoading(false)
    }
  }

  const subscribeRealtime = useCallback((roomId) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`stage-${roomCode}-${stageToken.slice(0, 8)}`)
      // Sync participant changes (admin adds/removes)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        async () => {
          if (isSpinningRef.current) return // Do not disrupt active spin animation!
          const parts = await participantService.getParticipants(roomId)
          setParticipants(parts)
          wheelRef.current?.redraw()
        }
      )
      // Sync room updates (Admin resets room, changes theme/colors, changes auto_remove)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          setRoom((prev) => (prev ? { ...prev, ...payload.new } : payload.new))
          if (isSpinningRef.current) return // Do not refresh participants while wheel is actively spinning!
          const parts = await participantService.getParticipants(roomId)
          setParticipants(parts)
          if (payload.new?.current_spin_count === 0) {
            setHistory([])
            wheelRef.current?.resetRotation()
          }
        }
      )
      // Sync spin results from OTHER clients (e.g. admin spinning from their machine)
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
          setRoom((prev) => prev ? { ...prev, current_spin_count: record.spin_number } : prev)

          // Only animate if WE didn't trigger this spin
          if (!isSpinningRef.current) {
            const parts = await participantService.getParticipants(roomId)
            setParticipants(parts)
            const idx = parts.findIndex((p) => p.id === record.participant_id)
            if (idx >= 0 && wheelRef.current) {
              wheelRef.current.animateTo(idx, record.animation_duration || 5000, null, () => {
                setWinner({
                  name: parts[idx]?.name || 'Winner',
                  spinNumber: record.spin_number,
                  participantId: record.participant_id,
                })
              })
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')   setConnectionStatus('connected')
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('disconnected')
        else setConnectionStatus('connecting')
      })

    channelRef.current = channel
  }, [roomCode, stageToken])

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  // ── SPIN ──────────────────────────────────────────────────
  const handleSpin = async () => {
    if (isSpinningRef.current || spinning) return
    if (participants.length < 2) {
      setError('Need at least 2 participants.')
      return
    }
    setError('')
    isSpinningRef.current = true
    setSpinning(true)

    // Snapshot of participants currently on the wheel before spin request
    const spinParticipants = [...participants]

    try {
      const result = await spinService.performSpinStage(roomCode, stageToken)
      // result: { spin_number, participant_id, participant_name, result_type, event_id, animation_duration }

      processedEvents.current.add(result.event_id) // mark so realtime doesn't double-animate

      let winnerIdx = spinParticipants.findIndex((p) => p.id === result.participant_id)
      if (winnerIdx === -1) {
        winnerIdx = 0
      }

      const duration = result.animation_duration || 5000

      // Tick sound
      let tickInterval = null
      if (soundEnabled) {
        let speed = 80
        tickInterval = setInterval(() => {
          playTick()
          speed = Math.min(speed + 7, 380)
          if (speed >= 370) { clearInterval(tickInterval); tickInterval = null }
        }, speed)
      }

      wheelRef.current?.animateTo(winnerIdx, duration, null, () => {
        if (tickInterval) clearInterval(tickInterval)
        if (soundEnabled) playWin()

        setRoom((prev) => (prev ? { ...prev, current_spin_count: result.spin_number } : prev))
        setHistory((prev) => {
          if (prev.some((h) => h.event_id === result.event_id)) return prev
          return [{
            id: result.id || Date.now(),
            spin_number: result.spin_number,
            participants: { name: result.participant_name },
            result_type: result.result_type,
            event_id: result.event_id,
            created_at: new Date().toISOString(),
          }, ...prev]
        })

        setWinner({
          name: result.participant_name,
          spinNumber: result.spin_number,
          participantId: result.participant_id,
        })

        // If auto_remove is active in room settings, remove winner now that animation is done
        if (room?.settings?.auto_remove) {
          setParticipants((prev) => prev.filter((p) => p.id !== result.participant_id))
        }

        setSpinning(false)
        isSpinningRef.current = false
      })
    } catch (e) {
      console.error('Spin error:', e)
      setError(e.message || 'Spin failed. Try again.')
      setSpinning(false)
      isSpinningRef.current = false
    }
  }

  // ── REMOVE WINNER ─────────────────────────────────────────
  const handleRemoveWinner = async () => {
    if (!winner?.participantId) { setWinner(null); return }
    try {
      await spinService.deactivateParticipantStage(roomCode, stageToken, winner.participantId)
      // Update local list immediately (realtime will also fire)
      setParticipants((prev) => prev.filter((p) => p.id !== winner.participantId))
    } catch (e) {
      // Non-critical: just close popup even if remove fails
      console.error('Remove winner error:', e)
    }
    setWinner(null)
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  // ── RENDER ────────────────────────────────────────────────
  if (loading) return <LoadingSpinner fullscreen />

  if (notFound) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
        background: 'var(--color-bg)',
      }}>
        <span style={{ fontSize: 72 }}>🎡</span>
        <h2 style={{ fontSize: 24, fontWeight: 800 }}>Stage Link Invalid</h2>
        <p style={{ color: '#666', textAlign: 'center', maxWidth: 360 }}>
          This stage link is invalid or has been revoked. Ask the admin to generate a new Stage Link.
        </p>
      </div>
    )
  }

  const activeCount = participants.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f8f8f5' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 52, background: '#fff', borderBottom: '1px solid #e8e8e8',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🎡</span>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#ea4335' }}>
            {room?.room_name || 'Spin The Wheel'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ConnectionBadge status={connectionStatus} />
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: '#f5f5f5', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: soundEnabled ? '#ea4335' : '#aaa',
            }}
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={handleFullscreen}
            style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: '#f5f5f5', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#666',
            }}
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
      </div>

      {/* ── Main body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Wheel area */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 24, padding: 24, position: 'relative',
        }}>
          {error && (
            <div className="alert alert-error" style={{
              position: 'absolute', top: 8, left: '50%',
              transform: 'translateX(-50%)', zIndex: 10, minWidth: 280,
            }}>
              {error}
            </div>
          )}

          <SpinWheel
            ref={wheelRef}
            participants={participants}
            size={wheelSize}
            colors={room?.settings?.colors}
          />

          {/* SPIN button — large and prominent for stage */}
          <button
            className="spin-btn"
            onClick={handleSpin}
            disabled={spinning || activeCount < 2}
            style={{
              fontSize: 22,
              padding: '16px 64px',
              minWidth: 200,
              letterSpacing: 2,
            }}
          >
            {spinning ? '⏳ Spinning…' : '🎯 SPIN'}
          </button>

          {/* Spin counter */}
          <p style={{ color: '#999', fontSize: 14, fontWeight: 600 }}>
            Spin #{(room?.current_spin_count || 0) + 1} &nbsp;·&nbsp;
            <span style={{ color: '#ea4335' }}>{activeCount}</span> người còn lại
          </p>
        </div>

        {/* Sidebar — entries only, no rules */}
        {window.innerWidth >= 700 && (
          <div style={{
            width: 220, background: '#fff', borderLeft: '1px solid #e8e8e8',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Participants</span>
              <span style={{
                background: '#ea4335', color: '#fff', borderRadius: 12,
                padding: '2px 9px', fontSize: 12, fontWeight: 700,
              }}>
                {activeCount}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {participants.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px',
                }}>
                  <span style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: getSegmentColor(i, room?.settings?.colors),
                  }} />
                  <span style={{ fontSize: 13, color: '#333' }}>{p.name}</span>
                </div>
              ))}
              {activeCount === 0 && (
                <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: 24 }}>
                  All done! 🎉
                </p>
              )}
            </div>

            {/* Recent spins (last 5) */}
            {history.length > 0 && (
              <div style={{ borderTop: '1px solid #eee', padding: '10px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Recent
                </p>
                {history.slice(0, 5).map((h) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#ea4335', fontWeight: 700, minWidth: 22 }}>#{h.spin_number}</span>
                    <span style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.participants?.name || '?'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Winner popup — stageMode = true → no Fixed badge */}
      {winner && (
        <WinnerPopup
          winner={winner.name}
          spinNumber={winner.spinNumber}
          resultType="random"   // Always show as random — secret is safe
          stageMode={true}
          autoRemove={room?.settings?.auto_remove ?? false}
          onClose={() => setWinner(null)}
          onRemove={handleRemoveWinner}
        />
      )}
    </div>
  )
}

