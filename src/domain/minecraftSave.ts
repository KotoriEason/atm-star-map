const MAX_INPUT_BYTES=8*1024*1024;
const MAX_DECOMPRESSED_BYTES=32*1024*1024;
const MAX_DEPTH=64;
const MAX_COLLECTION=1_000_000;
const MAX_STRING_BYTES=1_048_576;
const MAX_NBT_WORK=250_000;
const MAX_WARNINGS=50;

type NbtScalar=number|string|bigint;
type NbtValue=NbtScalar|NbtValue[]|NbtCompound;
interface NbtCompound { [key:string]:NbtValue }
type ImportData={items:Record<string,{id:string;components?:string;kind:string}>};

export interface MinecraftSaveImport {
  inventory:Record<string,number>;
  matchedStacks:number;
  unknownItems:{id:string;count:number}[];
  warnings:string[];
  playerName?:string;
  containers:number;
  sourceKind:string;
}

class NbtReader {
  private offset=0;
  private work=0;
  private readonly view:DataView;
  private readonly decoder=new TextDecoder('utf-8',{fatal:true});

  constructor(private readonly bytes:Uint8Array){this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);}
  get remaining(){return this.bytes.length-this.offset;}
  private need(size:number){if(size<0||this.remaining<size)throw new Error('NBT 存档损坏或被截断。');}
  private count(value:number,what:string){if(!Number.isSafeInteger(value)||value<0||value>MAX_COLLECTION)throw new Error(`NBT ${what} 超出安全限制。`);return value;}
  private touch(count=1){this.work+=count;if(this.work>MAX_NBT_WORK)throw new Error('NBT 解析工作量超过安全限制。');}
  byte(){this.need(1);return this.view.getInt8(this.offset++);}
  unsignedByte(){this.need(1);return this.view.getUint8(this.offset++);}
  short(){this.need(2);const value=this.view.getInt16(this.offset);this.offset+=2;return value;}
  int(){this.need(4);const value=this.view.getInt32(this.offset);this.offset+=4;return value;}
  long(){this.need(8);const value=this.view.getBigInt64(this.offset);this.offset+=8;return value;}
  float(){this.need(4);const value=this.view.getFloat32(this.offset);this.offset+=4;if(!Number.isFinite(value))throw new Error('NBT 包含无效数字。');return value;}
  double(){this.need(8);const value=this.view.getFloat64(this.offset);this.offset+=8;if(!Number.isFinite(value))throw new Error('NBT 包含无效数字。');return value;}
  string(){
    this.need(2);const length=this.view.getUint16(this.offset);this.offset+=2;
    if(length>MAX_STRING_BYTES)throw new Error('NBT 字符串超过安全限制。');
    this.need(length);const part=this.bytes.subarray(this.offset,this.offset+length);this.offset+=length;
    try{return this.decoder.decode(part);}catch{throw new Error('NBT 包含无效 UTF-8 文本。');}
  }
  value(type:number,depth:number):NbtValue{
    if(depth>MAX_DEPTH)throw new Error('NBT 嵌套层级超过安全限制。');
    this.touch();
    switch(type){
      case 1:return this.byte(); case 2:return this.short(); case 3:return this.int(); case 4:return this.long();
      case 5:return this.float(); case 6:return this.double(); case 8:return this.string();
      case 7:{const count=this.count(this.int(),'数组长度');this.touch(count);this.need(count);const out:number[]=[];for(let i=0;i<count;i++)out.push(this.byte());return out;}
      case 9:{const childType=this.unsignedByte();if(childType===0&&this.remaining<4)throw new Error('NBT 列表损坏或被截断。');const count=this.count(this.int(),'列表长度');this.touch(count);if(childType===0&&count!==0)throw new Error('NBT 列表类型无效。');const out:NbtValue[]=[];for(let i=0;i<count;i++)out.push(this.value(childType,depth+1));return out;}
      case 10:{const out:NbtCompound=Object.create(null) as NbtCompound;let entries=0;while(true){const childType=this.unsignedByte();if(childType===0)return out;if(++entries>MAX_COLLECTION)throw new Error('NBT 复合标签超过安全限制。');this.touch();const name=this.string();out[name]=this.value(childType,depth+1);}}
      case 11:{const count=this.count(this.int(),'数组长度');this.touch(count);this.need(count*4);const out:number[]=[];for(let i=0;i<count;i++)out.push(this.int());return out;}
      case 12:{const count=this.count(this.int(),'数组长度');this.touch(count);this.need(count*8);const out:bigint[]=[];for(let i=0;i<count;i++)out.push(this.long());return out;}
      default:throw new Error('NBT 包含不支持的标签类型。');
    }
  }
}

