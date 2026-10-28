<script setup lang="ts">
// Creates or changes an own caliber, projectile or propellant in the library. A master record is never
// changed: editing one makes an own copy that remembers its origin.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { ComponentKind, DbRecord } from '../../../shared/api';
import { COMPONENT_FIELDS, checkComponent, componentLabel, recordFromValues } from '../lib/componentFields';
import { useLoads } from '../stores/loads';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  kind: ComponentKind;
  /** Values to start from (empty for a new component). */
  record: DbRecord | null;
  /** Library entry being changed; without it the result is saved as a new own component. */
  libraryId?: number | null;
  /** Label of the component the values were taken from (stored as origin of the copy). */
  origin?: string;
}>();
const emit = defineEmits<{ saved: [id: number] }>();
const { t } = useI18n();
const loads = useLoads();

const fields = computed(() => COMPONENT_FIELDS[props.kind]);
const values = ref<Record<string, string>>({});
const problems = ref<Record<string, string>>({});

// immediate: the settings mount the editor only when it is opened (open is already true then)
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    const r = props.record ?? {};
    values.value = Object.fromEntries(fields.value.map((f) => [f.key, r[f.key] === null || r[f.key] === undefined ? '' : String(r[f.key])]));
    problems.value = {};
  },
  { immediate: true },
);

const title = computed(() =>
  t(`own.${props.kind}.${props.libraryId ? 'titleChange' : props.record ? 'titleCopy' : 'titleNew'}`),
);

async function save() {
  const r = recordFromValues(props.kind, props.record, values.value, props.libraryId ? undefined : props.origin);
  problems.value = Object.fromEntries(checkComponent(props.kind, r).map(([key, msg, params]) => [key, t(msg, params)]));
  if (Object.keys(problems.value).length) return;
  const label = componentLabel(props.kind, r);
  try {
    const id = props.libraryId ? (await window.api.libraryUpdate(props.libraryId, label, r), props.libraryId) : await window.api.librarySave(props.kind, label, r);
    loads.dbVersion++;
    ElMessage.success(t('library.saved', { name: label }));
    emit('saved', id);
    open.value = false;
  } catch (e) {
    ElMessage.error(t('errors.failed', { msg: e instanceof Error ? e.message : String(e) }));
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="title" width="520px" append-to-body>
    <p v-if="origin && !libraryId" class="origin">{{ t('editor.copyOf', { name: origin }) }}</p>
    <el-form label-width="190px" size="small" @submit.prevent="save">
      <el-form-item v-for="f in fields" :key="f.key" :label="t(`field.${f.label}`)" :required="f.required" :error="problems[f.key]">
        <el-input v-model="values[f.key]" :inputmode="f.text ? 'text' : 'decimal'">
          <template v-if="f.unit" #append>{{ f.unit }}</template>
        </el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button size="small" @click="open = false">{{ t('library.cancel') }}</el-button>
      <el-button size="small" type="primary" @click="save">{{ t('library.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.origin {
  margin: 0 0 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
