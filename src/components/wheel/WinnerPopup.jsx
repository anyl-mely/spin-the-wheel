import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import '../../styles/wheel.css'

/**
 * WinnerPopup
 *
 * Props:
 *   winner       – winner name string
 *   spinNumber   – current spin #
 *   resultType   – 'fixed' | 'random'
 *   onClose      – callback: close popup
 *   onRemove     – callback: manually remove winner from wheel
 *   stageMode    – bool: if true, hide result type badge (clean presentation)
 *   autoRemove   – bool: if true, winner is already auto-removed, show only 1 simple continue button
 */
export default function WinnerPopup({
  winner,
  spinNumber,
  resultType,
  onClose,
  onRemove,
  stageMode = false,
  autoRemove = false,
}) {
  const hasPlayed = useRef(false)

  useEffect(() => {
    if (!hasPlayed.current) {
      hasPlayed.current = true
      confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.45 },
        colors: ['#ea4335', '#34a853', '#fbbc04', '#4285f4', '#fff'],
      })
      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6, x: 0.3 },
          colors: ['#ea4335', '#fbbc04'],
        })
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6, x: 0.7 },
          colors: ['#34a853', '#4285f4'],
        })
      }, 600)
    }
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="winner-overlay" onClick={onClose}>
      <div className="winner-card" onClick={(e) => e.stopPropagation()}>
        <span className="trophy">🏆</span>
        <h2>Spin #{spinNumber} – Winner!</h2>
        <div className="winner-name">{winner}</div>

        {/* Never show result type badge in Stage mode */}
        {!stageMode && (
          <span className={`spin-type-badge ${resultType === 'fixed' ? 'badge-fixed' : 'badge-random'}`}>
            {resultType === 'fixed' ? '⚙️ Fixed Result' : '🎲 Random'}
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {autoRemove ? (
            /* Auto-remove is ON: clean single button */
            <button
              className="close-btn"
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #ea4335, #c0392b)',
                fontSize: 16,
                padding: '12px 36px',
                minWidth: 160,
              }}
            >
              Tiếp tục →
            </button>
          ) : (
            /* Manual choice: Remove or Keep */
            <>
              {onRemove && (
                <button
                  className="close-btn"
                  onClick={onRemove}
                  style={{
                    background: 'linear-gradient(135deg, #ea4335, #c0392b)',
                    fontSize: 15,
                    padding: '12px 28px',
                  }}
                  title="Xóa người này khỏi vòng quay"
                >
                  ✕ Remove &amp; Continue
                </button>
              )}
              <button
                className="close-btn"
                onClick={onClose}
                style={{
                  background: onRemove
                    ? 'linear-gradient(135deg, #34a853, #2e7d32)'
                    : 'linear-gradient(135deg, #ea4335, #c0392b)',
                  fontSize: 15,
                  padding: '12px 28px',
                }}
                title="Giữ người này trong vòng quay"
              >
                {onRemove ? '✓ Keep in Wheel' : 'Tiếp tục →'}
              </button>
            </>
          )}
        </div>

        <p style={{ marginTop: 14, fontSize: 12, color: '#aaa' }}>
          Nhấn Enter hoặc Esc để tiếp tục
        </p>
      </div>
    </div>
  )
}
