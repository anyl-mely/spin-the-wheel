import { supabase } from '../supabase/client'

export const participantService = {
  async getParticipants(roomId) {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .order('position', { ascending: true })
    if (error) throw error
    return data
  },

  async addParticipants(roomId, names) {
    // Get current max position
    const { data: existing } = await supabase
      .from('participants')
      .select('position')
      .eq('room_id', roomId)
      .order('position', { ascending: false })
      .limit(1)

    const startPos = existing?.[0]?.position != null ? existing[0].position + 1 : 0

    const rows = names.map((name, i) => ({
      room_id: roomId,
      name: name.trim(),
      position: startPos + i,
      is_active: true,
    }))

    const { data, error } = await supabase
      .from('participants')
      .insert(rows)
      .select()
    if (error) throw error
    return data
  },

  async updateParticipant(id, updates) {
    const { data, error } = await supabase
      .from('participants')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteParticipant(id) {
    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async replaceParticipants(roomId, names) {
    // Delete all, then re-insert
    await supabase.from('participants').delete().eq('room_id', roomId)
    if (names.length === 0) return []
    const rows = names.map((name, i) => ({
      room_id: roomId,
      name: name.trim(),
      position: i,
      is_active: true,
    }))
    const { data, error } = await supabase.from('participants').insert(rows).select()
    if (error) throw error
    return data
  },

  async shuffleParticipants(roomId) {
    const participants = await participantService.getParticipants(roomId)
    const shuffled = [...participants].sort(() => Math.random() - 0.5)
    const updates = shuffled.map((p, i) => ({ id: p.id, position: i }))
    // Update positions
    for (const u of updates) {
      await supabase.from('participants').update({ position: u.position }).eq('id', u.id)
    }
    return participantService.getParticipants(roomId)
  },
}

