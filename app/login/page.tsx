"use client"

import { useActionState } from "react"

import { login } from "@/app/login/actions"

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {})

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Controller</h1>
        <p className="text-sm text-zinc-400">
          Enter the password from the server environment.
        </p>
      </div>
      <form className="flex flex-col gap-3" action={action}>
        <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="password">
          Password
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-lg border border-white/15 bg-zinc-950 px-3 py-3 text-base text-white outline-none focus:border-white/40"
          />
        </label>
        {state.error && (
          <p className="text-sm text-red-300" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-white px-3 py-3 text-base font-medium text-black disabled:opacity-50"
          disabled={pending}
        >
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  )
}
