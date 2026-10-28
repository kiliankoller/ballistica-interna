<script setup lang="ts">
// Searchable choice of a caliber, projectile or propellant: the user's own components first, then the
// master data BallisticaInterna ships. Projectiles are offered only once a caliber is chosen, and only those that fit it.
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { ComponentKind, LibraryEntry, ListItem } from '../../../shared/api';
import { caliberBulletDiameter, fitsCaliber, recordNotes } from '../lib/components';
import { useLoads, type LoadDoc } from '../stores/loads';

const props = defineProps<{ doc: LoadDoc; kind: ComponentKind; current: string }>();
const emit = defineEmits<{ settings: [] }>();
const { t } = useI18n();
const loads = useLoads();

const master = ref<ListItem[]>([]);
const own = ref<LibraryEntry[]>([]);
const selected = ref<string | null>(null);

/** Bullet diameter of the load's caliber (projectiles only; NaN: no caliber chosen yet). */
const g1 = computed(() => (props.kind === 'projectile' ? caliberBulletDiameter(props.doc.file) : NaN));
const needsCaliber = computed(() => props.kind === 'projectile' && !props.doc.file.caliber.CaliberName?.value);
// a caliber without G1 (e.g. typed into an older load file) cannot filter: all bullets are offered
const fits = (i: { diameter?: number | null }) =>
  props.kind !== 'projectile' || !Number.isFinite(g1.value) || (i.diameter != null && fitsCaliber(i.diameter, g1.value));

const options = computed(() => {
  const groups = [];
  const ownItems = own.value.filter(fits);
  const masterItems = master.value.filter(fits);
  // bullets the maker publishes no (unambiguous) length for are offered, marked: the user measures it
  const label = (i: ListItem) => (/length_(missing|ambiguous)/.test(i.flags ?? '') ? `${i.label} · ${t('select.lengthMissing')}` : i.label);
  if (ownItems.length) groups.push({ label: t('select.own'), options: ownItems.map((i) => ({ value: `own:${i.id}`, label: i.label })) });
  if (masterItems.length) groups.push({ label: t('select.master'), options: masterItems.map((i) => ({ value: `master:${i.id}`, label: label(i) })) });
  return groups;
});

const placeholder = computed(() => {
  if (needsCaliber.value) return t('select.caliberFirst');
  if (props.current) return props.current;
  return props.kind === 'projectile' && !options.value.length ? t('select.noFitting') : t('select.placeholder');
});

async function refresh() {
  [own.value, master.value] = await loads.componentLists(props.kind);
}

async function choose(value: string) {
  const [source, id] = value.split(':') as ['own' | 'master', string];
  try {
    const record = source === 'own' ? await window.api.libraryRecord(Number(id)) : await window.api.masterRecord(props.kind, Number(id));
    if (record) {
      const name = source === 'master' ? String(record.source_name ?? '') : String(record.origin ?? '');
      const notes = source === 'master' ? recordNotes(record) : [];
      loads.applyComponent(props.doc, props.kind, record, { from: source, name: name || undefined, notes: notes.length ? notes : undefined });
    }
  } catch (e) {
    ElMessage.error(t('errors.failed', { msg: e instanceof Error ? e.message : String(e) }));
  }
  selected.value = null;
}

onMounted(refresh);
watch(() => loads.dbVersion, refresh);
</script>

<template>
  <el-select-v2
    v-if="options.length || kind === 'projectile'"
    v-model="selected"
    class="select"
    :options="options"
    :disabled="needsCaliber || !options.length"
    filterable
    :placeholder="placeholder"
    size="small"
    @change="choose"
  />
  <el-button v-else class="select" size="small" text @click="emit('settings')">{{ current || t('select.noDb') }}</el-button>
</template>

<style scoped>
.select {
  width: 100%;
}
.select :deep(.el-select__placeholder) {
  color: var(--el-text-color-primary);
  font-weight: 600;
}
</style>
