import { supabase } from '../supabase/client'

export const ruleService = {
  async getRules(roomId) {
    const { data, error } = await supabase
      .from('spin_rules')
      .select('*, participants(name)')
      .eq('room_id', roomId)
      .order('spin_number', { ascending: true })
    if (error) throw error
    return data
  },

  async upsertRule(roomId, spinNumber, participantId) {
    const { data, error } = await supabase
      .from('spin_rules')
      .upsert(
        {
          room_id: roomId,
          spin_number: spinNumber,
          participant_id: participantId,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id,spin_number' }
      )
      .select('*, participants(name)')
      .single()
    if (error) throw error
    return data
  },

  async deleteRule(id) {
    const { error } = await supabase
      .from('spin_rules')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async toggleRule(id, isActive) {
    const { data, error } = await supabase
      .from('spin_rules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

