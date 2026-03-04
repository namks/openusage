import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import { DEFAULT_DISPLAY_MODE, type DisplayMode, type TrayMetric } from "@/lib/settings"
import { clamp01 } from "@/lib/utils"

type PluginState = {
  data: PluginOutput | null
  loading: boolean
  error: string | null
}

export type TrayPrimaryBar = {
  id: string
  label?: string
  fraction?: number
}

type ProgressLine = Extract<
  PluginOutput["lines"][number],
  { type: "progress"; label: string; used: number; limit: number }
>

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress"
}

const TRAY_METRIC_LABEL_MAP: Record<string, string> = {
  session: "Session",
  weekly: "Weekly",
}

export function getTrayPrimaryBars(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  maxBars?: number
  displayMode?: DisplayMode
  pluginId?: string
  trayMetric?: TrayMetric
}): TrayPrimaryBar[] {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars = 4,
    displayMode = DEFAULT_DISPLAY_MODE,
    pluginId,
    trayMetric,
  } = args
  if (!pluginSettings) return []

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]))
  const disabled = new Set(pluginSettings.disabled)
  const orderedIds = pluginId
    ? [pluginId]
    : pluginSettings.order

  const out: TrayPrimaryBar[] = []
  for (const id of orderedIds) {
    if (disabled.has(id)) continue
    const meta = metaById.get(id)
    if (!meta) continue

    // Skip if no primary candidates defined
    if (!meta.primaryCandidates || meta.primaryCandidates.length === 0) continue

    const state = pluginStates[id]
    const data = state?.data ?? null

    if (trayMetric === "both") {
      // Return up to 2 bars per plugin: one for Session, one for Weekly
      for (const targetLabel of ["Session", "Weekly"]) {
        if (!meta.primaryCandidates.includes(targetLabel)) continue
        let fraction: number | undefined
        if (data) {
          const line = data.lines.find(
            (l): l is ProgressLine => isProgressLine(l) && l.label === targetLabel
          )
          if (line && line.limit > 0) {
            const shownAmount =
              displayMode === "used" ? line.used : line.limit - line.used
            fraction = clamp01(shownAmount / line.limit)
          }
        }
        out.push({ id, label: targetLabel, fraction })
        if (out.length >= maxBars) break
      }
    } else {
      // Filter candidates by trayMetric label if specified
      const filterLabel = trayMetric ? TRAY_METRIC_LABEL_MAP[trayMetric] : undefined
      const candidates = filterLabel
        ? meta.primaryCandidates.filter((c) => c === filterLabel)
        : meta.primaryCandidates

      let fraction: number | undefined
      let matchedLabel: string | undefined
      if (data && candidates.length > 0) {
        const primaryLabel = candidates.find((label) =>
          data.lines.some((line) => isProgressLine(line) && line.label === label)
        )
        if (primaryLabel) {
          matchedLabel = primaryLabel
          const primaryLine = data.lines.find(
            (line): line is ProgressLine =>
              isProgressLine(line) && line.label === primaryLabel
          )
          if (primaryLine && primaryLine.limit > 0) {
            const shownAmount =
              displayMode === "used"
                ? primaryLine.used
                : primaryLine.limit - primaryLine.used
            fraction = clamp01(shownAmount / primaryLine.limit)
          }
        }
      }

      out.push({ id, label: matchedLabel, fraction })
    }
    if (out.length >= maxBars) break
  }

  return out
}

