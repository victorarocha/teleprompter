import { connection } from "next/server"

import { getShow, subscribe } from "@/lib/show-store"

export async function GET() {
  await connection()
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const payload = JSON.stringify({ show: getShow(), serverNow: Date.now() })
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }

      send()
      unsubscribe = subscribe(() => {
        try {
          send()
        } catch {
          unsubscribe()
        }
      })
      heartbeat = setInterval(() => {
        try {
          send()
        } catch {
          if (heartbeat) clearInterval(heartbeat)
          unsubscribe()
        }
      }, 15_000)
    },
    cancel() {
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
