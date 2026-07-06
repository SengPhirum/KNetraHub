<script setup lang="ts">
import type { SnmpFormFields } from '~~/layers/monitoring/app/utils/netSnmp'

// Renders the SNMP credential fields for a device form. `form` is the reactive
// form object (Add Device modal's newDevice, or the Settings tab's settingsForm);
// the inputs v-model its fields directly. v1/v2c show a community string; v3
// shows auth/priv credentials, revealing the auth and priv fields only for the
// security levels that use them.
defineProps<{ form: SnmpFormFields }>()
</script>

<template>
  <UFormField label="SNMP Version">
    <USelect v-model="form.snmp_version" :items="SNMP_VERSIONS" value-key="value" label-key="label" class="w-full" />
  </UFormField>

  <!-- v1 / v2c: a community string is all that's needed -->
  <UFormField v-if="form.snmp_version !== 'v3'" label="Community">
    <UInput v-model="form.snmp_community" type="password" placeholder="public" class="w-full" />
  </UFormField>

  <!-- v3: SNMPv3 auth/priv credentials -->
  <template v-else>
    <UFormField label="Auth Level">
      <USelect v-model="form.snmp_sec_level" :items="SNMPV3_SEC_LEVELS" value-key="value" label-key="label" class="w-full" />
    </UFormField>
    <UFormField label="Auth User Name">
      <UInput v-model="form.snmp_auth_user" placeholder="mySNMPv3" class="w-full" />
    </UFormField>

    <div v-if="form.snmp_sec_level !== 'noAuthNoPriv'" class="grid grid-cols-2 gap-4">
      <UFormField label="Auth Password">
        <UInput v-model="form.snmp_auth_password" type="password" class="w-full" />
      </UFormField>
      <UFormField label="Auth Algorithm">
        <USelect v-model="form.snmp_auth_protocol" :items="SNMPV3_AUTH_PROTOCOLS" value-key="value" label-key="label" class="w-full" />
      </UFormField>
    </div>

    <div v-if="form.snmp_sec_level === 'authPriv'" class="grid grid-cols-2 gap-4">
      <UFormField label="Crypto Password">
        <UInput v-model="form.snmp_priv_password" type="password" class="w-full" />
      </UFormField>
      <UFormField label="Crypto Algorithm">
        <USelect v-model="form.snmp_priv_protocol" :items="SNMPV3_PRIV_PROTOCOLS" value-key="value" label-key="label" class="w-full" />
      </UFormField>
    </div>
  </template>
</template>
