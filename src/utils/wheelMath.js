/**
 * Calculate the wheel rotation angle so that the winner segment
 * aligns with the top pointer (270° in canvas coordinates = top).
 *
 * @param {number} winnerIndex  - Zero-based index of the winning segment
 * @param {number} totalSegments
 * @param {number} currentRotation - Current accumulated rotation in degrees
 * @param {number} minSpins - Minimum full rotations (default 5)
 * @returns {number} Final accumulated rotation in degrees
 */
export function calculateTargetRotation(winnerIndex, totalSegments, currentRotation, minSpins = 5) {
  if (totalSegments === 0) return currentRotation

  const segAngle = 360 / totalSegments

  // Midpoint of the winning segment (in degrees from angle 0)
  // Segments are drawn clockwise starting at the current rotation angle
  // We want the midpoint of segment[winnerIndex] at the top (270°)
  // Canvas 0° = right, 270° = top
  // Segment i center = i * segAngle + segAngle/2 (from wheel's reference 0)
  const segCenter = winnerIndex * segAngle + segAngle / 2

  // How much additional rotation brings segCenter to the top pointer
  // Top pointer is at 270° in standard canvas angle (or -90°)
  // After rotating by R degrees, the segment at segCenter is at (segCenter + R) mod 360
  // We want (segCenter + R) mod 360 = 270
  // R = (270 - segCenter + 360*k) for some integer k

  const normalizedCurrent = ((currentRotation % 360) + 360) % 360
  let additionalRotation = (270 - segCenter - normalizedCurrent + 360) % 360

  // Ensure minimum spins
  additionalRotation += 360 * minSpins

  return currentRotation + additionalRotation
}

/** Convert degrees to radians */
export function toRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * Easing function: ease-out cubic
 * t is normalized time [0, 1]
 */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Easing function: ease-out quart (smoother deceleration)
 */
export function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4)
}

/**
 * Compute optimal font size for a segment label
 * based on segment arc length and wheel radius.
 */
export function computeFontSize(text, segAngle, radius, minSize = 9, maxSize = 20) {
  // Approximate available width: chord length at midRadius
  const midRadius = radius * 0.62
  const arcLen = 2 * midRadius * Math.sin(toRad(segAngle / 2)) * 0.88
  const charWidth = arcLen / Math.max(text.length, 1)
  const size = Math.min(maxSize, Math.max(minSize, charWidth * 1.6))
  return Math.round(size)
}

