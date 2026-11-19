import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

/* Zahlen ohne Wert kommen als -1 über die Grenze, damit das Schema einfach bleibt. */
const Snapshot = Schema.Struct({
  kind: Schema.String,
  note: Schema.String,
  at: Schema.String,
  currency: Schema.String,
  toppedUp: Schema.Number,
  granted: Schema.Number,
  total: Schema.Number,
  todayCost: Schema.Number,
  monthCost: Schema.Number,
})

export const Costs = Ipc.define({
  id: "xc-costs.snapshot",
  methods: {
    read: { output: Snapshot },
  },
})
