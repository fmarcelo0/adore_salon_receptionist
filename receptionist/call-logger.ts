// Per-call transcript logging for real phone calls.
//
// The Twilio media stream reconnects between every turn (each reply opens a new
// <Stream>), so there's no single reliable "call ended" moment. Instead we
// append each turn to one file per call, keyed by Twilio's callSid, as the turn
// happens — the transcript builds up incrementally and is complete on disk even
// if the call drops. Output matches the demo transcript format so both are
// interchangeable when sharing with Booker/Mindbody.
//
// Logging never throws into the call flow: any failure is caught and logged so a
// disk hiccup can't drop a live call.

import * as fs from 'fs'
import * as path from 'path'
import { CALL_LOG_DIR } from '../app-constants'

export interface CallTurn {
  callSid: string
  callerPhone?: string | null
  caller?: any                 // resolved caller record, if recognized
  userText: string             // what the caller said this turn
  toolCalls: { name: string; input: any; result: string }[]
  reply: string                // what the receptionist said back
}

// callSid -> transcript file path. Lets turns from the same call append to one
// file across the stream reconnects.
const openCalls = new Map<string, string>()

// Create the transcript file (with a header) on the first turn of a call, or
// return the existing path on later turns.
function ensureFile(callSid: string, callerPhone?: string | null, caller?: any): string {
  const existing = openCalls.get(callSid)
  if (existing) return existing

  fs.mkdirSync(CALL_LOG_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(CALL_LOG_DIR, `call-${stamp}-${(callSid || 'unknown').slice(-8)}.txt`)

  const header = [
    'Adore Salon — AI Receptionist call transcript',
    `Date: ${new Date().toString()}`,
    `Call SID: ${callSid || 'unknown'}`,
    `Caller phone: ${callerPhone || 'unknown'}`,
    caller ? `[caller recognized: ${caller.firstName} ${caller.lastName}, `
      + `${caller.appointments?.length ?? 0} upcoming appointment(s)]` : '',
    '='.repeat(60),
    ''
  ].filter(Boolean).join('\n') + '\n'

  fs.writeFileSync(file, header)
  openCalls.set(callSid, file)
  return file
}

// Append one turn (caller line, any tool actions, receptionist reply) to the
// call's transcript.
export function logCallTurn({ callSid, callerPhone, caller, userText, toolCalls, reply }: CallTurn): void {
  try {
    const file = ensureFile(callSid, callerPhone, caller)
    const lines = [`Caller: ${userText}`]
    for (const t of toolCalls) {
      lines.push(`[action: ${t.name}(${JSON.stringify(t.input)}) -> ${t.result}]`)
    }
    const spoken = reply.includes('TRANSFER') ? '(transferred to a human)' : reply
    lines.push(`Receptionist: ${spoken}`, '')
    fs.appendFileSync(file, lines.join('\n') + '\n')
  } catch (err: any) {
    console.error('call-logger failed:', err.message)
  }
}

// Close out a call's transcript and stop tracking it. Called when the call's
// conversation is purged, so the map doesn't grow forever.
export function endCallLog(callSid: string): void {
  const file = openCalls.get(callSid)
  if (!file) return
  try {
    fs.appendFileSync(file, '[end of call]\n')
  } catch (err: any) {
    console.error('call-logger failed:', err.message)
  }
  openCalls.delete(callSid)
}
