<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen } from '@element-plus/icons-vue';
import type { DbRecord, LibraryEntry, Settings } from '../../../shared/api';
import ComponentEditor from './ComponentEditor.vue';
import { useLoads } from '../stores/loads';

const open = defineModel<boolean>({ required: true });
const { t, locale } = useI18n();
const loads = useLoads();
const settings = ref<Settings | null>(null);
const library = ref<LibraryEntry[]>([]);

async function refreshLibrary() {
  library.value = await window.api.libraryList();
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  settings.value = await window.api.getSettings();
  await refreshLibrary();
});

const notices = ref('');
const noticesOpen = ref(false);

async function showNotices() {
  notices.value = await window.api.thirdPartyNotices();
  noticesOpen.value = true;
}

const editing = ref<LibraryEntry | null>(null);
const editingRecord = ref<DbRecord | null>(null);
const editorOpen = ref(false);

const failed = (e: unknown) => ElMessage.error(t('errors.failed', { msg: e instanceof Error ? e.message : String(e) }));

async function change(entry: LibraryEntry) {
  try {
    editingRecord.value = await window.api.libraryRecord(entry.id);
    editing.value = entry;
    editorOpen.value = true;
  } catch (e) {
    failed(e);
  }
}

async function remove(entry: LibraryEntry) {
  try {
    await ElMessageBox.confirm(t('library.deleteConfirm', { name: entry.label }), t('library.deleteTitle'), {
      confirmButtonText: t('library.delete'),
      cancelButtonText: t('library.cancel'),
      type: 'warning',
    });
  } catch {
    return; // cancelled
  }
  try {
    await window.api.libraryDelete(entry.id);
    await refreshLibrary();
    loads.dbVersion++;
  } catch (e) {
    failed(e);
  }
}

async function exportLibrary() {
  try {
    const path = await window.api.libraryExport();
    if (path) ElMessage.success(t('library.exported', { path }));
  } catch (e) {
    failed(e);
  }
}

async function importLibrary() {
  try {
    const count = await window.api.libraryImport();
    if (count === null) return;
    ElMessage.success(t('library.imported', { count }));
    await refreshLibrary();
    loads.dbVersion++;
  } catch (e) {
    failed(e);
  }
}

async function setLanguage(language: 'de' | 'en') {
  settings.value = await window.api.setSettings({ language });
  locale.value = language;
}

async function setTheme(theme: 'system' | 'light' | 'dark') {
  settings.value = await window.api.setSettings({ theme });
}
</script>

<template>
  <el-dialog v-model="open" :title="t('settings.title')" width="560px">
    <el-form v-if="settings" label-position="top" size="small">
      <el-form-item :label="t('library.title')">
        <el-table :data="library" size="small" max-height="220" :empty-text="t('library.empty')" class="lib">
          <el-table-column :label="t('library.kind')" width="110">
            <template #default="{ row }">{{ t(`panel.${row.kind}`) }}</template>
          </el-table-column>
          <el-table-column prop="label" :label="t('library.name')" />
          <el-table-column width="76">
            <template #default="{ row }">
              <el-button :icon="EditPen" text size="small" :title="t('editor.edit')" @click="change(row)" />
              <el-button :icon="Delete" text size="small" @click="remove(row)" />
            </template>
          </el-table-column>
        </el-table>
        <div class="lib-actions">
          <el-button @click="exportLibrary">{{ t('library.export') }}</el-button>
          <el-button @click="importLibrary">{{ t('library.import') }}</el-button>
        </div>
      </el-form-item>
      <el-form-item :label="t('settings.language')">
        <el-radio-group :model-value="settings.language" @change="(v: string | number | boolean | undefined) => setLanguage(v as 'de' | 'en')">
          <el-radio-button value="de">Deutsch</el-radio-button>
          <el-radio-button value="en">English</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('settings.theme')">
        <el-radio-group :model-value="settings.theme" @change="(v: string | number | boolean | undefined) => setTheme(v as 'system' | 'light' | 'dark')">
          <el-radio-button value="system">{{ t('settings.themeSystem') }}</el-radio-button>
          <el-radio-button value="light">{{ t('settings.themeLight') }}</el-radio-button>
          <el-radio-button value="dark">{{ t('settings.themeDark') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('settings.licences')">
        <span class="licence">{{ t('settings.licenceApp') }}</span>
        <span class="licence">{{ t('settings.grtCompat') }}</span>
        <el-button size="small" @click="showNotices">{{ t('settings.thirdParty') }}</el-button>
      </el-form-item>
    </el-form>
    <el-dialog v-model="noticesOpen" :title="t('settings.thirdParty')" width="760px" append-to-body>
      <pre class="notices">{{ notices }}</pre>
    </el-dialog>
    <ComponentEditor
      v-if="editing"
      v-model="editorOpen"
      :kind="editing.kind"
      :record="editingRecord"
      :library-id="editing.id"
      @saved="refreshLibrary"
    />
  </el-dialog>
</template>

<style scoped>
.lib {
  width: 100%;
}
.lib-actions {
  margin-top: 6px;
  display: flex;
  gap: 6px;
}
.licence {
  margin-right: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.notices {
  max-height: 60vh;
  overflow: auto;
  font-size: 11px;
  white-space: pre-wrap;
  margin: 0;
}
</style>
