import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/pages/firmware/find.astro',import.meta.url),'utf8');
function finder(models) {
 const start=source.indexOf('          function versionLabel(v) {');
 const end=source.indexOf('          function closeList()',start);
 const context=vm.createContext({firmwareIndex:models});vm.runInContext(source.slice(start,end),context);return context;
}
test('advertised region and literal header ID distinguish revisions',()=>{
 const f=finder([]);
 assert.equal(f.versionLabel({packageType:'pioneer-installer',rev:'1.03EU',kernelVersion:'ID43',destination:'ID43',hardware:'SAT 9401'}),'1.03EU / ID43 · SAT 9401');
 assert.equal(f.versionLabel({packageType:'pioneer-installer',rev:'1.03US',kernelVersion:'ID44',destination:'OTHER',hardware:'SAT 9401'}),'1.03US / ID44 · SAT 9401 · OTHER');
 assert.equal(f.versionLabel({rev:'1.03',variant:'W000900'}),'1.03 · W000900');
});
test('ID and model search match a single real variant without inventing RS aliases',()=>{
 const f=finder([{model:'BDR-213EBK',versions:[{kernelVersion:'ID43',hardware:'SAT 9401'},{kernelVersion:'ID44',hardware:'SAT 9400'}]},{model:'BU40N',versions:[{}]}]);
 assert.equal(f.filterModels('ID43').length,1);assert.equal(f.filterModels('213 id43')[0].model,'BDR-213EBK');
 assert.equal(f.filterModels('ID43 9400').length,0);assert.equal(f.filterModels('RS9401').length,0);assert.equal(f.filterModels('BU40N').length,1);
});
test('choosing an ID search selects its matching revision instead of first revision',()=>{
 const model={model:'BDR-213EBK',versions:[{rev:'1.04EU',kernelVersion:'ID44',hardware:'SAT 9401'},{rev:'1.03EU',kernelVersion:'ID43',hardware:'SAT 9401'}]};
 const f=finder([model]);assert.equal(f.matchingVersionIndex(model,'213 ID43'),1);assert.equal(f.matchingVersionIndex(model,'BDR-213EBK'),0);
});
test('restored retail names remain searchable with old separators and brand',()=>{
 const f=finder([{brand:'TDK',model:'DVD-RW DVD-2X',versions:[{}]},{brand:'Memorex',model:'True 8X 8X8',versions:[{}]}]);
 assert.equal(f.filterModels('DVD-RW_DVD-2X')[0].brand,'TDK');assert.equal(f.filterModels('True_8X_8X8')[0].brand,'Memorex');assert.equal(f.filterModels('memorex true')[0].model,'True 8X 8X8');
});
