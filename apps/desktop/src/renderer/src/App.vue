<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { Document, DocumentAdd, FolderOpened, Printer, Setting } from '@element-plus/icons-vue';
import de from 'element-plus/es/locale/lang/de';
import en from 'element-plus/es/locale/lang/en';
import type { OpenedFile, ReportMode } from '../../shared/api';
import LoadView from './components/LoadView.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import DisclaimerDialog from './components/DisclaimerDialog.vue';
import { DISCLAIMER_VERSION } from '../../shared/api';
import { reportHtml } from './lib/report';
import { useLoads } from './stores/loads';
import { setDecimalComma } from './lib/units';

const { t, locale } = useI18n();
const loads = useLoads();
const settingsOpen = ref(false);
const elLocale = computed(() => (locale.value === 'de' ? de : en));
// German shows numbers with a decimal comma
watch(locale, (l) => setDecimalComma(l === 'de'), { immediate: true });

const fileName = (path: string) => path.replace(/^.*[\\/]/, '');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Opens a load file; one that cannot be read is reported and left closed. */
function openChecked(f: OpenedFile): boolean {
  try {
    loads.openFile(f);
    return true;
  } catch (e) {
    ElMessage.error({ message: t('errors.openFailed', { name: fileName(f.path), msg: message(e) }), duration: 0, showClose: true });
    return false;
  }
}

async function open() {
  const f = await window.api.openLoad();
  if (f) openChecked(f);
}

function newLoad() {
  loads.newLoad(t('untitled'));
}

/** Saves a load; false when cancelled or failed (the error is reported). */
async function saveDoc(doc: NonNullable<typeof loads.active>, saveAs = false): Promise<boolean> {
  try {
    return await loads.save(doc, saveAs);
  } catch (e) {
    ElMessage.error(t('errors.failed', { msg: message(e) }));
    return false;
  }
}

async function save(saveAs = false) {
  if (loads.active) await saveDoc(loads.active, saveAs);
}

async function report(mode: ReportMode) {
  const doc = loads.active;
  if (!doc) return;
  try {
    await window.api.exportPdf({ title: doc.name, html: reportHtml(doc, t, locale.value) }, mode);
  } catch (e) {
    ElMessage.error(t('errors.reportFailed', { msg: message(e) }));
  }
}

function onKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key === 'o') (e.preventDefault(), void open());
  if (e.key === 'n') (e.preventDefault(), newLoad());
  if (e.key === 's') (e.preventDefault(), void save(e.shiftKey));
  if (e.key === 'p') (e.preventDefault(), void report('view'));
}

/** Closes a load tab; an unsaved load asks whether to save it first. */
async function closeTab(id: number) {
  const doc = loads.docs.find((d) => d.id === id);
  if (!doc) return;
  if (doc.dirty) {
    try {
      await ElMessageBox.confirm(t('close.message', { name: doc.name }), t('close.title'), {
        confirmButtonText: t('close.save'),
        cancelButtonText: t('close.discard'),
        distinguishCancelAndClose: true,
        type: 'warning',
      });
      if (!(await saveDoc(doc))) return; // save dialog cancelled or saving failed
    } catch (action) {
      if (action !== 'cancel') return; // closed the question: keep the tab
    }
  }
  loads.close(id);
}

// the main process asks before the window closes while a load is unsaved
watchEffect(() => window.api.setDirty(loads.docs.some((d) => d.dirty)));

const disclaimerOpen = ref(false);
const restored = ref(false);

// remember the open files (not yet saved loads have no path) for the next start
watchEffect(() => {
  if (!restored.value) return;
  void window.api.setSettings({
    openFiles: loads.docs.flatMap((d) => (d.path ? [d.path] : [])),
    activeFile: loads.active?.path ?? '',
  });
});

onMounted(async () => {
  const s = await window.api.getSettings();
  locale.value = s.language;
  loads.units = s.units ?? {};
  disclaimerOpen.value = s.disclaimerAccepted !== DISCLAIMER_VERSION;
  // reopen the files of the last session that still exist; one that cannot be read is reported and, since only the
  // open loads are remembered, dropped from the list
  for (const path of s.openFiles ?? []) {
    const f = await window.api.readLoad(path);
    if (f) openChecked(f);
  }
  const last = loads.docs.find((d) => d.path === s.activeFile);
  if (last) loads.activeId = last.id;
  restored.value = true;
  window.addEventListener('keydown', onKey);
  // used by the screenshot check of the main process
  const check = window as unknown as {
    __openForCheck: (f: OpenedFile) => void;
    __compareForCheck: () => void;
    __reportForCheck: () => string;
  };
  check.__openForCheck = (f) => loads.openFile(f);
  check.__compareForCheck = () => {
    const a = loads.active;
    if (a) a.compare = loads.docs.filter((d) => d.id !== a.id).map((d) => d.id);
  };
  check.__reportForCheck = () => (loads.active ? reportHtml(loads.active, t, locale.value) : '');
});

const tabLabel = (d: { name: string; dirty: boolean }) => (d.dirty ? `${d.name} •` : d.name);
</script>

<template>
  <el-config-provider :locale="elLocale" size="small">
    <div class="app">
      <div class="toolbar">
        <el-button :icon="DocumentAdd" text @click="newLoad">{{ t('menu.new') }}</el-button>
        <el-button :icon="FolderOpened" text @click="open">{{ t('menu.open') }}</el-button>
        <el-button :icon="Document" text :disabled="!loads.active" @click="save()">{{ t('menu.save') }}</el-button>
        <el-button text :disabled="!loads.active" @click="save(true)">{{ t('menu.saveAs') }}</el-button>
        <el-dropdown :disabled="!loads.active" @command="(mode: ReportMode) => report(mode)">
          <el-button :icon="Printer" text :disabled="!loads.active">{{ t('menu.report') }}</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="view">{{ t('menu.reportView') }}</el-dropdown-item>
              <el-dropdown-item command="save">{{ t('menu.reportSave') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span class="spacer" />
        <el-button :icon="Setting" text @click="settingsOpen = true">{{ t('menu.settings') }}</el-button>
      </div>
      <el-tabs
        v-if="loads.docs.length"
        :model-value="loads.activeId ?? undefined"
        type="card"
        closable
        class="tabs"
        @update:model-value="(id: string | number) => (loads.activeId = Number(id))"
        @tab-remove="(id: string | number) => closeTab(Number(id))"
      >
        <el-tab-pane v-for="d in loads.docs" :key="d.id" :name="d.id" :label="tabLabel(d)" />
      </el-tabs>
      <div v-if="loads.active" class="path">{{ loads.active.path ?? t('unsaved') }}</div>
      <main>
        <LoadView v-if="loads.active" :key="loads.active.id" :doc="loads.active" @settings="settingsOpen = true" />
        <div v-else class="empty">
          <el-button type="primary" :icon="DocumentAdd" @click="newLoad">{{ t('menu.new') }}</el-button>
          <el-button :icon="FolderOpened" @click="open">{{ t('menu.open') }}</el-button>
        </div>
      </main>
      <SettingsDialog v-model="settingsOpen" />
      <DisclaimerDialog v-model="disclaimerOpen" />
    </div>
  </el-config-provider>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}
.toolbar .el-button + .el-button {
  margin-left: 0;
}
.spacer {
  flex: 1;
}
.tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 4px 6px 0;
}
.path {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 2px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
main {
  flex: 1;
  min-height: 0;
  background: var(--el-bg-color-page);
}
.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
