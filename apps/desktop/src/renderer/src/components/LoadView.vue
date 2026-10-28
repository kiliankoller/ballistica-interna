<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { powderLabel } from '../lib/components';
import { CALIBER_ROWS, PROJECTILE_ROWS, PROPELLANT_ROWS } from '../lib/fields';
import { selectedStep, useLoads, type LoadDoc } from '../stores/loads';
import CartridgePanel from './CartridgePanel.vue';
import CurveChart, { type ChartCurve, type ChartMarks } from './CurveChart.vue';
import InputPanel from './InputPanel.vue';
import LadderTable from './LadderTable.vue';
import ResultsPanel from './ResultsPanel.vue';

const props = defineProps<{ doc: LoadDoc }>();
const emit = defineEmits<{ settings: [] }>();
const { t } = useI18n();
const loads = useLoads();

const COMPARE_COLORS = ['#e6a23c', '#2fa86b', '#9b59b6', '#16a0b4', '#d4689a'];
const others = computed(() => loads.docs.filter((d) => d.id !== props.doc.id));
const compared = computed(() =>
  props.doc.compare
    .map((id, i) => ({ doc: loads.docs.find((d) => d.id === id), color: COMPARE_COLORS[i % COMPARE_COLORS.length]! }))
    .filter((c): c is { doc: LoadDoc; color: string } => c.doc !== undefined),
);

const curves = computed<ChartCurve[]>(() => {
  const own = props.doc.result.steps.map((s, i): ChartCurve => ({ result: s.result, role: i === props.doc.focus ? 'focus' : 'step' }));
  // the selected step last, so it is drawn on top
  own.sort((a, b) => (a.role === 'focus' ? 1 : 0) - (b.role === 'focus' ? 1 : 0));
  const extra = compared.value.flatMap(({ doc, color }): ChartCurve[] => {
    const step = selectedStep(doc);
    return step ? [{ result: step.result, role: 'compare', color }] : [];
  });
  return [...extra, ...own];
});
const marks = computed<ChartMarks>(() => {
  const load = props.doc.result.load;
  const step = selectedStep(props.doc);
  return load
    ? { bulletMass: load.projectile.mass, z1: load.propellant.z1, z2: load.propellant.z2, obt: step?.derived.obt?.time }
    : {};
});
const maxAllowed = computed(() => props.doc.result.load?.cartridge.maxPressure ?? 0);
const powderName = computed(() => powderLabel(props.doc.file));
</script>

<template>
  <div class="load">
    <div class="col">
      <InputPanel
        :doc="doc"
        kind="caliber"
        :title="t('panel.caliber')"
        :current="doc.file.caliber.CaliberName?.value ?? ''"
        :rows="CALIBER_ROWS"
        @settings="emit('settings')"
      />
      <CartridgePanel :doc="doc" class="grow" />
    </div>
    <div class="col">
      <InputPanel
        :doc="doc"
        kind="projectile"
        :title="t('panel.projectile')"
        :current="doc.file.projectile.ProjectileName?.value ?? ''"
        :rows="PROJECTILE_ROWS"
        @settings="emit('settings')"
      />
      <InputPanel
        :doc="doc"
        kind="propellant"
        :title="t('panel.propellant')"
        :current="powderName"
        :rows="PROPELLANT_ROWS"
        @settings="emit('settings')"
      />
    </div>
    <div class="col results">
      <section class="panel">
        <ResultsPanel :doc="doc" />
        <LadderTable v-if="doc.result.steps.length > 1" :doc="doc" class="ladder" />
      </section>
      <section class="panel grow chart">
        <div class="chart-head">
          <el-select
            v-if="others.length"
            v-model="doc.compare"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            :placeholder="t('compare.placeholder')"
            class="compare"
          >
            <el-option v-for="o in others" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
          <span v-for="c in compared" :key="c.doc.id" class="legend">
            <i :style="{ borderColor: c.color }" />{{ c.doc.name }}
          </span>
        </div>
        <div class="chart-body"><CurveChart :curves="curves" :max-allowed="maxAllowed" :marks="marks" /></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.load {
  display: grid;
  grid-template-columns: minmax(330px, 1fr) minmax(330px, 1fr) minmax(480px, 2fr);
  gap: 6px;
  padding: 6px;
  height: 100%;
  min-height: 0;
  overflow: auto;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.grow {
  flex: 1;
}
.chart {
  padding: 6px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}
.chart-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.chart-head:empty {
  display: none;
}
.compare {
  width: 240px;
}
.legend {
  font-size: 11px;
  color: var(--el-text-color-regular);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend i {
  display: inline-block;
  width: 18px;
  border-top: 2px dashed;
}
.chart-body {
  flex: 1;
  min-height: 0;
}
.ladder {
  margin: 4px 0 8px;
}
</style>
