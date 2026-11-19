/*
 * Reine Funktionen — portiert aus dem Userscript xDSH Costs (v2.0.3),
 * dieselben Parser und dieselbe Peak-/Feiertagslogik.
 * Diese Datei wird von Node (test/parse.test.mjs) und vom GUI-Bundle geladen,
 * damit es nur eine Quelle der Wahrheit gibt.
 */

/** Zahl aus "17.48" | 17.48 | "1,234.56" — sonst null. */
export function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const cleaned = value.trim().replace(/,/g, "")
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Token aus dem localStorage-Rohwert (String oder appKit-JSON-Wrapper). */
export function parseToken(raw) {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed)
    if (typeof obj === "string") return obj.length >= 20 ? obj : null
    if (obj && typeof obj === "object") {
      for (const key of ["value", "token", "access_token", "accessToken", "userToken"]) {
        const v = obj[key]
        if (typeof v === "string" && v.length >= 20 && !/\s/.test(v)) return v
      }
    }
    return null
  } catch (e) {
    /* kein JSON → Rohwert prüfen */
  }
  const unquoted = /^["'].*["']$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
  return unquoted.length >= 20 && !/\s/.test(unquoted) ? unquoted : null
}

/** "YYYY-MM-DD" des lokalen Tages. */
export function localDayIso(date) {
  const d = date || new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "YYYY-MM-DD" des UTC-Tages. */
export function utcDayIso(date) {
  const d = date || new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/* Amtlicher chinesischer Feiertagsplan; Peak-Regel verweist darauf.
   Neuer Jahresplan muss hier ergänzt werden. */
const CHINA_HOLIDAY_RANGES = {
  2026: [
    ["2026-01-01", "2026-01-03"],
    ["2026-02-15", "2026-02-23"],
    ["2026-04-04", "2026-04-06"],
    ["2026-05-01", "2026-05-05"],
    ["2026-06-19", "2026-06-21"],
    ["2026-09-25", "2026-09-27"],
    ["2026-10-01", "2026-10-07"],
  ],
}

export function chineseCalendarParts(dayIso) {
  try {
    const date = new Date(dayIso + "T12:00:00Z")
    const parts = new Intl.DateTimeFormat("en-u-ca-chinese", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date)
    const value = (type) => Number((parts.find((part) => part.type === type) || {}).value)
    const month = value("month")
    const day = value("day")
    return Number.isFinite(month) && Number.isFinite(day) ? { month, day } : null
  } catch (e) {
    return null
  }
}

/** Gesetzlicher Feiertagskern als Rückfall für Jahre ohne Jahresplan. */
export function isStatutoryChineseHoliday(dayIso) {
  const monthDay = String(dayIso || "").slice(5)
  if (["01-01", "05-01", "05-02", "10-01", "10-02", "10-03"].includes(monthDay)) return true

  const year = Number(String(dayIso || "").slice(0, 4))
  if (Number.isFinite(year) && monthDay.startsWith("04-")) {
    const yy = year % 100
    const qingmingDay = Math.floor(yy * 0.2422 + 4.81) - Math.floor(yy / 4)
    if (Number(monthDay.slice(3)) === qingmingDay) return true
  }

  const lunar = chineseCalendarParts(dayIso)
  if (
    lunar &&
    ((lunar.month === 1 && lunar.day >= 1 && lunar.day <= 3) ||
      (lunar.month === 5 && lunar.day === 5) ||
      (lunar.month === 8 && lunar.day === 15))
  )
    return true

  const next = new Date(dayIso + "T12:00:00Z")
  if (!Number.isFinite(next.getTime())) return false
  next.setUTCDate(next.getUTCDate() + 1)
  const nextLunar = chineseCalendarParts(utcDayIso(next))
  return !!(nextLunar && nextLunar.month === 1 && nextLunar.day === 1)
}

export function isChinesePublicHolidayUtc(date) {
  const day = utcDayIso(date)
  const year = String(day).slice(0, 4)
  const ranges = CHINA_HOLIDAY_RANGES[year]
  if (Array.isArray(ranges) && ranges.some(([from, to]) => day >= from && day <= to)) return true
  return isStatutoryChineseHoliday(day)
}

/** Peak: Mo–Fr 01:00–04:00 und 06:00–10:00 UTC, ohne chinesische Feiertage. */
export function isPeakTime(date) {
  const d = date || new Date()
  if (!Number.isFinite(d.getTime())) return false
  const weekday = d.getUTCDay()
  if (weekday === 0 || weekday === 6 || isChinesePublicHolidayUtc(d)) return false
  const hour = d.getUTCHours()
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
}

const CURRENCY_SYMBOL = { USD: "$", CNY: "¥", EUR: "€" }

export function symbolFor(currency) {
  const cur = String(currency || "").toUpperCase()
  return CURRENCY_SYMBOL[cur] || (cur ? cur + " " : "")
}

export function fmtMoney(value, currency) {
  const n = num(value)
  return n === null ? "--" : symbolFor(currency) + n.toFixed(2)
}

/**
 * Topped-up-Balance aus GET /api/v0/users/get_user_summary.
 * normal_wallets = aufgeladen, bonus_wallets = Gratisguthaben.
 */
export function toppedUpFromSummary(json) {
  const biz = json && json.data && json.data.biz_data
  if (!biz || typeof biz !== "object") return null
  const wallets = Array.isArray(biz.normal_wallets) ? biz.normal_wallets : []
  const bonus = Array.isArray(biz.bonus_wallets) ? biz.bonus_wallets : []
  const currencies = [
    ...new Set(
      wallets
        .concat(bonus)
        .map((w) => String((w && w.currency) || "").toUpperCase())
        .filter(Boolean),
    ),
  ]
  if (!currencies.length) return null
  const currency = currencies.includes("USD") ? "USD" : currencies[0]
  const sum = (list) =>
    list
      .filter((w) => String((w && w.currency) || "").toUpperCase() === currency)
      .reduce((acc, w) => acc + (num(w && w.balance) || 0), 0)
  const toppedUp = sum(wallets)
  const granted = sum(bonus)
  return { currency, toppedUp, granted, total: toppedUp + granted }
}

/**
 * Kosten aus GET /api/v0/usage/cost?month=M&year=YYYY.
 * Tageskosten = Summe aller Beträge des Tages außer Typ REQUEST.
 */
export function dailyCostFromUsage(json, dayIso) {
  const raw = json && json.data && json.data.biz_data
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []
  if (!rows.length) return null
  const row = rows.find((r) => String((r && r.currency) || "").toUpperCase() === "USD") || rows[0]
  const currency = String((row && row.currency) || "USD").toUpperCase()
  const days = Array.isArray(row && row.days) ? row.days : []

  const sumDay = (day) => {
    let total = 0
    let seen = false
    const models = Array.isArray(day && day.data) ? day.data : []
    for (const model of models) {
      const usage = Array.isArray(model && model.usage) ? model.usage : []
      for (const item of usage) {
        const type = String((item && item.type) || "").toUpperCase()
        if (type === "REQUEST") continue
        const v = num(item && item.amount)
        if (v !== null) {
          total += v
          seen = true
        }
      }
    }
    return seen ? total : null
  }

  const monthPrefix = String(dayIso || "").slice(0, 7)
  let monthCost = 0
  let monthSeen = false
  let monthDays = 0
  for (const d of days) {
    const date = String((d && d.date) || "")
    if (monthPrefix && !date.startsWith(monthPrefix)) continue
    const v = sumDay(d)
    if (v !== null) {
      monthCost += v
      monthSeen = true
      monthDays += 1
    }
  }
  const today = days.find((d) => String((d && d.date) || "") === dayIso) || null
  return {
    currency,
    day: dayIso,
    cost: today ? sumDay(today) : null,
    monthCost: monthSeen ? monthCost : null,
    dayCount: days.length,
    monthDays: monthDays,
  }
}

/** „vor 3 Min" / „gerade eben". */
export function relTime(iso, nowMs) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return "unbekannt"
  const sec = Math.max(0, Math.round(((nowMs || Date.now()) - then) / 1000))
  if (sec < 45) return "gerade eben"
  if (sec < 3600) return `vor ${Math.round(sec / 60)} Min`
  if (sec < 86400) return `vor ${Math.round(sec / 3600)} Std`
  return `vor ${Math.round(sec / 86400)} Tagen`
}

/** Fehlerklassifikation aus HTTP-Status und Antwortkörper. */
export function classifyFailure(status, body) {
  if (status === 0) return { kind: "error", note: "Netzwerkfehler" }
  if (status === 401 || status === 403) {
    if (/awswaf|challenge|Human Verification/i.test(String(body || ""))) {
      return { kind: "error", note: "WAF blockiert (Platform einmal öffnen)" }
    }
    return { kind: "auth", note: "Session abgelaufen" }
  }
  const bodyText = String(body || "")
  if (/"(?:code|biz_code)"\s*:\s*4000[23]/.test(bodyText)) {
    return { kind: "auth", note: "Token ungültig oder abgelaufen" }
  }
  if (status === 200 && /"(?:code|biz_code)"\s*:\s*(?!0\b)\d+/.test(bodyText)) {
    return { kind: "error", note: "API-Fehler im Antwortkörper" }
  }
  return { kind: "error", note: "HTTP " + status }
}
