import { cookies } from "next/headers"
import { connection } from "next/server"

import { isValidSession, SESSION_COOKIE } from "@/lib/auth"
import { getShow, updateShow } from "@/lib/show-store"
import { parseAction } from "@/lib/show-state"

export async function GET() {
  await connection()
  return Response.json(
    { show: getShow(), serverNow: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: Request) {
  await connection()
  const cookieStore = await cookies()
  if (!isValidSession(cookieStore.get(SESSION_COOKIE)?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = parseAction(body)
  if (!action) {
    return Response.json({ error: "Invalid action" }, { status: 400 })
  }

  return Response.json({ show: updateShow(action), serverNow: Date.now() })
}
