<script setup lang="ts">
import type { IpamSnmpFormFields } from '~~/layers/ipmgt/app/utils/ipamSnmp'

// Renders the SNMP credential fields for the Device form. A local port of
// Monitoring's <NetSnmpFields> (ipmgt and monitoring are isolated siblings,
// so this is deliberate duplication rather than a cross-layer import).
//
// `keepBlank`: set when editing an existing device - the server never
// returns stored credentials, and treats blank ones as "keep current value".
const props = defineProps<{ form: IpamSnmpFormFields; keepBlank?: boolean }>()
const secretPlaceholder = computed(() => props.keepBlank ? 'unchanged if left blank' : '')
</script>

<template>
  <UFormField label="SNMP Version">
    <USelect v-model="form.snmp_version" :items="IPAM_SNMP_VERSIONS" value-key="value" label-key="label" class="w-full" />
  </UFormField>

  <!-- v1 / v2c: a community string is all that's needed -->
  <UFormField v-if="form.snmp_version !== 'v3'" label="Community">
    <UInput v-model="form.snmp_community" type="password" :placeholder="keepBlank ? secretPlaceholder : 'public'" class="w-full" />
  </UFormField>

  <!-- v3: SNMPv3 auth/priv credentials -->
  <template v-else>
    <UFormField label="Auth Level">
      <USelect v-model="form.snmp_sec_level" :items="IPAM_SNMPV3_SEC_LEVELS" value-key="value" label-key="label" class="w-full" />
    </UFormField>
    <UFormField label="Auth User Name">
      <UInput v-model="form.snmp_auth_user" placeholder="mySNMPv3" class="w-full" />
    </UFormField>

    <div v-if="form.snmp_sec_level !== 'noAuthNoPriv'" class="grid grid-cols-2 gap-4">
      <UFormField label="Auth Password">
        <UInput v-model="form.snmp_auth_password" type="password" :placeholder="secretPlaceholder" class="w-full" />
      </UFormField>
      <UFormField label="Auth Algorithm">
        <USelect v-model="form.snmp_auth_protocol" :items="IPAM_SNMPV3_AUTH_PROTOCOLS" value-key="value" label-key="label" class="w-full" />
      </UFormField>
    </div>

    <div v-if="form.snmp_sec_level === 'authPriv'" class="grid grid-cols-2 gap-4">
      <UFormField label="Crypto Password">
        <UInput v-model="form.snmp_priv_password" type="password" :placeholder="secretPlaceholder" class="w-full" />
      </UFormField>
      <UFormField label="Crypto Algorithm">
        <USelect v-model="form.snmp_priv_protocol" :items="IPAM_SNMPV3_PRIV_PROTOCOLS" value-key="value" label-key="label" class="w-full" />
      </UFormField>
    </div>
  </template>
</template>
