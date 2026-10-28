<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { GRAIN, caseCapacityGrainsH2O, obtNodeLabel } from '@ballistica-interna/solver';
import { fmt } from '../lib/units';
import { SHORT_JUMP_START_PRESSURE } from '../lib/jump';
import { noticeGroups, noticesOf } from '../lib/notices';
import { selectedStep, useLoads, type LoadDoc } from '../stores/loads';

const props = defineProps<{ doc: LoadDoc }>();
const { t } = useI18n();
const loads = useLoads();

const step = computed(() => selectedStep(props.doc));
const r = computed(() => step.value?.result);
const d = computed(() => step.value?.derived);
const load = computed(() => props.doc.result.load);
const f = computed(() => props.doc.file);

const summary = computed(() => {
  const l = load.value;
  if (!l) return '';
  const w = f.value.propellant;
  const powder = [w.mname?.value, w.pname?.value].filter(Boolean).join(' ') + (w.lotid?.value ? ` (${w.lotid.value})` : '');
  return [
    `${t('result.projectile')}: ${f.value.projectile.ProjectileName?.value ?? ''}`,
    `${t('result.charge')}: ${powder}, ${fmt((step.value?.charge ?? l.propellant.charge) / GRAIN, 2)} grain`,
  ];
});
const geometry = computed(() => {
  const l = load.value;
  if (!l) return '';
  return `L3/CL: ${fmt(l.cartridge.caseLength * 1e3, 2)} mm, L6/OAL: ${fmt(Number(f.value.caliber.oal?.value), 2)} mm, ${t('field.seatingDepth')}: ${fmt(
    l.projectile.seatingDepth * 1e3,
    2,
  )} mm, ${t('field.bulletLength')}: ${fmt(l.projectile.length * 1e3, 2)} mm, ${t('field.caseCapacity')}: ${fmt(caseCapacityGrainsH2O(l.cartridge.caseVolume), 2)} grain H2O`;
});

/** Danger, caution and the note next to the result, see lib/warnings.ts (resultNotices). */
const notices = computed(() => noticeGroups(noticesOf(props.doc)));
const setStartPressure = () => loads.setSI(props.doc, 'projectile', 'gpressure', SHORT_JUMP_START_PRESSURE);

const left = computed<[string, string, string?][]>(() => {
  const x = r.value;
  const y = d.value;
  if (!x || !y || x.status !== 'ok') return [];
  return [
    [t('result.maxPressure'), `${fmt(x.maxPressure / 1e5, 0)} bar`, 'pressure'],
    [t('result.muzzlePressure'), `${fmt(x.muzzlePressure / 1e5, 0)} bar`, 'pressure'],
    [t('result.muzzleEnergy'), `${fmt(x.muzzleEnergy, 0)} J`],
    [t('result.muzzleVelocity'), `${fmt(x.muzzleVelocity, 1)} m/s`, 'velocity'],
    [t('result.barrelTime'), `${fmt(x.barrelTime * 1e3, 4)} ms`],
    [t('result.bulletLeadTime'), `${fmt(x.bulletLeadTime * 1e3, 4)} ms`],
    [t('result.obt'), y.obt ? `${fmt(y.obt.time * 1e3, 4)} ms (${obtNodeLabel(y.obt.node)})` : '—'],
  ];
});
const right = computed<[string, string][]>(() => {
  const x = r.value;
  const y = d.value;
  if (!x || x.status !== 'ok' || !y) return [];
  return [
    [t('result.muzzleRpm'), Number.isFinite(y.muzzleRpm) ? `${fmt(y.muzzleRpm / 1000, 1)} k 1/min` : '—'],
    [t('result.recoilEnergy'), Number.isFinite(y.recoilEnergy) ? `${fmt(y.recoilEnergy, 1)} J` : '—'],
    [t('result.ipscMip'), `${fmt(y.ipsc, 0)}, ${fmt(y.mip, 0)}`],
    [t('result.fill'), `${fmt(y.fill * 100, 1)} %`],
    [t('result.burnt'), `${fmt(x.burnt * 100, 1)} %`],
    [t('result.efficiency'), `${fmt(x.efficiency * 100, 1)} %`],
  ];
});
</script>

<template>
  <div class="results">
    <h2>{{ f.caliber.CaliberName?.value || t('untitled') }}</h2>
    <p v-for="line in summary" :key="line" class="sub">{{ line }}</p>
    <p class="sub">{{ geometry }}</p>
    <div v-if="doc.result.issues.length" class="warn">
      {{ t('result.incomplete') }}
      <ul>
        <li v-for="i in doc.result.issues" :key="`${i.section}.${i.name}.${i.problem}`">
          {{ t(`panel.${i.section === 'gun' ? 'caliber' : i.section}`) }}: <b>{{ t(`field.${i.label}`) }}</b> – {{ t(i.problem) }}
        </li>
      </ul>
    </div>
    <p v-else-if="doc.result.error" class="warn">{{ t('result.failed', { msg: doc.result.error }) }}</p>
    <p v-else-if="r && r.status !== 'ok'" class="warn">{{ t(`result.status.${r.status}`) }}</p>
    <div v-else class="cols">
      <table>
        <tr v-for="[k, v, tone] in left" :key="k" :class="tone">
          <th>{{ k }}:</th>
          <td>{{ v }}</td>
        </tr>
      </table>
      <table>
        <tr v-for="[k, v] in right" :key="k">
          <th>{{ k }}:</th>
          <td>{{ v }}</td>
        </tr>
      </table>
    </div>
    <div v-for="g in notices" :key="g.level" class="notice" :class="g.level">
      <div class="level">{{ t(`result.level.${g.level}`) }}</div>
      <ul>
        <li v-for="n in g.items" :key="n.key">
          <template v-if="n.charge">{{ t('result.atCharge', { charge: n.charge }) }} </template>{{ t(n.key, n.args ?? {}) }}
          <el-button v-if="n.action === 'startPressure'" size="small" type="danger" plain @click="setStartPressure">{{ t('result.setStartPressure') }}</el-button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.results {
  padding: 6px 10px;
}
h2 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 500;
}
.sub {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.cols {
  display: flex;
  gap: 28px;
  margin-top: 10px;
  font-size: 12.5px;
}
th {
  text-align: left;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  padding: 1px 14px 1px 0;
}
td {
  padding: 1px 0;
}
tr.pressure th {
  color: var(--el-color-danger);
}
tr.velocity th {
  color: var(--el-color-primary);
}
.warn {
  color: var(--el-color-warning);
  margin: 10px 0;
}
.warn ul {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 12.5px;
}
/* three levels: danger (red), caution (yellow), note (grey, always shown) */
.notice {
  margin: 10px 0 0;
  padding: 6px 8px;
  border: 1px solid;
  border-radius: 3px;
  font-size: 12px;
}
.notice .level {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.04em;
}
.notice ul {
  margin: 2px 0 0;
  padding-left: 16px;
}
.notice li + li {
  margin-top: 3px;
}
.notice .el-button {
  margin-left: 8px;
}
.notice.danger {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger-dark-2);
  background: var(--el-color-danger-light-9);
}
.notice.caution {
  border-color: var(--el-color-warning);
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}
.notice.note {
  border-color: var(--el-border-color);
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
}
</style>
