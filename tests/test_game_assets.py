import importlib.util
import pathlib
import unittest

SPEC = importlib.util.spec_from_file_location('game_assets', pathlib.Path(__file__).parents[1] / 'scripts' / 'game_assets.py')
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)


class GameAssetTests(unittest.TestCase):
    def test_out_of_range_obj_indices_are_reported_as_unsupported_assets(self):
        text='v 0 0 0\nv 1 0 0\nv 1 1 0\nvt 0 0\nf 1/1 2/2 3/3'
        with self.assertRaises(ValueError):assets.obj_faces(text,{'default':'#skin'},[0,0,0],False)

    def test_uses_game_language_keys_and_removes_minecraft_formatting(self):
        self.assertEqual(assets.translate_base('pack:gem', {'item.pack.gem': '§d秘银宝石'}, {}), '秘银宝石')
        self.assertEqual(assets.translate_base('pack:machine', {'block.pack.machine': '符文机器'}, {}), '符文机器')

    def test_does_not_confuse_missing_translation_with_a_chinese_name(self):
        self.assertIsNone(assets.translate_base('pack:gem', {'item.pack.gem': 'Untranslated Gem'}, {}))
        self.assertEqual(assets.translate_base('pack:gem', {}, {'pack:gem': '秘银宝石'}), '秘银宝石')

    def test_resolves_parent_textures_and_texture_variable_aliases(self):
        models = {'pack:item/block': {'parent': 'pack:block/base', 'textures': {'all': 'pack:block/metal'}},
                  'pack:block/base': {'parent': 'minecraft:block/cube_all'},
                  'minecraft:block/cube_all': {'textures': {'particle': '#all'}, 'elements': [{'from': [0, 0, 0], 'to': [16, 16, 16]}]}}
        model = assets.resolve_model('pack:item/block', models.get)
        self.assertEqual(assets.texture_name('#particle', model['textures']), 'pack:block/metal')
        self.assertEqual(len(model['elements']), 1)

    def test_model_cycles_and_texture_alias_cycles_stop(self):
        models = {'pack:a': {'parent': 'pack:b'}, 'pack:b': {'parent': 'pack:a'}}
        with self.assertRaises(ValueError):
            assets.resolve_model('pack:a', models.get)
        with self.assertRaises(ValueError):
            assets.texture_name('#a', {'a': '#b', 'b': '#a'})

    def test_model_coordinates_produce_finite_nonempty_icon_geometry(self):
        faces = assets.model_faces({'elements': [{'from': [0, 0, 0], 'to': [16, 16, 16], 'faces': {side: {'texture': '#all'} for side in ['north', 'south', 'east', 'west', 'up', 'down']}}]})
        self.assertEqual(len(faces), 3)
        self.assertTrue(all(len(f['points']) == 4 for f in faces))
        all_points = [p for face in faces for p in face['points']]
        self.assertGreater(max(p[0] for p in all_points) - min(p[0] for p in all_points), 10)

    def test_component_names_keep_data_model_variants_distinct(self):
        lang = {'entity.minecraft.ender_dragon': '末影龙'}
        a = assets.variant_name('数据模型', 'hostilenetworks:data_model[hostilenetworks:data_model="hostilenetworks:ender_dragon",hostilenetworks:data=1255]', lang)
        b = assets.variant_name('数据模型', 'hostilenetworks:data_model[hostilenetworks:data_model="hostilenetworks:ender_dragon",hostilenetworks:data=1254]', lang)
        self.assertEqual(a, '末影龙数据模型 · 数据 1255')
        self.assertNotEqual(a, b)

    def test_empty_animation_frame_list_uses_the_first_frame(self):
        store = assets.AssetStore.__new__(assets.AssetStore)
        store.read = lambda _: b'\x89PNG\r\n\x1a\n' + b'\x00'*8 + (16).to_bytes(4,'big') + (64).to_bytes(4,'big')
        store.json = lambda _: {'animation': {'frames': []}}
        texture = store.texture('pack:item/animated')
        self.assertEqual((texture['x'],texture['y'],texture['frameWidth'],texture['frameHeight']), (0,0,16,16))

    def test_partial_language_resource_pack_overrides_keep_other_mod_names(self):
        result=assets.merge_languages([{'item.pack.one':'原名称','item.pack.two':'另一个物品'}, {'item.pack.one':'新译名'}])
        self.assertEqual(result, {'item.pack.one':'新译名','item.pack.two':'另一个物品'})

    def test_nonanimated_rectangular_texture_is_not_cropped_to_a_square(self):
        store=assets.AssetStore.__new__(assets.AssetStore)
        store.read=lambda _:b'\x89PNG\r\n\x1a\n'+b'\x00'*8+(64).to_bytes(4,'big')+(32).to_bytes(4,'big')
        store.json=lambda _:None
        texture=store.texture('pack:entity/skin')
        self.assertEqual((texture['frameWidth'],texture['frameHeight']),(64,32))

    def test_obj_faces_keep_material_and_uv_coordinates(self):
        text='v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl face\nf 1/1 2/2 3/3 4/4'
        faces=assets.obj_faces(text,{'face':'#metal'},[0,0,0],False)
        self.assertEqual(len(faces),1)
        self.assertEqual(faces[0]['texture'],'#metal')
        self.assertEqual(faces[0]['uv_points'],[(0.0,0.0),(1.0,0.0),(1.0,1.0),(0.0,1.0)])

if __name__ == '__main__':
    unittest.main()
