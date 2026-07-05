import { batchKickoff } from './batch-kickoff'
import { leadProcess } from './lead-process'

/** All Inngest functions, registered with the serve handler. */
export const functions = [batchKickoff, leadProcess]
