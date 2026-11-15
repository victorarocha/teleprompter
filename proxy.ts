import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { isValidSession, SESSION_COOKIE } from "@/lib/auth"

export function proxy(request: NextRequest) {
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next()
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: ["/controller", "/controller/:path*"],
}
