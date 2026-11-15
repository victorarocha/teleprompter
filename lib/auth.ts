import { createHmac, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "teleprompter_session"

function tokenFor(password: string): string {
  return createHmac("sha256", password).update("v1").digest("hex")
}

function sameText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(leftBuffer, leftBuffer)
    return false
  }
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function passwordsMatch(input: string, expected: string): boolean {
  return sameText(input, expected)
}

export function sessionToken(password: string): string {
  return tokenFor(password)
}

export function isValidSession(token: string | undefined | null): boolean {
  const password = process.env.TELEPROMPTER_PASSWORD
  if (!password || !token) return false
  return sameText(token, tokenFor(password))
}
