import type { Migration } from './types'

/**
 * Recording object-storage envelope metadata. The recording bytes live in
 * object storage (fs/S3); `enc_meta` holds the per-recording AES-256-GCM IV and
 * the wrapped data-encryption key (a SealedValue under the master key) needed to
 * decrypt on playback. Forward-only, idempotent.
 */
export const migration: Migration = {
  id: '0010_recording_storage',
  statements: [
    `ALTER TABLE pam.session_recordings ADD COLUMN IF NOT EXISTS enc_meta TEXT`,
    `ALTER TABLE pam.session_recordings ADD COLUMN IF NOT EXISTS integrity_detail TEXT`
  ]
}
