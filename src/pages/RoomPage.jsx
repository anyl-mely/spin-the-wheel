import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSound } from '../hooks/useSound'
import { roomService } from '../services/roomService'
import { participantService } from '../services/participantService'
import { spinService } from '../services/spinService'
import { ruleService } from '../services/ruleService'
import { supabase } from '../supabase/client'
import SpinWheel from '../components/wheel/SpinWheel'
import WinnerPopup from '../components/wheel/WinnerPopup'
import Sidebar from '../components/sidebar/Sidebar'
import Toolbar from '../components/shared/Toolbar'
import SpinHistory from '../components/admin/SpinHistory'
import LoadingSpinner from '../components/shared/LoadingSpinner'
import { buildGuestUrl } from '../utils/roomCode'

export default function RoomPage() {
  const { roomId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { playTick, playWin } = useSound()

  const wheelRef = useRef(null)
  const channelRef = useRef(null)
  const isSpinningRef = useRef(false)

  const [room, setRoom] = useState(null)
  const [participants, setParticipants] = useState([])
  const [rules, setRules] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [wheelSize, setWheelSize] = useState(460)
  const [stageToken, setStageToken] = useState(null)      // UUID once generated
  const [generatingStage, setGeneratingStage] = useState(false)
  const [stageCopied, setStageCopied] = useState(false)
  const [autoRemove, setAutoRemove] = useState(false)     // auto-remove winner after spin

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

  // Load room data
  useEffect(() => {
    loadAll()
  }, [roomId])

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [roomData, parts, ruleData, histData] = await Promise.all([
        roomService.getRoom(roomId),
        participantService.getParticipants(roomId),
        ruleService.getRules(roomId),
        spinService.getHistory(roomId),
      ])
      // Check ownership
      if (roomData.owner_id !== user.id) {
        navigate('/dashboard')
        return
      }
      setRoom(roomData)
      setParticipants(parts)
      setRules(ruleData)
      setHistory(histData)
      if (roomData.stage_token) {
        setStageToken(roomData.stage_token)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room-admin-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'spin_history', filter: `room_id=eq.${roomId}` },
        (payload) => {
          // Another admin session or race condition safety: avoid double-animation
          handleIncomingSpinEvent(payload.new)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        () => { if (!isSpinningRef.current) refreshParticipants() }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        () => { if (!isSpinningRef.current) refreshParticipants() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` },
        () => { if (!isSpinningRef.current) refreshParticipants() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom((prev) => (prev ? { ...prev, ...payload.new } : payload.new))
          if (!isSpinningRef.current) refreshParticipants()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected')
        else if (status === 'CHANNEL_ERROR') setConnectionStatus('disconnected')
        else setConnectionStatus('connecting')
      })

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  const refreshParticipants = useCallback(async () => {
    const parts = await participantService.getParticipants(roomId)
    setParticipants(parts)
  }, [roomId])

  const handleIncomingSpinEvent = useCallback((spinRecord) => {
    // Update history
    setHistory((prev) => {
      const exists = prev.some((h) => h.id === spinRecord.id)
      if (exists) return prev
      return [spinRecord, ...prev]
    })
    // Update room spin count
    setRoom((prev) => prev ? { ...prev, current_spin_count: spinRecord.spin_number } : prev)
  }, [])

  // SPIN handler
  const handleSpin = async () => {
    if (isSpinningRef.current) return
    if (participants.length < 2) {
      setError('Add at least 2 participants before spinning.')
      return
    }
    setError('')
    isSpinningRef.current = true
    setSpinning(true)

    const spinParticipants = [...participants]

    try {
      // Call backend RPC
      const result = await spinService.performSpin(roomId)
      // result: { spin_number, participant_id, participant_name, result_type, event_id, animation_duration }

      // Find winner index in snapshot
      let winnerIdx = spinParticipants.findIndex((p) => p.id === result.participant_id)
      if (winnerIdx === -1) {
        winnerIdx = 0
      }

      const duration = result.animation_duration || 5000

      // Start tick sound loop
      let tickInterval = null
      if (soundEnabled) {
        let tickSpeed = 80
        tickInterval = setInterval(() => {
          playTick()
          tickSpeed = Math.min(tickSpeed + 8, 400)
          if (tickSpeed >= 380) {
            clearInterval(tickInterval)
            tickInterval = null
          }
        }, tickSpeed)
      }

      // Animate wheel
      wheelRef.current?.animateTo(
        winnerIdx,
        duration,
        null, // onTick
        () => {
          // Animation complete
          if (tickInterval) clearInterval(tickInterval)
          if (soundEnabled) playWin()
          setWinner({
            name: result.participant_name,
            spinNumber: result.spin_number,
            resultType: result.result_type,
            participantId: result.participant_id,
          })
          // Refresh room data
          setRoom((prev) => prev ? { ...prev, current_spin_count: result.spin_number } : prev)
          setHistory((prev) => {
            const exists = prev.some((h) => h.event_id === result.event_id)
            if (exists) return prev
            const newEntry = {
              id: result.id || Date.now(),
              spin_number: result.spin_number,
              participants: { name: result.participant_name },
              result_type: result.result_type,
              event_id: result.event_id,
              created_at: new Date().toISOString(),
            }
            return [newEntry, ...prev]
          })
          // Auto-remove winner if enabled (no popup remove needed)
          if (room?.settings?.auto_remove) {
            setParticipants((prev) => prev.filter((p) => p.id !== result.participant_id))
          }

          setSpinning(false)
          isSpinningRef.current = false
        }
      )
    } catch (e) {
      console.error('Spin error:', e)
      setError(e.message || 'Failed to spin. Please try again.')
      setSpinning(false)
      isSpinningRef.current = false
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset spin count and clear history?')) return
    try {
      await roomService.resetRoom(roomId)
      setHistory([])
      setRoom((prev) => (prev ? { ...prev, current_spin_count: 0 } : prev))
      wheelRef.current?.resetRotation()
      // Immediately restore all participants in local state
      const restored = await participantService.getParticipants(roomId)
      setParticipants(restored)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleColorsChange = async (newColors) => {
    try {
      const updatedSettings = { ...room?.settings, colors: newColors }
      setRoom((prev) => (prev ? { ...prev, settings: updatedSettings } : prev))
      await roomService.updateRoomSettings(roomId, updatedSettings)
    } catch (e) {
      console.error('Update colors error:', e)
    }
  }

  const handleToggleAutoRemove = async (checked) => {
    try {
      const updatedSettings = { ...room?.settings, auto_remove: checked }
      setRoom((prev) => (prev ? { ...prev, settings: updatedSettings } : prev))
      await roomService.updateRoomSettings(roomId, updatedSettings)
    } catch (e) {
      console.error('Update auto_remove error:', e)
    }
  }

  // Generate a Stage Link (token-based, no login needed for MC)
  const handleGenerateStageLink = async () => {
    setGeneratingStage(true)
    try {
      const token = await roomService.generateStageToken(roomId)
      setStageToken(token)
    } catch (e) {
      setError(e.message)
    } finally {
      setGeneratingStage(false)
    }
  }

  const stageLinkUrl = stageToken && room
    ? `${window.location.origin}/stage/${room.room_code}/${stageToken}`
    : null

  const handleCopyStageLink = async () => {
    if (!stageLinkUrl) return
    await navigator.clipboard.writeText(stageLinkUrl).catch(() => {})
    setStageCopied(true)
    setTimeout(() => setStageCopied(false), 2500)
  }

  // Remove winner from wheel (admin can do this from popup)
  const handleRemoveWinner = async () => {
    if (!winner?.participantId) { setWinner(null); return }
    try {
      await participantService.updateParticipant(winner.participantId, { is_active: false })
      setParticipants((prev) => prev.filter((p) => p.id !== winner.participantId))
    } catch (e) {
      setError(e.message)
    }
    setWinner(null)
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // Participant handlers
  const handleAddParticipants = async (names) => {
    try {
      const added = await participantService.addParticipants(roomId, names)
      setParticipants((prev) => [...prev, ...added])
    } catch (e) { setError(e.message) }
  }

  const handleDeleteParticipant = async (id) => {
    try {
      await participantService.deleteParticipant(id)
      setParticipants((prev) => prev.filter((p) => p.id !== id))
    } catch (e) { setError(e.message) }
  }

  const handleRenameParticipant = async (id, name) => {
    try {
      const updated = await participantService.updateParticipant(id, { name })
      setParticipants((prev) => prev.map((p) => p.id === id ? updated : p))
    } catch (e) { setError(e.message) }
  }

  const handleShuffle = async () => {
    try {
      const shuffled = await participantService.shuffleParticipants(roomId)
      setParticipants(shuffled)
    } catch (e) { setError(e.message) }
  }

  // Rule handlers
  const handleRuleAdd = async (spinNum, participantId) => {
    const rule = await ruleService.upsertRule(roomId, spinNum, participantId)
    setRules((prev) => {
      const exists = prev.findIndex((r) => r.spin_number === spinNum)
      if (exists >= 0) return prev.map((r, i) => i === exists ? rule : r)
      return [...prev, rule].sort((a, b) => a.spin_number - b.spin_number)
    })
  }

  const handleRuleDelete = async (id) => {
    await ruleService.deleteRule(id)
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  const handleRuleToggle = async (id, isActive) => {
    const updated = await ruleService.toggleRule(id, isActive)
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r))
  }

  const handleDeleteHistory = async () => {
    if (!confirm('Delete all spin history?')) return
    await spinService.deleteHistory(roomId)
    setHistory([])
  }

  if (loading) return <LoadingSpinner fullscreen />

  return (
    <div className="app-layout">
      <Toolbar
        room={room}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onFullscreen={handleFullscreen}
        isAdmin={true}
        connectionStatus={connectionStatus}
        onBack={() => navigate('/dashboard')}
      />

      <div className="app-body">
        {/* Wheel Area */}
        <div className="wheel-area">
          {error && (
            <div className="alert alert-error" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, minWidth: 280 }}>
              {error}
            </div>
          )}

          <SpinWheel
            ref={wheelRef}
            participants={participants}
            size={wheelSize}
            colors={room?.settings?.colors}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="spin-btn"
              onClick={handleSpin}
              disabled={spinning || participants.length < 2}
            >
              {spinning ? 'Spinning…' : 'SPIN'}
            </button>

            <button
              className="btn-secondary"
              onClick={() => setShowHistory((v) => !v)}
              style={{ padding: '12px 20px' }}
            >
              {showHistory ? 'Hide' : 'History'} ({history.length})
            </button>

            <button
              className="btn-secondary"
              onClick={handleReset}
              style={{ padding: '12px 20px' }}
            >
              Reset
            </button>
          </div>

          {/* Spin count */}
          {room && (
            <p className="spin-count">
              Spin #{room.current_spin_count + 1} next
              {rules.find((r) => r.spin_number === room.current_spin_count + 1 && r.is_active) && (
                <span style={{ marginLeft: 8, color: '#e65100', fontWeight: 700 }}>
                  ⚙️ Fixed: {rules.find((r) => r.spin_number === room.current_spin_count + 1 && r.is_active)?.participants?.name}
                </span>
              )}
            </p>
          )}

          {/* Guest link */}
          {room && (
            <div style={{ width: '100%', maxWidth: 440 }}>
              {/* Guest link */}
              <div className="room-link-box">
                <span className="room-link-text">👥 {buildGuestUrl(room.room_code)}</span>
                <button
                  className="btn-copy"
                  onClick={() => navigator.clipboard.writeText(buildGuestUrl(room.room_code))}
                >
                  Copy
                </button>
              </div>

              {/* Stage link */}
              {stageLinkUrl ? (
                <div className="room-link-box" style={{ marginTop: 6 }}>
                  <span className="room-link-text">🎬 {stageLinkUrl}</span>
                  <button
                    className={`btn-copy ${stageCopied ? 'copied' : ''}`}
                    onClick={handleCopyStageLink}
                  >
                    {stageCopied ? '✓' : 'Copy'}
                  </button>
                </div>
              ) : (
                <button
                  className="btn-secondary"
                  onClick={handleGenerateStageLink}
                  disabled={generatingStage}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 6, padding: '9px 0', fontSize: 13 }}
                >
                  {generatingStage ? 'Generating…' : '🎬 Generate Stage Link (MC Screen)'}
                </button>
              )}

              {/* Auto-remove toggle */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
                cursor: 'pointer', padding: '8px 12px', background: '#f9f9f9',
                borderRadius: 10, border: '1px solid #eee', fontSize: 13,
              }}>
                <input
                  type="checkbox"
                  checked={room?.settings?.auto_remove ?? false}
                  onChange={(e) => handleToggleAutoRemove(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>
                  <strong>Auto-remove winner</strong> from wheel after each spin
                </span>
              </label>
            </div>
          )}

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
                isAdmin={true}
                onDeleteAll={handleDeleteHistory}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <Sidebar
          participants={participants}
          isAdmin={true}
          onAdd={handleAddParticipants}
          onDelete={handleDeleteParticipant}
          onRename={handleRenameParticipant}
          onShuffle={handleShuffle}
          rules={rules}
          onRuleAdd={handleRuleAdd}
          onRuleDelete={handleRuleDelete}
          onRuleToggle={handleRuleToggle}
          loading={spinning}
          spinHistory={history}
          colors={room?.settings?.colors}
          onColorsChange={handleColorsChange}
        />
      </div>

      {/* Winner popup */}
      {winner && (
        <WinnerPopup
          winner={winner.name}
          spinNumber={winner.spinNumber}
          resultType={winner.resultType}
          stageMode={false}
          autoRemove={room?.settings?.auto_remove ?? false}
          onClose={() => setWinner(null)}
          onRemove={handleRemoveWinner}
        />
      )}
    </div>
  )
}

