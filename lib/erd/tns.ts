// Historical migration/test fixture. Runtime reads the snapshot from PostgreSQL.
import snapshot from './tns-schema.json' with { type: 'json' };
import { makeErdChart as makeChart, fieldKeys as keys, erdDomains } from './chart.ts';
import type { ErdModel, ErdField } from './chart.ts';
export { domainOf, erdDomains } from './chart.ts';
export type { ErdModel, ErdField } from './chart.ts';
export const tnsSchema = snapshot;
export const makeErdChart = (domain: string, focus?: string) => makeChart(snapshot, domain, focus);
export const fieldKeys = (model: ErdModel, field: ErdField) => keys(snapshot, model, field);
export const tnsErdCharts = erdDomains.map(d => makeErdChart(d.slug));
