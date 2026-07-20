/**
 * Criticality tiers for deleting records, so a destructive click asks for only
 * as much confirmation as the record warrants:
 *
 *   high   → re-enter the portal security password (see confirmAction.ts)
 *   medium → type the record's exact name to confirm
 *   low    → a plain yes / no confirmation
 *
 * This registry is the single source of truth. Both the API guard
 * (server/utils/deleteConfirm.ts) and the confirmation dialog
 * (app/components/ConfirmDeleteModal.vue) resolve a record's tier from here by
 * its `type` key, so re-categorising a record is a one-line change here and
 * everything else follows - no call-site edits.
 *
 * Guiding rule for the default categorisation:
 *   high   = irreversible data/credential loss, or infrastructure-wide impact
 *            (nodes, stacks, volumes, secrets, subnets, sections, vaults,
 *             user accounts, backups, auth config, bulk deletes, SNMP creds)
 *   medium = disruptive but recoverable / re-creatable configuration records
 *   low    = trivial, self-scoped, or easily reversible records
 */
export type DeleteTier = 'low' | 'medium' | 'high'

export const DELETE_TIERS: Record<string, DeleteTier> = {
  // ── Portal ────────────────────────────────────────────────────────────────
  'user': 'high',                 // user account (access-bearing)
  'backup': 'high',               // deleting a backup is irreversible
  'auth-settings': 'high',        // could lock out every SSO/LDAP user
  'alert-channel': 'medium',
  'email-settings': 'low',        // singleton SMTP config, reconfigurable
  'email-template': 'low',        // reset an override to default, reversible
  'gitlab-settings': 'low',       // disconnect integration, reversible
  'session': 'low',               // your own device session
  'api-token': 'low',             // your own token, easily re-created
  'appearance': 'low',            // reset branding, cosmetic

  // ── Docker ────────────────────────────────────────────────────────────────
  'docker.node': 'high',
  'docker.stack': 'high',
  'docker.service': 'high',
  'docker.volume': 'high',        // volume data is not recoverable
  'docker.secret': 'high',        // secret value is lost on delete
  'docker.network': 'medium',
  'docker.config': 'medium',
  'docker.registry': 'medium',
  'docker.container': 'medium',

  // ── IP Management ───────────────────────────────────────────────────────────
  'ipmgt.subnet': 'high',         // holds the whole address inventory
  'ipmgt.section': 'high',        // holds subnets
  'ipmgt.vault': 'high',          // secret value is lost on delete
  'ipmgt.device': 'medium',
  'ipmgt.vrf': 'medium',
  'ipmgt.vlan': 'medium',
  'ipmgt.location': 'medium',
  'ipmgt.customer': 'medium',
  'ipmgt.circuit': 'medium',
  'ipmgt.nat': 'medium',
  'ipmgt.rack': 'medium',
  'ipmgt.customfield': 'medium',
  'ipmgt.address': 'low',         // releasing an IP is routine and reversible
  'ipmgt.rack-item': 'low',

  // ── Monitoring ──────────────────────────────────────────────────────────────
  'monitoring.device-bulk': 'high',        // wipes many devices + their history
  'monitoring.credential-profile': 'high', // SNMP credentials
  'monitoring.device': 'medium',
  'monitoring.device-group': 'medium',
  'monitoring.location': 'medium',
  'monitoring.alert-rule': 'medium',
  'monitoring.alert-template': 'medium',
  'monitoring.alert-transport': 'medium',
  'monitoring.poller': 'low',     // stale node record; the node re-registers
  'monitoring.service': 'medium',
  'monitoring.bill': 'medium',
  'monitoring.maintenance': 'low'
}

/** Resolve a record type's delete tier. Unknown keys default to `medium` - a
 *  safe middle ground (asks for the name, never silently drops to yes/no). */
export function deleteTier(key: string): DeleteTier {
  return DELETE_TIERS[key] ?? 'medium'
}
