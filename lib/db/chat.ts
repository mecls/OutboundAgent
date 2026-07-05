import { supabaseService } from '@/lib/supabase/service'

export interface ChatRow {
  id: string
  lead_id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  reasoning: string | null
  tool_calls: unknown | null
  created_at: string
}

export async function listChat(leadId: string): Promise<ChatRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_chat_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listChat failed: ${error.message}`)
  return (data ?? []) as ChatRow[]
}

export async function addChat(
  leadId: string,
  role: ChatRow['role'],
  content: string,
): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_chat_messages')
    .insert({ lead_id: leadId, role, content })
  if (error) throw new Error(`addChat failed: ${error.message}`)
}
