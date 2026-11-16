<script setup lang="ts">
// Summary after a QuickLOAD import: per file, where caliber, bullet and powder came from.
import { useI18n } from 'vue-i18n';
import type { ComponentKind } from '../../../shared/api';
import type { ImportedComponent, ImportRow } from '../lib/quickload';

const open = defineModel<boolean>({ required: true });
defineProps<{ rows: ImportRow[] }>();
const { t } = useI18n();
const kinds: ComponentKind[] = ['caliber', 'projectile', 'propellant'];
const fromText = (c: ImportedComponent) => t(c.from === 'master' ? 'quickload.master' : c.from === 'quickload' ? 'quickload.fromFile' : 'quickload.missing');
</script>

<template>
  <el-dialog v-model="open" :title="t('quickload.title')" width="760px">
    <p class="intro">{{ t('quickload.intro') }}</p>
    <div v-for="r in rows" :key="r.file" class="file">
      <div class="name">{{ r.file }}</div>
      <div v-if="!r.components" class="warn">{{ t('quickload.invalid') }}</div>
      <table v-else>
        <tr v-for="kind in kinds" :key="kind">
          <th>{{ t(`panel.${kind}`) }}</th>
          <td>{{ r.components[kind].label || '–' }}</td>
          <td :class="{ warn: r.components[kind].from === 'missing', from: true }">{{ fromText(r.components[kind]) }}</td>
        </tr>
      </table>
    </div>
    <p class="kept">{{ t('quickload.kept') }}</p>
    <template #footer>
      <el-button type="primary" @click="open = false">{{ t('quickload.ok') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.intro,
.kept {
  margin: 0 0 10px;
  line-height: 1.4;
}
.kept {
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.file {
  margin-bottom: 10px;
}
.name {
  font-weight: 600;
  margin-bottom: 2px;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th {
  text-align: left;
  font-weight: normal;
  color: var(--el-text-color-secondary);
  width: 110px;
  padding: 1px 8px 1px 0;
}
td {
  padding: 1px 8px 1px 0;
}
td.from {
  width: 190px;
  color: var(--el-text-color-secondary);
}
.warn,
td.from.warn {
  color: var(--el-color-warning);
}
</style>
