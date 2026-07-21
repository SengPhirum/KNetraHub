import { getDb } from '~~/server/utils/db'
import { getDockerDb } from '~~/server/utils/moduleDb'
import { getAppSetting, setAppSetting } from '~~/server/utils/store'
import { listAlertChannelsWithConfig } from '~~/server/utils/alertChannels'
import { createChannel } from '~~/server/utils/notifyStore'
import { logSystem } from '~~/server/utils/moduleLogs'

/**
 * One-time migration of the legacy Docker alert channels into the central
 * notification library, then retirement of the old table:
 *
 *   boot A: marker unset → copy alert_channels → notification_channels
 *           (scope=docker), set the marker. The old table is kept this boot.
 *   boot B+: marker set → the copy already succeeded, so DROP the old table.
 *
 * The drop is gated on the marker (which is only written after a *complete*
 * copy), so the legacy data is never removed before it exists centrally. Any
 * error aborts without setting the marker, so the next boot retries and the
 * table is never dropped prematurely. Config keys are remapped from the old
 * camelCase shape to the central snake_case field spec.
 */

const MARKER = 'notifications.backfill.docker'

function mapConfig(type: string, cfg: Record<string, any>): Record<string, any> {
  if (type === 'telegram') return { bot_token: cfg.botToken ?? '', chat_id: cfg.chatId ?? '' }
  if (type === 'teams') return { webhook_url: cfg.webhookUrl ?? '' }
  if (type === 'webhook') return { url: cfg.url ?? '', headers: cfg.headers ? JSON.stringify(cfg.headers) : '' }
  return cfg
}

export default defineNitroPlugin(() => {
  // Fire-and-forget after boot; never block startup and never throw upward.
  setTimeout(async () => {
    try {
      // Migration already done on a prior boot → retire the legacy table.
      if (await getAppSetting(MARKER)) {
        await getDockerDb().query('DROP TABLE IF EXISTS alert_channels').catch(() => {})
        return
      }

      // Fresh installs never had the table — mark done and skip.
      const present = await getDockerDb().query(`SELECT to_regclass('alert_channels') AS t`)
      if (!present.rows[0]?.t) { await setAppSetting(MARKER, new Date().toISOString(), 'system'); return }

      const legacy = await listAlertChannelsWithConfig()
      let copied = 0
      for (const ch of legacy) {
        const { rows } = await getDb().query(
          'SELECT 1 FROM notification_channels WHERE scope = $1 AND name = $2 AND type = $3 LIMIT 1',
          ['docker', ch.name, ch.type]
        )
        if (rows.length) continue
        await createChannel({ name: ch.name, type: ch.type, scope: 'docker', enabled: ch.enabled, config: mapConfig(ch.type, ch.config) })
        copied++
      }

      // Only now, after a complete copy, is it safe to record completion.
      await setAppSetting(MARKER, new Date().toISOString(), 'system')
      if (copied) await logSystem('portal', 'info', 'notifications.backfill', `Copied ${copied} Docker channel(s) into the central notification library`)
    } catch (err: any) {
      // Docker DB not ready — leave the marker unset so a later boot retries.
      await logSystem('portal', 'info', 'notifications.backfill.deferred', `Docker channel back-fill deferred: ${err?.message || err}`).catch(() => {})
    }
  }, 3000)
})
