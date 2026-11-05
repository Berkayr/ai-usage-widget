import {inflateSync,deflateSync,crc32} from 'node:zlib';

// Recompress pixels losslessly; retain every non-IDAT chunk unchanged.
export function compressPng(png) {
 const chunks=[],pixels=[];
 for(let offset=8;offset<png.length;) {
  const length=png.readUInt32BE(offset),end=offset+length+12;
  const type=png.toString('ascii',offset+4,offset+8);
  const chunk=png.subarray(offset,end);
  chunks.push({type,chunk});
  if(type==='IDAT')pixels.push(chunk.subarray(8,-4));
  offset=end;
 }
 const data=deflateSync(inflateSync(Buffer.concat(pixels)),{level:9});
 const idat=Buffer.alloc(data.length+12);
 idat.writeUInt32BE(data.length);idat.write('IDAT',4);data.copy(idat,8);
 idat.writeUInt32BE(crc32(idat.subarray(4,-4)),idat.length-4);
 let inserted=false;
 const result=Buffer.concat([png.subarray(0,8),...chunks.flatMap(({type,chunk})=>{
  if(type!=='IDAT')return [chunk];
  if(inserted)return [];
  inserted=true;return [idat];
 })]);
 return result.length<png.length?result:png;
}
