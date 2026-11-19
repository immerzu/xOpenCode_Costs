import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, "..", "src", "deepseek.mjs"), "utf8")
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))
const {
  num,
  parseToken,
  toppedUpFromSummary,
  dailyCostFromUsage,
  isPeakTime,
  fmtMoney,
  localDayIso,
  classifyFailure,
} = mod

let passed = 0
const check = (name, fn) => {
  try {
    fn()
    passed += 1
  } catch (e) {
    console.error("FEHLT:", name)
    throw e
  }
}

check("num: String mit Komma", () => assert.equal(num("1,234.56"), 1234.56))
check("num: Quatsch ist null", () => assert.equal(num("abc"), null))

check("parseToken: appKit-Wrapper", () => {
  const raw = JSON.stringify({ value: "A".repeat(30), __version: "0" })
  assert.equal(parseToken(raw), "A".repeat(30))
})
check("parseToken: value null ist kein Token", () => assert.equal(parseToken(JSON.stringify({ value: null })), null))
check("parseToken: zu kurz", () => assert.equal(parseToken("kurz"), null))
check("parseToken: Klartext mit Leerzeichen abgelehnt", () => assert.equal(parseToken("AAAA BBBB CCCC DDDD EEEE"), null))

const summary = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: {
      normal_wallets: [{ currency: "USD", balance: "20.30" }],
      bonus_wallets: [{ currency: "USD", balance: "0.00" }],
    },
  },
}
check("toppedUp: 20.30 USD", () => {
  const w = toppedUpFromSummary(summary)
  assert.equal(w.toppedUp, 20.3)
  assert.equal(w.currency, "USD")
  assert.equal(w.total, 20.3)
})
check("toppedUp: leerer Körper → null", () => assert.equal(toppedUpFromSummary({}), null))

const usage = {
  code: 0,
  data: {
    biz_code: 0,
    biz_data: [
      {
        currency: "USD",
        days: [
          {
            date: "2026-11-19",
            data: [
              { model: "deepseek-chat", usage: [{ type: "REQUEST", amount: "12" }, { type: "INPUT", amount: "1.10" }, { type: "OUTPUT", amount: "0.74" }] },
            ],
          },
          {
            date: "2026-11-18",
            data: [{ model: "deepseek-chat", usage: [{ type: "INPUT", amount: "2.00" }] }],
          },
        ],
      },
    ],
  },
}
check("Tageskosten: REQUEST zählt nicht", () => {
  const c = dailyCostFromUsage(usage, "2026-11-19")
  assert.equal(c.cost, 1.84)
  assert.equal(c.monthCost, 3.84)
})
check("Tageskosten: unbekannter Tag → null", () => assert.equal(dailyCostFromUsage(usage, "2026-11-01").cost, null))

check("Peak: Dienstag 02:00 UTC", () => assert.equal(isPeakTime(new Date("2026-11-17T02:00:00Z")), true))
check("Peak: Dienstag 05:00 UTC ist Off-Peak", () => assert.equal(isPeakTime(new Date("2026-11-17T05:00:00Z")), false))
check("Peak: Samstag 02:00 UTC ist Off-Peak", () => assert.equal(isPeakTime(new Date("2026-11-21T02:00:00Z")), false))
check("Peak: Nationalfeiertag 02:00 UTC ist Off-Peak", () => assert.equal(isPeakTime(new Date("2026-10-01T02:00:00Z")), false))

check("fmtMoney: 2 Nachkommastellen", () => assert.equal(fmtMoney(20.3, "USD"), "$20.30"))
check("fmtMoney: unbekannt", () => assert.equal(fmtMoney(-1, "USD"), "$-1.00"))

check("localDayIso: Format", () => assert.match(localDayIso(new Date(2026, 10, 19)), /^2026-11-19$/))

check("classifyFailure: 40003 ist auth", () => {
  const f = classifyFailure(200, '{"code":40003,"msg":"Authorization Failed (invalid token)"}')
  assert.equal(f.kind, "auth")
})

console.log("Tests bestanden: " + passed)
