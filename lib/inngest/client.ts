import { EventSchemas, Inngest } from 'inngest'

/** Event catalog. Every event carries the batchId for tenant-free scoping. */
export type Events = {
  'outbound/batch.kickoff': { data: { batchId: string } }
  'outbound/lead.process': {
    data: { batchId: string; leadIds: string[]; drain?: boolean }
  }
}

export const inngest = new Inngest({
  id: 'outboundagent',
  schemas: new EventSchemas().fromRecord<Events>(),
})
