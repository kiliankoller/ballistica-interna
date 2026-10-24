<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { GRAIN, caseCapacityGrainsH2O, obtNodeLabel } from '@ballistica-interna/solver';
import { fmt } from '../lib/units';
import { SHORT_JUMP, SHORT_JUMP_START_PRESSURE } from '../lib/jump';
import { capacitySource } from '../lib/capacity';
import { loadWarnings, pressureMargin } from '../lib/warnings';
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

/** Jump below 1.5 mm with a start pressure below 800 bar: the real pressure can be far higher (lib/jump.ts). */
const shortJump = computed(() => {
  const jump = d.value?.jump ?? NaN;
  const start = load.value?.projectile.startPressure ?? NaN;
  return Number.isFinite(jump) && jump < SHORT_JUMP && start < SHORT_JUMP_START_PRESSURE - 1e5 ? jump : null;
});
/** Handgun (barrel below 300 mm, as in the accuracy script): the pressure of the model is too low (docs/MODEL.md). */
const handgun = computed(() => (load.value?.gun.barrelLength ?? 1) < 0.3);
/** The gun's twist is longer than the bullet maker's minimum: the bullet may not be stabilised. */
const slowTwist = computed(() => {
  const twist = load.value?.gun.twistLength ?? 0;
  const min = props.doc.minTwist;
  return min && twist > 0 && twist * 1e3 > min + 0.5 ? { twist: twist / 0.0254, min: min / 25.4 } : null;
});
/** Source of the case capacity (estimated, from load data, own), see lib/capacity.ts. */
const capacity = computed(() => capacitySource(f.value));
/** Low fill ratio, a slow powder loosely filled and an estimated case capacity, see lib/warnings.ts. */
const warnings = computed(() => loadWarnings(d.value?.fill, load.value?.propellant.Ba, capacity.value));
/** How far the measured pressure exceeded the calculation in the tests at this fill ratio. */
const margin = computed(() => {
  const m = pressureMargin(d.value?.fill);
  const p = r.value?.status === 'ok' ? r.value.maxPressure : NaN;
  return m !== undefined && Number.isFinite(p) ? { pct: fmt(m * 100, 0), bar: fmt((p * (1 + m)) / 1e5, 0) } : null;
});
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
    <p v-if="margin" class="sub">{{ t('result.pressureMargin', margin) }} {{ t(`result.capacitySource.${capacity}`) }}</p>
    <div v-if="warnings.estimatedCapacity" class="jump">{{ t('result.capacityEstimated') }}</div>
    <div v-if="shortJump !== null" class="jump">
      {{ t('result.shortJump', { jump: fmt(shortJump * 1e3, 1) }) }}
      <el-button size="small" type="warning" plain @click="setStartPressure">{{ t('result.setStartPressure') }}</el-button>
    </div>
    <div v-if="warnings.lowFill" class="jump" :class="{ danger: warnings.veryLowFill }">{{ t('result.lowFill', { fill: fmt((d?.fill ?? 0) * 100, 0) }) }}</div>
    <div v-if="warnings.slowPowderLowFill" class="jump danger">{{ t('result.slowPowderLowFill') }}</div>
    <div v-if="handgun" class="jump">{{ t('result.handgun') }}</div>
    <div v-if="slowTwist" class="jump">{{ t('result.slowTwist', { twist: fmt(slowTwist.twist, 1), min: fmt(slowTwist.min, 1) }) }}</div>
    <p class="note">{{ t('result.uncalibrated') }}</p>
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
/* red: the pressure may be far higher than calculated */
.jump.danger {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger-dark-2);
  background: var(--el-color-danger-light-9);
}
.jump {
  margin: 10px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--el-color-warning);
  border-radius: 3px;
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
  font-size: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--el-color-warning);
}
</style>
