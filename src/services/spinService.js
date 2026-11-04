import { supabase } from '../supabase/client'

export const spinService = {
  /**
   * Admin spin — requires auth session.
   */
  async performSpin(roomId) {
    const animationDuration = 5000 + Math.floor(Math.random() * 2000)
    const { data, error } = await supabase.rpc('perform_spin', {
      p_room_id: roomId,
      p_animation_duration: animationDuration,
    })
    if (error) throw error
    return data
  },

  /**
   * Stage spin — authenticated by stage_token, no login needed.
   */
  async performSpinStage(roomCode, stageToken) {
    const animationDuration = 5000 + Math.floor(Math.random() * 2000)
    const { data, error } = await supabase.rpc('perform_spin_stage', {
      p_room_code: roomCode,
      p_stage_token: stageToken,
      p_animation_duration: animationDuration,
    })
    if (error) throw error
    return data
  },

  /**
   * Remove (deactivate) a participant via stage token — no login needed.
   */
  async deactivateParticipantStage(roomCode, stageToken, participantId) {
    const { error } = await supabase.rpc('deactivate_participant_stage', {
      p_room_code: roomCode,
      p_stage_token: stageToken,
      p_participant_id: participantId,
    })
    if (error) throw error
  },

  async getHistory(roomId) {
    const { data, error } = await supabase
      .from('spin_history')
      .select('*, participants(name)')
      .eq('room_id', roomId)
      .order('spin_number', { ascending: false })
    if (error) throw error
    return data
  },

  async deleteHistory(roomId) {
    const { error } = await supabase
      .from('spin_history')
      .delete()
      .eq('room_id', roomId)
    if (error) throw error
  },

  async getLatestSpin(roomId) {
    const { data, error } = await supabase
      .from('spin_history')
      .select('*, participants(name)')
      .eq('room_id', roomId)
      .order('spin_number', { ascending: false })
      .limit(1)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data || null
  },
}


