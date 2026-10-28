import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { completeFields, fromSI, newGrtLoad, parseGrtLoad, serializeGrtLoad, toSI, type GrtLoadFile } from '@ballistica-interna/grtload';
import type { ComponentKind, DbRecord, OpenedFile } from '../../../shared/api';
import { applyCaliber, applyProjectile, applyPropellant, minTwistOf, recordNotes, syncSeatingDepth } from '../lib/components';
import { compute, type Computation, type Step } from '../lib/compute';
import type { Section } from '../lib/fields';

/** Origin of a component taken into a load: master data with its source, or an own component. */
export interface ComponentOrigin {
  from: 'master' | 'own';
  /** master: name of the source; own: the component it was copied from */
  name?: string;
  /** i18n keys of notes on the taken record (estimated bulk density, bullet length from JBM or missing, …) */
  notes?: string[];
}

export interface LoadDoc {
  id: number;
  path: string | null;
  name: string;
  file: GrtLoadFile;
  dirty: boolean;
  result: Computation;
  /** Selected ladder step (0 = the load's charge). */
  focus: number;
  /** Other open loads shown in the chart for comparison. */
  compare: number[];
  /** Where the chosen components came from (not stored in the load file). */
  sources: Partial<Record<ComponentKind, ComponentOrigin>>;
  /** Notes of the master records a load opened from a file uses (looked up by maker and name). */
  notes: Partial<Record<ComponentKind, string[]>>;
  /** Minimum twist the bullet's maker states [mm per turn] (from the master data; not stored in the file). */
  minTwist: number | null;
  /** Master record of the load's powder (by maker and name), to tell whether its burn values are the shipped fit. */
  powderRecord: DbRecord | null;
}

/** The ladder step whose results are shown. */
export function selectedStep(doc: LoadDoc): Step | undefined {
  const steps = doc.result.steps;
  return steps[Math.min(doc.focus, steps.length - 1)];
}

let nextId = 1;
const baseName = (path: string) => path.replace(/^.*[\\/]/, '').replace(/\.grtload$/i, '');

export const useLoads = defineStore('loads', () => {
  const docs = ref<LoadDoc[]>([]);
  const activeId = ref<number | null>(null);
  const active = computed(() => docs.value.find((d) => d.id === activeId.value) ?? null);
  const dbVersion = shallowRef(0);
  /** Display unit chosen per field, kept in the settings for every load. */
  const units = ref<Record<string, string>>({});

  function setUnit(key: string, unit: string) {
    units.value = { ...units.value, [key]: unit };
    void window.api.setSettings({ units: units.value });
  }

  function add(file: GrtLoadFile, path: string | null, name: string) {
    const doc: LoadDoc = { id: nextId++, path, name, file, dirty: false, result: compute(file), focus: 0, compare: [], sources: {}, notes: {}, minTwist: null, powderRecord: null };
    docs.value.push(doc);
    activeId.value = doc.id;
    return doc;
  }

  function openFile(f: OpenedFile) {
    const existing = docs.value.find((d) => d.path === f.path);
    if (existing) {
      activeId.value = existing.id;
      return existing;
    }
    const doc = add(completeFields(parseGrtLoad(f.content)), f.path, baseName(f.path));
    void lookUpNotes(doc);
    return doc;
  }

  /** Notes of the master records the opened load uses (bullet length from JBM, estimated bulk density, …). */
  async function lookUpNotes(raw: LoadDoc) {
    // the reactive copy in the store, so that the panels show the notes
    const doc = docs.value.find((d) => d.id === raw.id);
    if (!doc) return;
    for (const kind of ['projectile', 'propellant'] as const) {
      const section = doc.file[kind];
      const record = await window.api.masterFind(kind, section.mname?.value ?? '', section.pname?.value ?? '');
      const notes = record ? recordNotes(record) : [];
      if (notes.length) doc.notes[kind] = notes;
      if (kind === 'projectile' && record) doc.minTwist = minTwistOf(record);
      if (kind === 'propellant') doc.powderRecord = record ?? null;
    }
  }

  function newLoad(name: string) {
    return add(newGrtLoad(), null, name);
  }

  function close(id: number) {
    const i = docs.value.findIndex((d) => d.id === id);
    if (i < 0) return;
    docs.value.splice(i, 1);
    for (const d of docs.value) d.compare = d.compare.filter((c) => c !== id);
    if (activeId.value === id) activeId.value = docs.value[Math.min(i, docs.value.length - 1)]?.id ?? null;
  }

  function recompute(doc: LoadDoc) {
    doc.result = compute(doc.file);
    doc.focus = Math.min(doc.focus, Math.max(doc.result.steps.length - 1, 0));
  }

  /** Raw stored value of a field. */
  function raw(doc: LoadDoc, section: Section, name: string): string {
    return doc.file[section][name]?.value ?? '';
  }

  /** SI value of a stored numeric field (NaN when empty). */
  function valueSI(doc: LoadDoc, section: Section, name: string): number {
    const f = doc.file[section][name];
    if (!f || f.value === '') return NaN;
    return toSI(Number(f.value), f.unit);
  }

  function setRaw(doc: LoadDoc, section: Section, name: string, value: string) {
    const f = doc.file[section][name];
    if (!f) return;
    f.value = value;
    if (name === 'oal') syncSeatingDepth(doc.file, 'oal');
    if (name === 'gdepth' || name === 'glen' || name === 'caselen') syncSeatingDepth(doc.file, 'gdepth');
    doc.dirty = true;
    recompute(doc);
  }

  function setSI(doc: LoadDoc, section: Section, name: string, si: number) {
    const f = doc.file[section][name];
    if (!f || !Number.isFinite(si)) return;
    setRaw(doc, section, name, String(Number(fromSI(si, f.unit).toPrecision(12))));
  }

  function applyComponent(doc: LoadDoc, kind: ComponentKind, record: DbRecord, origin?: ComponentOrigin) {
    if (kind === 'caliber') applyCaliber(doc.file, record);
    if (kind === 'projectile') {
      applyProjectile(doc.file, record);
      doc.minTwist = minTwistOf(record);
    }
    if (kind === 'propellant') {
      applyPropellant(doc.file, record);
      // an own powder counts as not checked, even when copied from the master data
      doc.powderRecord = origin?.from === 'master' ? record : null;
    }
    delete doc.notes[kind];
    if (origin) doc.sources[kind] = origin;
    else delete doc.sources[kind];
    doc.dirty = true;
    recompute(doc);
  }

  async function save(doc: LoadDoc, saveAs = false) {
    const path = await window.api.saveLoad(saveAs ? null : doc.path, serializeGrtLoad(doc.file), doc.name);
    if (!path) return false;
    doc.path = path;
    doc.name = baseName(path);
    doc.dirty = false;
    return true;
  }

  return { docs, activeId, active, dbVersion, units, setUnit, openFile, newLoad, close, raw, valueSI, setRaw, setSI, applyComponent, save };
});
