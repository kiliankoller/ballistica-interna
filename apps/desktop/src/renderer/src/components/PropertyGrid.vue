<script setup lang="ts">
// Property/value rows: click the unit to switch it.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldRow } from '../lib/fields';
import { fmt, parseInput, unitOf, unitsOf } from '../lib/units';
import { useLoads, type LoadDoc } from '../stores/loads';

const props = defineProps<{ doc: LoadDoc; rows: FieldRow[] }>();
const { t } = useI18n();
const loads = useLoads();

const main = computed(() => props.rows.filter((r) => !r.optional));
const optional = computed(() => props.rows.filter((r) => r.optional));

/** The problem of each field the load check found (see lib/loadCheck.ts), by `section.name`. */
const issues = computed(() => new Map(props.doc.result.issues.map((i) => [`${i.section}.${i.name}`, t(i.problem)])));
const issueOf = (row: FieldRow): string => issues.value.get(`${row.section}.${row.name}`) ?? '';

const unitKey = (row: FieldRow) => (row.section ? `${row.section}.${row.name}` : row.key);
const unit = (row: FieldRow) => unitOf(row.quantity, loads.units[unitKey(row)]);

function cycleUnit(row: FieldRow) {
  const list = unitsOf(row.quantity);
  if (list.length < 2) return;
  const i = list.findIndex((u) => u.id === unit(row).id);
  loads.setUnit(unitKey(row), list[(i + 1) % list.length]!.id);
}

function display(row: FieldRow): string {
  const si = row.computed
    ? props.doc.result.steps[0]?.derived[row.computed]
    : row.section && row.name
      ? loads.valueSI(props.doc, row.section, row.name)
      : NaN;
  return fmt(si === undefined ? undefined : unit(row).fromSI(si), row.decimals);
}

function commit(row: FieldRow, input: HTMLInputElement) {
  if (!row.section || !row.name) return;
  const v = parseInput(input.value);
  // a cleared field is empty (the load check asks for a required one), not 0
  if (v === '') loads.setRaw(props.doc, row.section, row.name, '');
  else if (v !== null) loads.setSI(props.doc, row.section, row.name, unit(row).toSI(v));
  // text that is no number is not taken: show the stored value again
  else input.value = display(row);
}

function onKey(e: KeyboardEvent, row: FieldRow) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  if (e.key === 'Escape') {
    (e.target as HTMLInputElement).value = display(row);
    (e.target as HTMLInputElement).blur();
  }
}
</script>

<template>
  <table class="grid">
    <tbody>
      <template v-for="(group, gi) in [main, optional]" :key="gi">
        <tr v-if="gi === 1 && group.length" class="group">
          <td colspan="3">{{ t('panel.optional') }}</td>
        </tr>
        <tr v-for="row in group" :key="row.key" :class="{ computed: row.computed, issue: issueOf(row) }">
          <td class="label" :title="[issueOf(row), t(`hint.${row.key}`)].filter(Boolean).join(' – ')">{{ t(`field.${row.key}`) }}</td>
          <td class="value">
            <select
              v-if="row.options && row.section && row.name"
              :value="loads.raw(doc, row.section, row.name)"
              @change="loads.setRaw(doc, row.section!, row.name!, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="o in row.options" :key="o.value" :value="o.value">{{ t(o.label) }}</option>
            </select>
            <span v-else-if="row.computed">{{ display(row) }}</span>
            <input
              v-else
              :value="display(row)"
              spellcheck="false"
              @change="commit(row, $event.target as HTMLInputElement)"
              @keydown="onKey($event, row)"
            />
          </td>
          <td class="unit">
            <button v-if="unit(row).label" type="button" :disabled="unitsOf(row.quantity).length < 2" @click="cycleUnit(row)">
              {{ unit(row).label }}
            </button>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
td {
  padding: 0 6px;
  height: 23px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
.label {
  color: var(--el-text-color-regular);
  width: 48%;
}
.value {
  text-align: right;
}
.value input,
.value select {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: right;
  padding: 1px 4px;
  border-radius: 2px;
}
.value input:hover,
.value select:hover {
  border-color: var(--el-border-color);
}
.value input:focus {
  outline: none;
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-blank);
}
.unit {
  width: 1%;
}
.unit button {
  border: none;
  background: none;
  color: var(--el-text-color-secondary);
  font: inherit;
  cursor: pointer;
  padding: 0 2px;
  min-width: 52px;
  text-align: left;
}
.unit button:disabled {
  cursor: default;
}
.unit button:not(:disabled):hover {
  color: var(--el-color-primary);
}
tr.computed .label,
tr.computed .value {
  color: var(--el-text-color-secondary);
}
tr.computed .value span {
  padding-right: 5px;
}
tr.issue td {
  background: var(--el-color-danger-light-9);
}
tr.issue .label {
  color: var(--el-color-danger);
  font-weight: 600;
}
tr.issue .value input,
tr.issue .value select {
  border-color: var(--el-color-danger);
}
tr.group td {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
</style>
