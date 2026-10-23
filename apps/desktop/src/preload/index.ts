import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  masterStatus: () => ipcRenderer.invoke('master:status'),
  masterList: (kind) => ipcRenderer.invoke('master:list', kind),
  masterRecord: (kind, id) => ipcRenderer.invoke('master:record', kind, id),
  masterFind: (kind, mname, pname) => ipcRenderer.invoke('master:find', kind, mname, pname),
  libraryList: (kind) => ipcRenderer.invoke('lib:list', kind),
  libraryRecord: (id) => ipcRenderer.invoke('lib:record', id),
  librarySave: (kind, label, data) => ipcRenderer.invoke('lib:save', kind, label, data),
  libraryUpdate: (id, label, data) => ipcRenderer.invoke('lib:update', id, label, data),
  libraryDelete: (id) => ipcRenderer.invoke('lib:delete', id),
  libraryExport: () => ipcRenderer.invoke('lib:export'),
  libraryImport: () => ipcRenderer.invoke('lib:import'),
  openLoad: () => ipcRenderer.invoke('load:open'),
  readLoad: (path) => ipcRenderer.invoke('load:read', path),
  saveLoad: (path, content, name) => ipcRenderer.invoke('load:save', path, content, name),
  exportPdf: (report, mode) => ipcRenderer.invoke('report:pdf', report, mode),
  setDirty: (dirty) => ipcRenderer.send('app:dirty', dirty),
  thirdPartyNotices: () => ipcRenderer.invoke('app:notices'),
};

contextBridge.exposeInMainWorld('api', api);
