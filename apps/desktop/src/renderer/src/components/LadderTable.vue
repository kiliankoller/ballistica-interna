<script setup lang="ts">
// The steps of the load ladder: click a row to show its results and highlight its curve.
import { useI18n } from 'vue-i18n';
import { GRAIN } from '@ballistica-interna/solver';
import { fmt } from '../lib/units';
import type { LoadDoc } from '../stores/loads';

defineProps<{ doc: LoadDoc }>();
const { t } = useI18n();
</script>

<template>
  <table class="ladder">
    <thead>
      <tr>
        <th>{{ t('ladder.charge') }}</th>
        <th>Pmax</th>
        <th>V0</th>
        <th>E0</th>
        <th>BT</th>
        <th>{{ t('ladder.burnt') }}</th>
        <th>{{ t('ladder.fill') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(s, i) in doc.result.steps" :key="i" :class="{ focus: i === doc.focus }" @click="doc.focus = i">
        <td>{{ fmt(s.charge / GRAIN, 2) }} gr</td>
        <template v-if="s.result.status === 'ok'">
          <td :class="{ over: s.result.maxPressure > (doc.result.load?.cartridge.maxPressure ?? Infinity) }">
            {{ fmt(s.result.maxPressure / 1e5, 0) }} bar
          </td>
          <td>{{ fmt(s.result.muzzleVelocity, 0) }} m/s</td>
          <td>{{ fmt(s.result.muzzleEnergy, 0) }} J</td>
          <td>{{ fmt(s.result.barrelTime * 1e3, 3) }} ms</td>
          <td>{{ fmt(s.result.burnt * 100, 1) }} %</td>
          <td>{{ fmt(s.derived.fill * 100, 1) }} %</td>
        </template>
        <td v-else colspan="6" class="err">{{ t(`result.status.${s.result.status}`) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ladder {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th {
  text-align: right;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding: 2px 8px;
  border-bottom: 1px solid var(--el-border-color);
}
td {
  text-align: right;
  padding: 1px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
th:first-child,
td:first-child {
  text-align: left;
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover {
  background: var(--el-fill-color-light);
}
tr.focus {
  background: var(--el-color-primary-light-9);
  font-weight: 600;
}
.over {
  color: var(--el-color-danger);
}
.err {
  color: var(--el-color-warning);
  text-align: left;
}
</style>
