import LZString from 'lz-string';
import type {Dataset,Project} from './types';
import {validateProject} from './project';
export function encodeSnapshot(project:Project):string {
  const encoded=LZString.compressToEncodedURIComponent(JSON.stringify({schema:1,project}));
  if(encoded.length>12000)throw new Error('快照过大，建议使用导出文件分享');
  return encoded;
}
export function decodeSnapshot(fragment:string,data:Dataset):Project {
  if(!fragment||fragment.length>30000||!/^[a-zA-Z0-9+\-$]+$/.test(fragment))throw new Error('分享链接格式无效或过长');
  const json=LZString.decompressFromEncodedURIComponent(fragment);
  if(!json||json.length>250000)throw new Error('无法读取分享快照，内容损坏或过大');
  let input;
  try {input=JSON.parse(json);}catch{throw new Error('分享快照内容损坏');}
  if(input.schema!==1)throw new Error('不支持此快照格式');
  return validateProject(input.project,data);
}
