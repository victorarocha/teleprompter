"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { passwordsMatch, SESSION_COOKIE, sessionToken } from "@/lib/auth"

export async function login(
  _previous: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const expected = process.env.TELEPROMPTER_PASSWORD
  if (!expected) {
    return {
      error: "Set TELEPROMPTER_PASSWORD on the server, then try again.",
    }
  }

  const password = String(formData.get("password") ?? "")
  if (!passwordsMatch(password, expected)) {
    return { error: "Wrong password." }
  }

  const headerList = await headers()
  const secure = headerList.get("x-forwarded-proto") === "https"
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  redirect("/controller")
}
