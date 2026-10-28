<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { computed, ref } from 'vue';
import { CollectionTag, EditPen, Plus } from '@element-plus/icons-vue';
import type { ComponentKind, DbRecord } from '../../../shared/api';
import { recordFromLoad } from '../lib/components';
import type { FieldRow } from '../lib/fields';
import { useLoads, type LoadDoc } from '../stores/loads';
import ComponentEditor from './ComponentEditor.vue';
import ComponentSelect from './ComponentSelect.vue';
import PropertyGrid from './PropertyGrid.vue';

const props = defineProps<{ doc: LoadDoc; kind: ComponentKind; title: string; current: string; rows: FieldRow[] }>();
const emit = defineEmits<{ settings: [] }>();
const { t } = useI18n();
const loads = useLoads();

const sourceText = computed(() => {
  const o = props.doc.sources[props.kind];
  // always name a source: values not taken from a list come from the opened file or were typed in
  if (!o) return t(props.doc.path ? 'source.file' : 'source.input');
  if (o.from === 'master') return t('source.master', { name: o.name ?? '' });
  return o.name ? t('source.ownCopy', { name: o.name }) : t(`own.${props.kind}.source`);
});

const editorOpen = ref(false);
const editorRecord = ref<DbRecord | null>(null);
const editorOrigin = ref('');

/** A new own component, or the component of this load as an own copy (the original is not changed). */
function openEditor(copy: boolean) {
  editorRecord.value = copy ? recordFromLoad(props.kind, props.doc.file, props.current) : null;
  editorOrigin.value = copy ? props.current : '';
  editorOpen.value = true;
}

/** Stores the component as it is in this load (e.g. with a measured case capacity) in the library. */
async function saveOwn() {
  let name: string;
  try {
    const { value } = await ElMessageBox.prompt(t(`own.${props.kind}.namePrompt`), t(`own.${props.kind}.saveTitle`), {
      inputValue: props.current,
      inputValidator: (v: string) => v.trim().length > 0,
      confirmButtonText: t('library.save'),
      cancelButtonText: t('library.cancel'),
    });
    name = value.trim();
  } catch {
    return; // cancelled
  }
  try {
    // an own copy remembers what it was taken from
    const record = { ...recordFromLoad(props.kind, props.doc.file, name), origin: props.current };
    await window.api.librarySave(props.kind, name, record);
    loads.dbVersion++;
    ElMessage.success(t('library.saved', { name }));
  } catch (e) {
    ElMessage.error(t('errors.failed', { msg: e instanceof Error ? e.message : String(e) }));
  }
}
</script>

<template>
  <section class="panel">
    <header>
      <span>{{ title }}</span>
      <span>
        <el-tooltip :content="t(`own.${kind}.newEntry`)" placement="top">
          <el-button :icon="Plus" text size="small" class="own" @click="openEditor(false)" />
        </el-tooltip>
        <el-tooltip :content="t(`own.${kind}.editCopy`)" placement="top">
          <el-button :icon="EditPen" text size="small" class="own" :disabled="!current" @click="openEditor(true)" />
        </el-tooltip>
        <el-tooltip :content="t(`own.${kind}.saveTitle`)" placement="top">
          <el-button :icon="CollectionTag" text size="small" class="own" @click="saveOwn" />
        </el-tooltip>
      </span>
    </header>
    <div class="choose">
      <ComponentSelect :doc="doc" :kind="kind" :current="current" @settings="emit('settings')" />
      <div class="source">{{ sourceText }}</div>
      <div v-for="note in doc.sources[kind]?.notes ?? doc.notes[kind] ?? []" :key="note" class="warn">{{ t(note) }}</div>
      <div v-if="kind === 'projectile' && doc.minTwist" class="source">{{ t('source.minTwist', { twist: (doc.minTwist / 25.4).toFixed(1).replace(/\.0$/, '') }) }}</div>
    </div>
    <PropertyGrid :doc="doc" :rows="rows" />
    <ComponentEditor v-model="editorOpen" :kind="kind" :record="editorRecord" :origin="editorOrigin" />
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  border-radius: 3px;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 2px 4px 2px 8px;
  border-bottom: 1px solid var(--el-border-color);
}
.own {
  height: 18px;
  padding: 0 4px;
}
.source {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.warn {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-color-warning-dark-2);
}
.choose {
  padding: 4px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
</style>
