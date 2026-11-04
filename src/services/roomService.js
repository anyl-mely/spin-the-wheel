import { supabase } from '../supabase/client'
import { generateRoomCode } from '../utils/roomCode.js'

export const roomService = {
  async createRoom(name, ownerId) {
    const roomCode = generateRoomCode()
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        room_name: name,
        room_code: roomCode,
        owner_id: ownerId,
        status: 'waiting',
        current_spin_count: 0,
        settings: { exclude_winners: false },
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getMyRooms(ownerId) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, participants(count)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getRoom(roomId) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()
    if (error) throw error
    return data
  },

  async generateStageToken(roomId) {
    const { data, error } = await supabase.rpc('generate_stage_token', { p_room_id: roomId })
    if (error) throw error
    return data // UUID string
  },

  async getRoomByCodeAndToken(roomCode, stageToken) {
    // Stage page: verify token + fetch room (no auth needed)
    const { data, error } = await supabase
      .from('rooms')
      .select('id, room_code, room_name, current_spin_count, status, settings')
      .eq('room_code', roomCode)
      .eq('stage_token', stageToken)
      .single()
    if (error) throw error
    return data
  },
  async getRoomByCode(roomCode) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single()
    if (error) throw error
    return data
  },

  async updateRoomSettings(roomId, settings) {
    const { data, error } = await supabase
      .from('rooms')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', roomId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRoomName(roomId, roomName) {
    const { data, error } = await supabase
      .from('rooms')
      .update({ room_name: roomName, updated_at: new Date().toISOString() })
      .eq('id', roomId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteRoom(roomId, ownerId) {
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .eq('owner_id', ownerId)
    if (error) throw error
  },

  async resetRoom(roomId) {
    // Calls RPC to reset spin count and clear history atomically
    const { data, error } = await supabase.rpc('reset_room', { p_room_id: roomId })
    if (error) throw error
    return data
  },
}
