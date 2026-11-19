import { createSignal } from "solid-js"
import { Plugin, TitlebarItem } from "@opencode/plugin/gui"
import { Costs } from "./contract"
import {
  classifyFailure,
  dailyCostFromUsage,
  fmtMoney,
  isPeakTime,
  localDayIso,
  relTime,
  toppedUpFromSummary,
} from "./deepseek.mjs"

const API_BASE = "https://platform.deepseek.com"
const USAGE_URL = "https://platform.deepseek.com/usage"
const REFRESH_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT = 15000

/* Node-Module werden erst im Hauptprozess geladen — im Fenster gibt es sie nicht. */
async function tokenPath() {
  const [{ homedir }, { join }] = await Promise.all([import("node:os"), import("node:path")])
  return join(homedir(), ".config", "opencode", "secrets", "deepseek-platform-token")
}

async function readToken() {
  const [{ readFile }] = await Promise.all([import("node:fs/promises")])
  const { parseToken } = await import("./deepseek.mjs")
  try {
    const raw = await readFile(await tokenPath(), "utf8")
    const first = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#"))
    return first ? parseToken(first) : null
  } catch (e) {
    return null
  }
}

function failure(kind, note) {
  return {
    kind,
    note,
    at: new Date().toISOString(),
    currency: "USD",
    toppedUp: -1,
    granted: -1,
    total: -1,
    todayCost: -1,
    monthCost: -1,
  }
}

async function httpGet(url, token) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      signal: controller.signal,
    })
    return { status: res.status, body: await res.text() }
  } catch (e) {
    return { status: 0, body: "", error: String((e && e.message) || e) }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSnapshot() {
  const token = await readToken()
  if (!token) return failure("none", "Kein Token hinterlegt")

  const now = new Date()
  const day = localDayIso(now)
  const summaryUrl = API_BASE + "/api/v0/users/get_user_summary"
  const costUrl = API_BASE + "/api/v0/usage/cost?month=" + (now.getMonth() + 1) + "&year=" + now.getFullYear()

  const [summaryRes, costRes] = await Promise.all([httpGet(summaryUrl, token), httpGet(costUrl, token)])
  for (const res of [summaryRes, costRes]) {
    if (res.status !== 200) {
      const fail = classifyFailure(res.status, res.body)
      return failure(fail.kind, fail.note)
    }
  }

  let summaryJson = null
  let costJson = null
  try {
    summaryJson = JSON.parse(summaryRes.body)
  } catch (e) {
    /* unten behandelt */
  }
  try {
    costJson = JSON.parse(costRes.body)
  } catch (e) {
    /* unten behandelt */
  }

  const wallet = toppedUpFromSummary(summaryJson)
  if (!wallet) {
    const fail = classifyFailure(summaryRes.status, summaryRes.body)
    return failure(fail.kind === "error" ? "error" : fail.kind, fail.note)
  }
  const cost = dailyCostFromUsage(costJson, day)

  return {
    kind: "ok",
    note: "",
    at: new Date().toISOString(),
    currency: wallet.currency,
    toppedUp: wallet.toppedUp,
    granted: wallet.granted,
    total: wallet.total,
    todayCost: cost && cost.cost !== null && cost.cost !== undefined ? cost.cost : -1,
    monthCost: cost && cost.monthCost !== null && cost.monthCost !== undefined ? cost.monthCost : -1,
  }
}

export default Plugin.define({
  i18n: {
    en: { title: "DeepSeek account" },
    de: { title: "DeepSeek-Konto" },
  },

  main(ctx) {
    ctx.provide(Costs, {
      read: async () => {
        try {
          return await fetchSnapshot()
        } catch (e) {
          return failure("error", String((e && e.message) || e))
        }
      },
    })
  },

  setup(ctx) {
    const [label, setLabel] = createSignal("💳 …")
    const [title, setTitle] = createSignal("DeepSeek-Konto — Daten werden geladen")
    const [busy, setBusy] = createSignal(false)

    const money = (v, currency) => (v === -1 ? "--" : fmtMoney(v, currency))
    const dot = (kind) => ({ ok: "🟢", auth: "🔴", error: "🔴" })[kind] || "⚪"

    const paint = (snap) => {
      const peak = isPeakTime(new Date()) ? " 🔥" : ""
      const mark = dot(snap.kind)

      if (snap.kind !== "ok") {
        setLabel(mark + " 💳 " + (snap.kind === "none" ? "Token nötig" : "Fehler") + peak)
      } else {
        setLabel(mark + " 💳 " + money(snap.toppedUp, snap.currency) + " · heute " + money(snap.todayCost, snap.currency) + peak)
      }

      const lines = [ctx.t("title")]
      if (snap.kind === "ok") {
        lines.push(
          "Topped-up: " + money(snap.toppedUp, snap.currency),
          "Guthaben gesamt: " +
            money(snap.total, snap.currency) +
            (snap.granted > 0 ? " (Gratis: " + money(snap.granted, snap.currency) + ")" : ""),
          "Kosten heute: " + money(snap.todayCost, snap.currency),
          "Kosten Monat: " + money(snap.monthCost, snap.currency),
          "Aktualisiert: " + relTime(snap.at, Date.now()),
        )
      } else {
        lines.push(snap.note || "unbekannter Fehler")
      }
      if (isPeakTime(new Date())) lines.push("", "🔥 Peak-Zeit: regulärer Tarif")
      lines.push("", "Klick: platform.deepseek.com/usage öffnen", "xOpenCode Costs v0.1.0")
      setTitle(lines.join("\n"))
    }

    const refresh = async () => {
      if (busy()) return
      setBusy(true)
      try {
        paint(await ctx.main(Costs).read())
      } catch (e) {
        paint(failure("error", String((e && e.message) || e)))
      } finally {
        setBusy(false)
      }
    }

    ctx.add(TitlebarItem, () => ({
      id: "costs",
      label: label(),
      title: title(),
      run: () => ctx.system.openExternal(USAGE_URL),
    }))

    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  },
})
