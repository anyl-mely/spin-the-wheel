/** Generate a random room code like "A3B7K2" */
export function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** Build a public guest URL from room code */
export function buildGuestUrl(roomCode) {
  return `${window.location.origin}/guest/${roomCode}`
}

