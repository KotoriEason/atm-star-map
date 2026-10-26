import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from native_recipes import normalize,flatten_tag,loot_items

class NativeRecipeTests(unittest.TestCase):
    def test_oritech_default_bucket_amount_and_fluid_only_outputs(self):
        routes=normalize({'type':'oritech:refinery','fluidInput':{'fluid':'#c:crude_oil'},'ingredients':[],'results':[],'fluidOutputs':[{'fluid':'oritech:still_diesel','amount':500},{'fluid':'oritech:still_naphtha'}],'time':80})
        self.assertEqual(routes[0]['ingredients'][0],{'options':['fluid:#c:crude_oil'],'count':1000,'consumed':True})
        self.assertEqual(routes[1]['output'],{'key':'fluid:oritech:still_naphtha','count':1000})
        self.assertEqual(routes[0]['machine'],'oritech:refinery_block');self.assertEqual(routes[0]['duration'],80)
    def test_neovitae_fluid_and_spirit_costs_not_silently_dropped(self):
        r=normalize({'type':'neovitae:athanor','inputs':[{'tag':'c:sands'}],'input_fluid':{'amount':200,'tag':'minecraft:water'},'guaranteed_outputs':[{'id':'minecraft:clay_ball'}],'spiritus_costs':{'neovitae:petty':5}})[0]
        self.assertIn({'options':['fluid:#minecraft:water'],'count':200,'consumed':True},r['ingredients'])
        self.assertIn('spiritus',r['notes'])
    def test_shaped_counts_and_alternatives(self):
        r=normalize({'type':'minecraft:crafting_shaped','pattern':['AA',' B'],'key':{'A':{'tag':'c:ingots/iron'},'B':[{'item':'minecraft:stick'},{'item':'minecraft:bamboo'}]},'result':{'id':'pack:tool','count':2}})[0]
        self.assertEqual(r['ingredients'][0],{'options':['#c:ingots/iron'],'count':2,'consumed':True})
        self.assertEqual(r['ingredients'][1]['options'],['minecraft:stick','minecraft:bamboo'])
        self.assertEqual(r['output'],{'key':'pack:tool','count':2})
    def test_mi_catalyst_not_consumed(self):
        r=normalize({'type':'modern_industrialization:assembler','eu':16,'duration':200,'item_inputs':[{'item':'pack:mold','amount':0},{'item':'pack:ingot','amount':2}],'fluid_inputs':[{'fluid':'pack:acid','amount':100}],'item_outputs':[{'item':'pack:plate','amount':3}]})[0]
        self.assertEqual(r['ingredients'][0],{'options':['pack:mold'],'count':1,'consumed':False})
        self.assertEqual(r['ingredients'][2]['options'],['fluid:pack:acid'])
    def test_mekanism_per_tick_is_not_a_fixed_batch(self):
        r=normalize({'type':'mekanism:injecting','per_tick_usage':True,'chemical_input':{'amount':1,'chemical':'mekanism:oxygen'},'item_input':{'item':'pack:dust'},'output':{'id':'pack:ingot'}})[0]
        self.assertTrue(r['manualOnly']);self.assertIn('每刻',r['notes'])
    def test_inscriber_reusable_press(self):
        r=normalize({'type':'ae2:inscriber','mode':'inscribe','ingredients':{'top':{'item':'pack:press'},'middle':{'item':'minecraft:gold_ingot'}},'result':{'id':'pack:circuit'}})[0]
        self.assertFalse(r['ingredients'][0]['consumed'])
    def test_random_output_not_confirmed_as_guaranteed(self):
        r=normalize({'type':'create:crushing','ingredients':[{'item':'pack:ore'}],'results':[{'id':'pack:gem','count':2,'chance':0.3}],'processingTime':100})[0]
        self.assertEqual(r['chance'],0.3);self.assertTrue(r['manualOnly'])
    def test_components_do_not_alias_plain_item(self):
        r=normalize({'type':'minecraft:crafting_shapeless','ingredients':[{'item':'minecraft:paper'}],'result':{'id':'minecraft:enchanted_book','components':{'minecraft:stored_enchantments':{'levels':{'minecraft:mending':1}}}}})[0]
        self.assertNotEqual(r['output']['key'],'minecraft:enchanted_book');self.assertIn('minecraft:mending',r['output']['key'])
    def test_unknown_adapter_rejects(self):
        with self.assertRaises(ValueError):normalize({'type':'unknown:magic','input':{'item':'pack:a'},'result':{'id':'pack:b'}})
    def test_recursive_tag_cycle_and_missing(self):
        tags={'#c:one':['#c:two','pack:a'],'#c:two':['#c:one','pack:b']}
        self.assertEqual(set(flatten_tag('#c:one',tags)),{'pack:a','pack:b'})
        self.assertEqual(flatten_tag('#c:absent',tags),[])
    def test_loot_retains_nested_conditions(self):
        loot={'pools':[{'conditions':[{'condition':'minecraft:random_chance','chance':0.1}],'entries':[{'type':'minecraft:alternatives','children':[{'type':'minecraft:item','name':'pack:heart'}]}]}]}
        entries=loot_items(loot)
        self.assertEqual(entries[0]['key'],'pack:heart');self.assertIn('0.1',entries[0]['conditions'])
    def test_negative_and_ambiguous_counts_rejected(self):
        for result in [{'id':'pack:b','count':-2},{'id':'pack:b','count':0}]:
            with self.assertRaises(ValueError):normalize({'type':'minecraft:crafting_shapeless','ingredients':[{'item':'pack:a'}],'result':result})

if __name__=='__main__':unittest.main()
