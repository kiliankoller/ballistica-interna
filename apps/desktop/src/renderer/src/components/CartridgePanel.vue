<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { cartridgeSvg, chamberSvg, chamberTable, cipTable } from '../lib/drawing';
import type { LoadDoc } from '../stores/loads';

const props = defineProps<{ doc: LoadDoc }>();
const { t } = useI18n();
const tab = ref<'cartridge' | 'chamber'>('cartridge');

const cartridge = computed(() => {
  const l = props.doc.result.load;
  return cartridgeSvg(props.doc.file.caliberfile, l ? l.projectile.length * 1e3 : 0, l ? l.projectile.seatingDepth * 1e3 : 0, l ? l.cartridge.caseLength * 1e3 : 0);
});
const chamber = computed(() => chamberSvg(props.doc.file.caliberfile));
const cip = computed(() => {
  const v = Number(props.doc.file.caliberfile.V?.value);
  return cipTable(props.doc.file.caliberfile, v ? v.toFixed(2) : '');
});
const chamberRows = computed(() => chamberTable(props.doc.file.caliberfile));
const title = computed(() => {
  const cf = props.doc.file.caliberfile;
  return [cf.cipname?.value, cf.standard?.value ? `(${cf.standard.value})` : ''].filter(Boolean).join(' ');
});
const svg = computed(() => (tab.value === 'cartridge' ? cartridge.value : chamber.value));
const rows = computed(() => (tab.value === 'cartridge' ? cip.value : chamberRows.value));
</script>

<template>
  <section class="panel">
    <el-tabs v-model="tab" class="tabs">
      <el-tab-pane :label="t('drawing.cartridge')" name="cartridge" />
      <el-tab-pane name="chamber" :disabled="!chamber">
        <template #label>
          <span :title="chamber ? '' : t('drawing.noChamber')">{{ t('drawing.chamber') }}</span>
        </template>
      </el-tab-pane>
    </el-tabs>
    <div v-if="svg" class="body">
      <div class="draw">
        <div class="title">{{ title }}</div>
        <div class="svg" v-html="svg" />
      </div>
      <table class="cip">
        <tr v-for="row in rows" :key="row.key">
          <td>{{ row.key }}</td>
          <td>{{ row.value }} {{ row.unit }}</td>
        </tr>
      </table>
    </div>
    <p v-else class="none">{{ t('drawing.none') }}</p>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  border-radius: 3px;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 8px;
}
.body {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  flex: 1;
  min-height: 0;
}
.draw {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-regular);
}
.title {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.svg {
  flex: 1;
  min-height: 260px;
  display: flex;
  justify-content: center;
}
.svg :deep(svg) {
  height: 100%;
  max-height: 520px;
  width: auto;
  max-width: 100%;
}
.cip {
  font-size: 10.5px;
  border-collapse: collapse;
  align-self: flex-start;
}
.cip td {
  padding: 0 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
.cip td:first-child {
  color: var(--el-color-danger);
}
.none {
  padding: 12px;
  color: var(--el-text-color-secondary);
}
</style>
