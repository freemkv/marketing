// Route groups are source-scoped directed links. Requirements within a group
// are AND; groups covering the same pair are alternative OR choices.
const map = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const token = x => typeof x === 'string' && /^[A-Za-z0-9]+$/.test(x);
// Version 1 (freemkv-flash 0.17.x) requires matching original hardware;
// version 3 (0.18.x) requires an existing native parameter word.
export const ROUTE_VERSIONS = [1, 3];
const REQUIREMENT_FIELDS = { original_hardware: ['platform', 'prefix', 'suffix'], parameter_word: ['filter', 'parameter', 'value'] };
const requirementKey = r => JSON.stringify([r.kind, ...(REQUIREMENT_FIELDS[r.kind] ?? []).map(k => r[k])]);
const word = x => Number.isInteger(x) && x >= 0 && x <= 0xffff;
function validRequirement(r, version) {
  if (!map(r)) return false;
  if (version === 1 && r.kind === 'original_hardware')
    return token(r.platform) && (r.prefix === null || token(r.prefix))
      && (r.suffix === null || typeof r.suffix === 'string' && /^[A-Za-z0-9_.+/-]*$/.test(r.suffix))
      && Object.keys(r).every(k => k === 'kind' || REQUIREMENT_FIELDS.original_hardware.includes(k));
  if (version === 3 && r.kind === 'parameter_word')
    return typeof r.filter === 'string' && /^[A-Za-z0-9_.:-]+$/.test(r.filter) && word(r.parameter) && word(r.value)
      && Object.keys(r).every(k => k === 'kind' || REQUIREMENT_FIELDS.parameter_word.includes(k));
  return false;
}
const key = group => JSON.stringify([group.source, group.status, group.native_supported ?? false, group.requirements.map(requirementKey).sort()]);
function validateEvaluatedReferences(graph, groups) {
  if (graph.evaluated_packages === undefined) return groups;
  const evaluated = graph.evaluated_packages;
  if (!Array.isArray(evaluated) || evaluated.some(s => typeof s !== 'string') || new Set(evaluated).size !== evaluated.length)
    throw new Error('Invalid crossflash evaluated packages');
  const ids = new Set(evaluated);
  for (const g of groups) if (!ids.has(g.source) || g.targets.some(t => !ids.has(t)))
    throw new Error('Crossflash route references an unevaluated package');
  return groups;
}

export function routeGroups(graph) {
  if (!graph) return [];
  if (graph.format === 'freemkv-crossflash-routes' && ROUTE_VERSIONS.includes(graph.version)) {
    if (!Array.isArray(graph.groups)) throw new Error('Invalid crossflash route groups');
    const seen = new Set();
    for (const group of graph.groups) {
      if (!map(group) || typeof group.source !== 'string' || !['allowed', 'conditional', 'future'].includes(group.status)
        || !Array.isArray(group.requirements) || !Array.isArray(group.targets) || !group.targets.length
        || group.targets.some(t => typeof t !== 'string' || t === group.source) || new Set(group.targets).size !== group.targets.length)
        throw new Error('Invalid crossflash route group');
      if (group.native_supported !== undefined && typeof group.native_supported !== 'boolean') throw new Error('Invalid native route classification');
      if ((group.status === 'allowed' && group.requirements.length) || (group.status === 'conditional' && !group.requirements.length))
        throw new Error('Invalid crossflash route requirements');
      const requirements = new Set();
      for (const r of group.requirements) {
        if (!validRequirement(r, graph.version)) throw new Error('Invalid crossflash requirement');
        const id = requirementKey(r);
        if (requirements.has(id)) throw new Error('Duplicate crossflash requirement');
        requirements.add(id);
      }
      const id = key(group);
      if (seen.has(id)) throw new Error('Duplicate crossflash route group');
      seen.add(id);
    }
    return validateEvaluatedReferences(graph, graph.groups);
  }
  // Read-only adapter for already published pre-route-group archives.
  if (graph.format !== 'freemkv-crossflash-links' || ![1, 2].includes(graph.version) || !map(graph.links)
    || ((graph.version === 2 || graph.future !== undefined) && !map(graph.future))
    || (graph.conditional !== undefined && !map(graph.conditional))) throw new Error('Invalid crossflash links');
  const groups = [];
  for (const [kind, status] of [['links', 'allowed'], ['future', 'future'], ['conditional', 'conditional']]) {
    for (const [source, targets] of Object.entries(graph[kind] ?? {})) {
      if (!Array.isArray(targets) || targets.some(t => typeof t !== 'string')) throw new Error('Invalid crossflash targets');
      if (targets.length) groups.push({source, status, requirements: [], targets});
    }
  }
  return validateEvaluatedReferences(graph, groups);
}

export function canonicalRouteGroups(groups) {
  const combined = new Map();
  for (const group of groups) {
    const requirements = group.requirements.map(r=>Object.fromEntries(['kind', ...REQUIREMENT_FIELDS[r.kind]].map(k => [k, r[k]]))).sort((a,b) => requirementKey(a).localeCompare(requirementKey(b)));
    const normalized = {...group, requirements};
    const id = key(normalized);
    const existing = combined.get(id) ?? {...normalized, targets: new Set()};
    for (const target of group.targets) existing.targets.add(target);
    combined.set(id, existing);
  }
  return [...combined.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,g]) => ({...g, targets:[...g.targets].sort()}));
}

// The exporter proves applicability on the source firmware's native hardware.
export const nativeRoute = group => group.status === 'allowed' || (group.status === 'conditional' && group.native_supported === true);

// Compatibility projection for older callers; the authoritative graph stays
// in groups, and no projection grants a pair outside its explicit targets.
export function routeMaps(groups) {
  const maps = {links:{},future:{},conditional:{}};
  for (const g of groups) for (const target of g.targets) {
    const kind = nativeRoute(g) ? 'links' : {future:'future', conditional:'conditional'}[g.status];
    (maps[kind][g.source] ??= new Set()).add(target);
  }
  for (const edges of Object.values(maps)) for (const [source,targets] of Object.entries(edges)) edges[source]=[...targets].sort();
  return maps;
}
