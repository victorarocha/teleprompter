import Link from "next/link"

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold">Teleprompter</h1>
      <div className="grid gap-3">
        <Link
          href="/controller"
          className="rounded-lg bg-white px-4 py-4 text-center text-base font-medium text-black"
        >
          Controller
        </Link>
        <Link
          href="/display"
          className="rounded-lg border border-white/15 px-4 py-4 text-center text-base font-medium"
        >
          Display
        </Link>
      </div>
      <p className="text-sm leading-6 text-zinc-400">
        Install each screen from the browser menu. Use the controller on the phone and the display on the other device.
      </p>
    </main>
  )
}
