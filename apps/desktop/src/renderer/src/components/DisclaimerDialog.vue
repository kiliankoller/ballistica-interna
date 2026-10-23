<script setup lang="ts">
// Shown on first start and whenever the text changes (DISCLAIMER_VERSION): the results are a simulation, not
// load data; the user has to confirm before working with the app.
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { APP_NAME, DISCLAIMER_VERSION } from '../../../shared/api';
import logo from '../assets/logo.svg?raw';

const open = defineModel<boolean>({ required: true });
const { t, tm } = useI18n();
const understood = ref(false);

async function accept() {
  await window.api.setSettings({ disclaimerAccepted: DISCLAIMER_VERSION });
  open.value = false;
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('disclaimer.title')"
    width="560px"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    append-to-body
  >
    <div class="brand"><span class="logo" v-html="logo" /><span class="name">{{ APP_NAME }}</span></div>
    <p class="lead">{{ t('disclaimer.lead') }}</p>
    <ul>
      <li v-for="(point, i) in tm('disclaimer.points') as string[]" :key="i">{{ point }}</li>
    </ul>
    <el-checkbox v-model="understood">{{ t('disclaimer.confirm') }}</el-checkbox>
    <template #footer>
      <el-button type="primary" size="small" :disabled="!understood" @click="accept">{{ t('disclaimer.accept') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -6px 0 14px;
}
.logo :deep(svg) {
  width: 56px;
  height: 56px;
  display: block;
}
.name {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.lead {
  margin: 0 0 8px;
  font-weight: 600;
}
ul {
  margin: 0 0 12px;
  padding-left: 18px;
  line-height: 1.45;
}
</style>
