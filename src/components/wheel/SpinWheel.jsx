import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { getSegmentColor, getTextColor } from '../../utils/colors'
import { toRad, computeFontSize, calculateTargetRotation, easeOutQuart } from '../../utils/wheelMath'
import '../../styles/wheel.css'

/**
 * SpinWheel – HTML5 Canvas-based wheel.
 *
 * Props:
 *   participants: [{id, name, position}]
 *   rotation: number (current rotation in degrees, controlled externally)
 *   size: number (canvas px, default auto)
 *
 * Ref methods:
 *   animateTo(winnerIndex, duration, onTick, onComplete)
 *   getCurrentRotation()
 */
const SpinWheel = forwardRef(function SpinWheel({ participants, size = 500, colors }, ref) {
  const canvasRef = useRef(null)
  const rotationRef = useRef(0)   // accumulated degrees
  const rafRef = useRef(null)

  const drawWheel = useCallback((rotation) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const n = participants.length
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const radius = Math.min(cx, cy) - 4

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (n === 0) {
      // Empty state
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
      ctx.fillStyle = '#eee'
      ctx.fill()
      ctx.fillStyle = '#999'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Add names to start', cx, cy)
      return
    }

    const segAngle = 360 / n
    const rotRad = toRad(rotation - 90) // -90 so first segment starts at top

    for (let i = 0; i < n; i++) {
      if (!participants[i] || !participants[i].name) continue
      const startAngle = rotRad + toRad(i * segAngle)
      const endAngle   = rotRad + toRad((i + 1) * segAngle)
      const color = getSegmentColor(i, colors)

      // Draw segment
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()

      // Segment border
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw text
      const midAngle = startAngle + toRad(segAngle / 2)
      const textRadius = radius * 0.64
      const fontSize = computeFontSize(participants[i].name, segAngle, radius)

      ctx.save()
      ctx.translate(
        cx + textRadius * Math.cos(midAngle),
        cy + textRadius * Math.sin(midAngle)
      )
      ctx.rotate(midAngle + Math.PI / 2)
      ctx.fillStyle = getTextColor(color)
      ctx.font = `700 ${fontSize}px 'Google Sans', 'Segoe UI', sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Truncate long names
      let name = participants[i].name || ''
      const maxW = radius * 0.45
      if (ctx.measureText(name).width > maxW) {
        while (ctx.measureText(name + '…').width > maxW && name.length > 1) {
          name = name.slice(0, -1)
        }
        name += '…'
      }
      ctx.fillText(name, 0, 0)
      ctx.restore()
    }

    // Center circle
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.14, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 4
    ctx.stroke()
  }, [participants, colors])

  // Redraw when participants change or on first render
  useEffect(() => {
    drawWheel(rotationRef.current)
  }, [drawWheel])

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    animateTo(winnerIndex, duration = 5000, onTick, onComplete) {
      const totalSegments = participants.length
      if (totalSegments === 0) {
        onComplete?.()
        return
      }

      const safeWinnerIndex = Math.max(0, Math.min(winnerIndex, totalSegments - 1))

      const targetRotation = calculateTargetRotation(
        safeWinnerIndex,
        totalSegments,
        rotationRef.current,
        5
      )

      const startRotation = rotationRef.current
      const startTime = performance.now()

      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      const animate = (now) => {
        try {
          const elapsed = now - startTime
          const progress = Math.min(elapsed / duration, 1)
          const easedProgress = easeOutQuart(progress)

          const currentRotation = startRotation + (targetRotation - startRotation) * easedProgress
          rotationRef.current = currentRotation
          drawWheel(currentRotation)
          onTick?.(currentRotation, progress)

          if (progress < 1) {
            rafRef.current = requestAnimationFrame(animate)
          } else {
            rotationRef.current = targetRotation
            drawWheel(targetRotation)
            onComplete?.()
          }
        } catch (err) {
          console.error('Animation error:', err)
          onComplete?.()
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    },

    getCurrentRotation() {
      return rotationRef.current
    },

    resetRotation() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rotationRef.current = 0
      drawWheel(0)
    },

    redraw() {
      drawWheel(rotationRef.current)
    },
  }), [drawWheel, participants])

  return (
    <div className="wheel-wrapper" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="wheel-canvas"
        style={{ width: size, height: size }}
      />
      <div className="wheel-pointer" />
    </div>
  )
})

export default SpinWheel