function isCompound(value:NbtValue|undefined):value is NbtCompound{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function isList(value:NbtValue|undefined):value is NbtValue[]{return Array.isArray(value);}
function asCount(value:NbtValue|undefined){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:undefined;}

async function uncompress(bytes:Uint8Array){
  if(bytes.length>MAX_INPUT_BYTES)throw new Error('选择的文件超过 8 MB 安全限制。');
  if(bytes[0]!==0x1f||bytes[1]!==0x8b)return bytes;
  if(typeof DecompressionStream==='undefined')throw new Error('当前浏览器不支持读取 gzip 压缩的 Minecraft 存档。');
  try{
    const input=new Uint8Array(bytes.byteLength);input.set(bytes);
    const reader=new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>MAX_DECOMPRESSED_BYTES){await reader.cancel();throw new Error('解压后的存档超过 32 MB 安全限制。');}chunks.push(next.value);}
    const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
  }catch(error){if(error instanceof Error&&error.message.includes('32 MB'))throw error;throw new Error('gzip 存档损坏，无法解压。');}
}

function readRoot(bytes:Uint8Array){
  const reader=new NbtReader(bytes);const type=reader.unsignedByte();if(type!==10)throw new Error('这不是有效的 Minecraft NBT 复合存档。');reader.string();const root=reader.value(10,0);if(reader.remaining!==0)throw new Error('NBT 存档包含无效尾部数据。');if(!isCompound(root))throw new Error('NBT 根标签无效。');return root;
}

