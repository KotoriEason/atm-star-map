import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {readMinecraftSave} from '../src/domain/minecraftSave';

type Value = {type:number; payload:number[]};
const i16=(n:number)=>[(n>>>8)&255,n&255];
const i32=(n:number)=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const text=(value:string)=>{const b=new TextEncoder().encode(value);return [...i16(b.length),...b];};
const named=(type:number,name:string,payload:number[])=>[type,...text(name),...payload];
const b=(n:number):Value=>({type:1,payload:[n&255]});
const s=(value:string):Value=>({type:8,payload:text(value)});
const list=(type:number,values:Value[]):Value=>({type:9,payload:[type,...i32(values.length),...values.flatMap(value=>value.payload)]});
const compound=(fields:Record<string,Value>):Value=>({type:10,payload:[...Object.entries(fields).flatMap(([name,value])=>named(value.type,name,value.payload)),0]});
const root=(fields:Record<string,Value>)=>new Uint8Array([10,0,0,...compound(fields).payload]);
const item=(id:string,count:number,components?:Record<string,Value>)=>compound({id:s(id),count:b(count),...(components?{components:compound(components)}:{})});
const playerData={items:{
  plain:{id:'minecraft:diamond',kind:'item'},
  enchanted:{id:'minecraft:diamond',kind:'item',components:'[minecraft:enchantments={levels:{"minecraft:sharpness":3}}]'},
  blood:{id:'evilcraft:blood_container',kind:'item',components:'[cyclopscore:fluid_content={amount:10000,id:"evilcraft:blood"}]'},
}};

describe('readMinecraftSave',()=>{
  it('reads a gzipped level.dat player inventory and keeps duplicate slots as separate stacks',async()=>{
    const legacy=compound({id:s('minecraft:diamond'),Count:b(1)});
    const save=root({Data:compound({Player:compound({Inventory:list(10,[item('minecraft:diamond',2),item('minecraft:diamond',3),legacy]),EnderItems:list(10,[item('minecraft:diamond',1)])})})});
    const result=await readMinecraftSave(new Uint8Array(gzipSync(save)),playerData);
    expect(result.inventory).toEqual({plain:7});
    expect(result.matchedStacks).toBe(4);
    expect(result.sourceKind).toBe('level.dat');
  });

  it('reads nested vanilla container component contents without treating ordinary mod data as storage',async()=>{
    const shulker=item('minecraft:shulker_box',1,{
      'minecraft:container':list(10,[compound({slot:b(0),item:item('minecraft:diamond',4)})]),
      'some_mod:inventory':list(10,[item('minecraft:diamond',99)]),
    });
    const result=await readMinecraftSave(root({Inventory:list(10,[shulker])}),playerData);
    expect(result.inventory).toEqual({plain:4});
    expect(result.containers).toBe(1);
    expect(result.unknownItems).toEqual([{id:'minecraft:shulker_box',count:1}]);
  });

  it('matches special component identities exactly and credits a plain dataset item only as the safe fallback',async()=>{
    const enchantments=compound({levels:compound({'minecraft:sharpness':{type:3,payload:i32(3)}})});
    const fluid=compound({amount:{type:3,payload:i32(10000)},id:s('evilcraft:blood')});
    const save=root({Player:compound({Inventory:list(10,[
      item('minecraft:diamond',2,{'minecraft:enchantments':enchantments}),
      item('minecraft:diamond',5,{'minecraft:custom_name':s('plain enough for the base item')}),
      item('evilcraft:blood_container',1,{'cyclopscore:fluid_content':fluid}),
    ])})});
    const result=await readMinecraftSave(save,playerData);
    expect(result.inventory).toEqual({enchanted:2,plain:5,blood:1});
    expect(result.unknownItems).toEqual([]);
  });

  it('chooses the most specific matching special identity even when the broad candidate appears first',async()=>{
    const data={items:{
      broad:{id:'minecraft:diamond_sword',kind:'item',components:'[minecraft:enchantments={levels:{"minecraft:sharpness":3}}]'},
      full:{id:'minecraft:diamond_sword',kind:'item',components:'[minecraft:enchantments={levels:{"minecraft:sharpness":3,"minecraft:unbreaking":2}}]'},
    }};
    const levels=compound({'minecraft:sharpness':{type:3,payload:i32(3)},'minecraft:unbreaking':{type:3,payload:i32(2)}});
    const save=root({Inventory:list(10,[item('minecraft:diamond_sword',1,{'minecraft:enchantments':compound({levels})})])});
    await expect(readMinecraftSave(save,data)).resolves.toMatchObject({inventory:{full:1}});
  });

  it('rejects duplicate slots within one inventory list but allows the same slot in a separate list',async()=>{
    const slotted=(count:number)=>compound({id:s('minecraft:diamond'),count:b(count),Slot:b(0)});
    const duplicated=root({Inventory:list(10,[slotted(1),slotted(1)])});
    await expect(readMinecraftSave(duplicated,playerData)).rejects.toThrow(/重复槽位/);
    const separate=root({Inventory:list(10,[slotted(1)]),EnderItems:list(10,[slotted(1)])});
    await expect(readMinecraftSave(separate,playerData)).resolves.toMatchObject({inventory:{plain:2}});
  });

  it('rejects truncated or oversized NBT instead of reading an unbounded local file',async()=>{
    await expect(readMinecraftSave(new Uint8Array([10,0,0,8,0]),playerData)).rejects.toThrow(/损坏|截断/);
    await expect(readMinecraftSave(new Uint8Array(8*1024*1024+1),playerData)).rejects.toThrow(/8 MB/);
  });

  it('rejects an NBT collection that exceeds the total parsing work budget before allocation',async()=>{
    const tooMany=root({bytes:{type:7,payload:i32(250_001)}});
    await expect(readMinecraftSave(tooMany,playerData)).rejects.toThrow(/工作量/);
  });

  it('deduplicates repeated malformed-stack warnings',async()=>{
    const broken=compound({id:s('minecraft:diamond')});
    const result=await readMinecraftSave(root({Inventory:list(10,[broken,broken])}),playerData);
    expect(result.warnings).toEqual(['发现无法识别数量的物品堆，已跳过。']);
  });

  it('keeps the browser QA fixture as a valid playerdata inventory',async()=>{
    const fixtureData={items:{dragon:{id:'allthetweaks:dragon_soul',kind:'item'},star:{id:'allthetweaks:atm_star',kind:'item'},diamond:{id:'minecraft:diamond',kind:'item'}}};
    const result=await readMinecraftSave(new Uint8Array(readFileSync('tests/fixtures/player-progress.dat')),fixtureData);
    expect(result.inventory).toEqual({dragon:1,star:1,diamond:64});
  });
});
