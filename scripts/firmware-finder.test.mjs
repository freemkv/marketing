import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page=fs.readFileSync(new URL('../src/pages/firmware/find.astro',import.meta.url),'utf8');
const code=page.match(/<script define:vars=\{\{[^]*?\}\}>([^]*?)<\/script>/)[1];
class Element {
  constructor(){this.handlers={};this.children=[];this.hidden=true;this.value='';this.classList={remove(){},add(){}};}
  set innerHTML(v){this.html=v;this.children=[];} get innerHTML(){return this.html;}
  setAttribute(){} addEventListener(k,f){this.handlers[k]=f;} appendChild(x){this.children.push(x);}
  querySelectorAll(){return this.children.filter(x=>x.className?.split(' ').includes('picker-option'));}
  scrollIntoView(){} focus(){}
}
function finder(modifiable=false){
 const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement(){return new Element();},addEventListener(){}};
 const firmwareIndex=[{model:'BDR-UD04',brand:'Pioneer',versions:['1.14EU','1.14US'].map(rev=>({rev,hardware:'SAT 8A10',chipset:'Pioneer',packageType:'pioneer-installer',modifiable,features:[{name:'Must be hidden',ok:true}],file:`pioneer/${rev}/firmware.tar`}))},{model:'BU40N',brand:'LG',versions:[{rev:'1.00',modifiable:true,features:[{name:'Region-free',ok:true}],file:'MT1959/BU40N.bin'}]}];
 vm.runInNewContext(code,{document,firmwareIndex,firmwareBaseUrl:'https://example.test'});
 function select(query){const input=document.getElementById('drive-search');input.value=query;input.handlers.input();const options=document.getElementById('drive-options').querySelectorAll();assert.equal(options.length,1);options[0].handlers.mousedown({preventDefault(){}});}
 return {document,select};
}
test('Pioneer substring search, separate regional releases, download and flash next step',()=>{
 const {document,select}=finder();select('UD04');
 const detail=document.getElementById('drive-detail').innerHTML;
 assert.match(detail,/firmware\.tar/);assert.doesNotMatch(detail,/Must be hidden|Then build it/);
 assert.equal(document.getElementById('firmware-next-link').href,'/firmware/flash/');
 document.getElementById('drive-rev').handlers.focus();
 assert.deepEqual(document.getElementById('rev-options').querySelectorAll().map(x=>x.textContent),['1.14EU · SAT 8A10','1.14US · SAT 8A10']);
});
test('MediaTek keeps features and modify next step',()=>{
 const {document,select}=finder();select('BU40N');
 assert.match(document.getElementById('drive-detail').innerHTML,/Region-free/);
 assert.equal(document.getElementById('firmware-next-link').href,'/firmware/modify/');
});
test('next step follows index capability rather than chipset name',()=>{
 const {document,select}=finder(true);select('UD04');
 assert.equal(document.getElementById('firmware-next-link').href,'/firmware/modify/');
});