class SnbtReader {
  private at=0;
  constructor(private readonly input:string){}
  private fail():never{throw new Error('数据目录中的物品组件格式无法识别。');}
  private whitespace(){while(/\s/.test(this.input[this.at]??''))this.at++;}
  private consume(char:string){this.whitespace();if(this.input[this.at]!==char)this.fail();this.at++;}
  private token(stops:string){this.whitespace();const start=this.at;while(this.at<this.input.length&&!stops.includes(this.input[this.at])&&!/\s/.test(this.input[this.at]))this.at++;if(start===this.at)this.fail();return this.input.slice(start,this.at);}
  private quoted(){
    this.whitespace();const quote=this.input[this.at++];let out='';
    while(this.at<this.input.length){const char=this.input[this.at++];if(char===quote)return out;if(char==='\\'){if(this.at>=this.input.length)this.fail();out+=this.input[this.at++];}else out+=char;}
    this.fail();
  }
  private componentKey(){this.whitespace();return this.input[this.at]==='"'||this.input[this.at]==="'"?this.quoted():this.token('=,]');}
  private compoundKey(){
    this.whitespace();if(this.input[this.at]==='"'||this.input[this.at]==="'"){const key=this.quoted();this.consume(':');return key;}
    const start=this.at;
    while(this.at<this.input.length&&this.input[this.at]!==','&&this.input[this.at]!=='}'){
      if(this.input[this.at]===':'){
        let next=this.at+1;while(/\s/.test(this.input[next]??''))next++;
        if(/[\[{"'0-9+\-]/.test(this.input[next]??'')||this.input.startsWith('true',next)||this.input.startsWith('false',next)){
          const key=this.input.slice(start,this.at).trim();if(!key)this.fail();this.at++;return key;
        }
      }
      this.at++;
    }
    this.fail();
  }
  private compound(){const out:Record<string,unknown>=Object.create(null);this.consume('{');this.whitespace();if(this.input[this.at]==='}'){this.at++;return out;}while(true){const key=this.compoundKey();out[key]=this.value();this.whitespace();if(this.input[this.at]==='}'){this.at++;return out;}this.consume(',');}}
  private list(){
    this.consume('[');this.whitespace();if(this.input[this.at]===']'){this.at++;return [];}const firstStart=this.at;
    if(/[BILbil]/.test(this.input[this.at]??'')&&this.input[this.at+1]===';'){this.at+=2;const typed:unknown[]=[];this.whitespace();if(this.input[this.at]===']'){this.at++;return typed;}while(true){typed.push(this.value());this.whitespace();if(this.input[this.at]===']'){this.at++;return typed;}this.consume(',');}}
    this.at=firstStart;const out:unknown[]=[];while(true){out.push(this.value());this.whitespace();if(this.input[this.at]===']'){this.at++;return out;}this.consume(',');}
  }
  private value():unknown{
    this.whitespace();const char=this.input[this.at];if(char==='{')return this.compound();if(char==='[')return this.list();if(char==='"'||char==="'")return this.quoted();const token=this.token(',]}');
    if(token==='true')return true;if(token==='false')return false;
    const match=/^([+-]?\d+)(?:\.\d+)?([bBsSlLfFdD])?$/.exec(token);
    if(match){const numeric=Number(token.replace(/[bBsSlLfFdD]$/,''));if(!Number.isFinite(numeric))this.fail();return /[lL]$/.test(token)?BigInt(match[1]):numeric;}
    return token;
  }
  components(){
    const out:Record<string,unknown>=Object.create(null);this.consume('[');this.whitespace();if(this.input[this.at]===']'){this.at++;return out;}while(true){const key=this.componentKey();this.consume('=');out[key]=this.value();this.whitespace();if(this.input[this.at]===']'){this.at++;break;}this.consume(',');}this.whitespace();if(this.at!==this.input.length)this.fail();return out;
  }
}

function expectedComponents(source:string|undefined){if(!source)return undefined;try{return new SnbtReader(source).components();}catch{return undefined;}}
function componentSpecificity(value:unknown):number{
  if(Array.isArray(value))return 1+value.reduce((total,item)=>total+componentSpecificity(item),0);
  if(value&&typeof value==='object')return 1+Object.values(value as Record<string,unknown>).reduce<number>((total,item)=>total+componentSpecificity(item),0);
  return 1;
}
function componentMatches(expected:unknown,actual:NbtValue|undefined):boolean{
  if(typeof expected==='boolean')return (expected&&actual===1)||(!expected&&actual===0);
  if(typeof expected==='number')return typeof actual==='number'&&Object.is(expected,actual);
  if(typeof expected==='bigint')return actual===expected;
  if(typeof expected==='string')return actual===expected;
  if(Array.isArray(expected))return Array.isArray(actual)&&expected.length===actual.length&&expected.every((value,index)=>componentMatches(value,actual[index]));
  if(expected&&typeof expected==='object'&&isCompound(actual))return Object.entries(expected as Record<string,unknown>).every(([key,value])=>componentMatches(value,actual[key]));
  return false;
}

function componentOf(stack:NbtCompound){return isCompound(stack.components)?stack.components:undefined;}
function warningForExternalStorage(id:string){return /backpack|warehouse|drawer|storage|barrel/i.test(id)&&!id.startsWith('minecraft:shulker_box');}

interface Candidate { key:string; expected?:unknown; specificity:number; ordinary:boolean }
function indexCandidates(data:ImportData){
  const index=new Map<string,Candidate[]>();
  for(const [key,item] of Object.entries(data.items))if(item.kind==='item'){
    const expected=item.components?expectedComponents(item.components):undefined;
    const candidate:Candidate={key,expected,specificity:expected===undefined?0:componentSpecificity(expected),ordinary:!item.components};
    const group=index.get(item.id);if(group)group.push(candidate);else index.set(item.id,[candidate]);
  }
  return index;
}

export async function readMinecraftSave(bytes:Uint8Array,data:ImportData):Promise<MinecraftSaveImport>{
  const root=readRoot(await uncompress(bytes));
  const dataPlayer=isCompound(root.Data)&&isCompound(root.Data.Player)?root.Data.Player:undefined;
  const player=dataPlayer??(isCompound(root.Player)?root.Player:root);
  const inventory=isList(player.Inventory)?player.Inventory:undefined;
  const ender=isList(player.EnderItems)?player.EnderItems:undefined;
  if(!inventory&&!ender)throw new Error('未找到玩家背包：请选择世界的 level.dat 或 playerdata/<UUID>.dat。');
  const result:MinecraftSaveImport={inventory:Object.create(null) as Record<string,number>,matchedStacks:0,unknownItems:[],warnings:[],containers:0,sourceKind:dataPlayer?'level.dat':'playerdata .dat'};
  const unknown=new Map<string,number>();const warningKeys=new Set<string>();
  const candidates=indexCandidates(data);
  const warn=(key:string,message:string)=>{if(!warningKeys.has(key)&&result.warnings.length<MAX_WARNINGS){warningKeys.add(key);result.warnings.push(message);}};
  const add=(key:string,count:number)=>{result.inventory[key]=(result.inventory[key]??0)+count;};
  const scan=(value:NbtValue,multiplier:number,depth:number):void=>{
    if(depth>MAX_DEPTH)throw new Error('容器嵌套超过安全限制。');if(!isCompound(value))return;
    const id=typeof value.id==='string'?value.id:undefined;const ownCount=asCount(value.count)??asCount(value.Count);
    if(!id||ownCount===undefined){warn('invalid-stack','发现无法识别数量的物品堆，已跳过。');return;}
    const count=ownCount*multiplier;if(!Number.isSafeInteger(count))throw new Error('物品数量超过安全限制。');
    if(count>0){
      const actualComponents=componentOf(value);const sameId=candidates.get(id)??[];
      let special:Candidate|undefined;let ordinary:Candidate|undefined;
      for(const candidate of sameId){
        if(candidate.ordinary)ordinary??=candidate;
        else if(candidate.expected!==undefined&&componentMatches(candidate.expected,actualComponents)&&(!special||candidate.specificity>special.specificity))special=candidate;
      }
      const selected=special??ordinary;
      if(selected){add(selected.key,count);result.matchedStacks++;}else unknown.set(id,(unknown.get(id)??0)+count);
      if(warningForExternalStorage(id))warn(`external:${id}`,`检测到 ${id}；模组背包或外部仓库中的内容不会导入。`);
    }
    const components=componentOf(value);const container=components?.['minecraft:container'];
    if(isList(container)){
      result.containers++;const slots=new Set<number>();
      for(const entry of container)if(isCompound(entry)){
        const slot=asCount(entry.slot)??asCount(entry.Slot);if(slot!==undefined){if(slots.has(slot))throw new Error('容器中存在重复槽位。');slots.add(slot);}
        if(isCompound(entry.item))scan(entry.item,multiplier*ownCount,depth+1);
      }
    }
  };
  const scanList=(stacks:NbtValue[],label:string)=>{const slots=new Set<number>();for(const stack of stacks){if(isCompound(stack)){const slot=asCount(stack.Slot)??asCount(stack.slot);if(slot!==undefined){if(slots.has(slot))throw new Error(`${label}中存在重复槽位。`);slots.add(slot);}}scan(stack,1,0);}};
  if(inventory)scanList(inventory,'背包');if(ender)scanList(ender,'末影箱');
  result.unknownItems=[...unknown].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}));
  const named=[player.LastKnownName,root.LastKnownName,isCompound(root.bukkit)?root.bukkit.lastKnownName:undefined].find(value=>typeof value==='string');if(typeof named==='string')result.playerName=named;
  return result;
}
