import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCrossflashLinks } from './firmware-release.mjs';
import { validateCrossflashCoverage } from '../src/lib/finder.mjs';
import { routeGroups } from '../src/lib/crossflash-routes.mjs';
import { readFileSync } from 'node:fs';

const catalog = { identities: [{ revisions: [{ packages: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'c' }] }] }] };
const graph = () => ({ format: 'freemkv-crossflash-links', version: 2, links: { a: ['b'] }, future: { a: ['c'] } });
test('a replacement package invalidates graph coverage even when all retained edges are valid', () => {
  const evaluated = { ...graph(), evaluated_packages: ['a', 'b', 'c'] };
  assert.doesNotThrow(() => validateCrossflashCoverage(catalog, evaluated));
  const replaced = { identities: [{ revisions: [{ packages: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'replacement' }] }] }] };
  const filtered = { ...evaluated, future: {} };
  assert.throws(() => checkCrossflashLinks(filtered, replaced), /does not cover/);
  assert.throws(() => validateCrossflashCoverage(catalog, graph()), /does not cover/);
  assert.throws(() => validateCrossflashCoverage(catalog, { evaluated_packages: ['a', 'b', 'b'] }), /does not cover/);
});
test('published graph covers every package and every corrected replacement', () => {
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const catalog = read('../src/data/finder-catalog.json');
  const graph = read('../src/data/crossflash-links.json');
  validateCrossflashCoverage(catalog, graph);
  checkCrossflashLinks(graph, catalog);
  for (const replacement of read('./td05-replacement.json').replacements) {
    assert.ok(graph.evaluated_packages.includes(replacement.replacement_sha256));
    assert.ok(!JSON.stringify(graph).includes(replacement.bad_package_sha256));
  }
  const ud03 = '18b57472eeac46db8437ab4e3745035d463ee39b5fdca2f56b00a0959d049d84';
  const ud04 = '349da8b41479735437872a898556c9bc9ddca135ddac0ef90a0684949f96dfb6';
  assert.ok(routeGroups(graph).some(g=>g.source===ud03 && g.targets.includes(ud04) && ['allowed','conditional'].includes(g.status)), 'corrected UD03 1.03 must retain its flasher-admitted UD04 route');
});
test('crossflash schema accepts legacy and classified graphs', () => {
  assert.doesNotThrow(() => checkCrossflashLinks(graph(), catalog));
  assert.doesNotThrow(() => checkCrossflashLinks({ format: 'freemkv-crossflash-links', version: 1, links: { a: ['b'] } }, catalog));
});
test('crossflash schema validates both graphs, target arrays and disjoint pairs', () => {
  for (const patch of [{ future: null }, { links: [] }, { future: { a: 'c' } }, { future: { a: ['missing'] } }, { future: { missing: ['b'] } }, { future: { a: ['b'] } }, { version: 1, future: { a: ['missing'] } }]) {
    assert.throws(() => checkCrossflashLinks({ ...graph(), ...patch }, catalog));
  }
});

test('conditional graph validates references and remains disjoint from other verdicts', () => {
  assert.doesNotThrow(() => checkCrossflashLinks({ ...graph(), conditional: { b: ['a'] } }, catalog));
  for (const conditional of [null, [], { b: ['missing'] }, { a: ['b'] }, { a: ['c'] }]) {
    assert.throws(() => checkCrossflashLinks({ ...graph(), conditional }, catalog));
  }
});

const requirement = (platform='UD02') => ({kind:'original_hardware',platform,prefix:null,suffix:null});
const routes = () => ({format:'freemkv-crossflash-routes',version:1,groups:[
  {source:'a',status:'conditional',requirements:[requirement()],targets:['b']},
  {source:'a',status:'conditional',requirements:[requirement('UD03')],targets:['b']},
]});
test('route groups preserve explicit directed targets and alternative hardware predicates', () => {
  assert.doesNotThrow(()=>checkCrossflashLinks(routes(),catalog));
  for (const patch of [
    {status:'allowed'}, {requirements:[]}, {targets:['missing']}, {targets:['a']}, {targets:['b','b']},
    {requirements:[{kind:'unknown',platform:'UD02'}]}, {requirements:[requirement(),requirement()]},
    {requirements:[{...requirement(),prefix:undefined}]},
  ]) assert.throws(()=>checkCrossflashLinks({...routes(),groups:[{...routes().groups[0],...patch}]},catalog));
  assert.throws(()=>checkCrossflashLinks({...routes(),groups:[routes().groups[0],routes().groups[0]]},catalog));
});

test('route sources and every explicit target must have been evaluated', () => {
  assert.doesNotThrow(()=>checkCrossflashLinks({...routes(),evaluated_packages:['a','b','c']},catalog));
  for (const evaluated_packages of [['a','c'],['b','c']]) {
    assert.throws(()=>checkCrossflashLinks({...routes(),evaluated_packages},catalog),/unevaluated/);
  }
});

test('native applicability is explicit boolean evidence and distinct from return-only routes', () => {
  const group={source:'a',targets:['b'],status:'conditional',requirements:[{kind:'original_hardware',platform:'UD02',prefix:null,suffix:null}]};
  assert.doesNotThrow(()=>routeGroups({format:'freemkv-crossflash-routes',version:1,groups:[{...group,native_supported:true},{...group,native_supported:false}]}));
  assert.throws(()=>routeGroups({format:'freemkv-crossflash-routes',version:1,groups:[{...group,native_supported:'true'}]}), /native route/);
});

test('published UD02/UD03/UD04 firmware pairs retain all six native crossflash directions', () => {
  const graph = JSON.parse(readFileSync(new URL('../src/data/crossflash-links.json', import.meta.url)));
  const packages = [
    '0bc0cd7a85ddd14d8a90357f5c144e3cf0d44572316c3cd9017a74c0d1802011', // UD02D 1.00
    '18b57472eeac46db8437ab4e3745035d463ee39b5fdca2f56b00a0959d049d84', // UD03 1.03
    '349da8b41479735437872a898556c9bc9ddca135ddac0ef90a0684949f96dfb6', // UD04 1.14
  ];
  const groups = routeGroups(graph);
  for (const source of packages) for (const target of packages) if (source !== target)
    assert.ok(groups.some(g=>g.source===source && g.targets.includes(target) && g.native_supported===true), `${source} -> ${target} must have an exporter-proven native route`);
});
