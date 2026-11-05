import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {largestEmptyRectangle} from '../docs/tools/gallery-space.mjs';

test('gallery audit detects internal holes and trailing canvas',()=>{
 assert.equal(largestEmptyRectangle({width:100,height:100,rects:[{x:0,y:0,width:100,height:60}]}).ratio,.4);
 assert.equal(largestEmptyRectangle({width:100,height:100,rects:[{x:0,y:0,width:40,height:100},{x:60,y:0,width:40,height:100}]}).ratio,.2);
 assert.equal(largestEmptyRectangle({width:100,height:100,rects:[{x:0,y:0,width:100,height:100}]}).ratio,0);
});

async function markdown(dir) {
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.filter(e=>!['node_modules','.git','gorevler','target','dist','checks'].includes(e.name)).map(e=>e.isDirectory()?markdown(resolve(dir,e.name)):e.name.endsWith('.md')?[resolve(dir,e.name)]:[]))).flat();
}
test('documentation local links and image paths resolve',async()=>{
 const root=resolve(import.meta.dirname,'..');
 const files=[resolve(root,'README.md'),resolve(root,'CONTRIBUTING.md'),...await markdown(resolve(root,'docs')),...await markdown(resolve(root,'integrations'))];
 for(const file of files) {
  const source=await readFile(file,'utf8');
  const links=[...source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)|(?:src|srcset|href)="([^"]+)"/g)].map(m=>m[1]||m[2]);
  for(const link of links) {
   if(/^(?:[a-z]+:|\/\/)/i.test(link))continue;
   const path=decodeURIComponent(link.split('#')[0]);
   const target=path?resolve(dirname(file),path):file;
   assert.ok(await stat(target).catch(()=>null),`${file.slice(root.length+1)}: ${link}`);
   const fragment=link.split('#')[1];
   if(fragment&&target.endsWith('.md')) {
    const contents=target===file?source:await readFile(target,'utf8');
    const anchors=[...contents.matchAll(/^#{1,6} (.+)$/gm)].map(m=>m[1].toLowerCase().replace(/[`*]/g,'').replace(/[^\p{L}\p{N}_ -]/gu,'').replace(/ /g,'-'));
    anchors.push(...[...contents.matchAll(/(?:id|name)="([^"]+)"/g)].map(m=>m[1]));
    assert.ok(anchors.includes(decodeURIComponent(fragment)),`${file.slice(root.length+1)}: missing anchor ${link}`);
   }
  }
 }
});

test('PNG compression preserves pixels and metadata without increasing size',async()=>{
 const {compressPng}=await import('../docs/tools/png.mjs');
 const {inflateSync,deflateSync,crc32}=await import('node:zlib');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1cAAAAASUVORK5CYII=','base64');
 const pixels=data=>{const chunks=[];for(let offset=8;offset<data.length;){const n=data.readUInt32BE(offset);if(data.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(data.subarray(offset+8,offset+8+n));offset+=n+12;}return inflateSync(Buffer.concat(chunks));};
 const result=compressPng(png);
 assert.ok(result.length<=png.length);
 assert.deepEqual(result.subarray(0,33),png.subarray(0,33));
 assert.deepEqual(pixels(result),pixels(png));
 const data=deflateSync(pixels(png),{level:0}),chunk=Buffer.alloc(data.length+12);
 chunk.writeUInt32BE(data.length);chunk.write('IDAT',4);data.copy(chunk,8);
 chunk.writeUInt32BE(crc32(chunk.subarray(4,-4)),chunk.length-4);
 const uncompressed=Buffer.concat([png.subarray(0,33),chunk,png.subarray(-12)]);
 const smaller=compressPng(uncompressed);
 assert.ok(smaller.length<uncompressed.length);
 assert.deepEqual(pixels(smaller),pixels(png));
});
