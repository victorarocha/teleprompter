import { cookies, headers } from "next/headers"
import { getRequestConfig } from "next-intl/server"

type Locale = "en" | "es"

function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "es"
}

function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return "en"
  const ranked = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";")
      const quality = params.find((param) => param.trim().toLowerCase().startsWith("q="))
      const q = quality ? Number(quality.split("=")[1]) : 1
      return {
        tag: rawTag.trim().toLowerCase(),
        q: Number.isFinite(q) ? q : 0,
      }
    })
    .filter((item) => item.tag.length > 0)
    .sort((a, b) => b.q - a.q)
  const primary = ranked[0]?.tag ?? ""
  return primary === "es" || primary.startsWith("es-") ? "es" : "en"
}

async function loadMessages(locale: Locale) {
  switch (locale) {
    case "es":
      return (await import("../messages/es.json")).default
    case "en":
      return (await import("../messages/en.json")).default
  }
}

export default getRequestConfig(async () => {
  const requested = (await cookies()).get("locale")?.value
  const locale = isLocale(requested)
    ? requested
    : localeFromAcceptLanguage((await headers()).get("accept-language"))

  return {
    locale,
    messages: await loadMessages(locale),
  }
})
