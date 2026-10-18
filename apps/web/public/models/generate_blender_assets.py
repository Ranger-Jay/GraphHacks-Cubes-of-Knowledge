import bpy
import math
import os

# Clear existing objects in the scene
bpy.ops.wm.read_factory_settings(use_empty=True)

models_dir = os.path.dirname(os.path.abspath(__file__))

# -------------------------------------------------------------------------
# 1. GENERATE THE CYBERNETIC PROTECTOR PYRAMID
# -------------------------------------------------------------------------
def create_protector_pyramid():
    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    
    # Create base pyramid using cone operator with 4 vertices
    bpy.ops.mesh.primitive_cone_add(
        vertices=4,
        radius1=1.0,
        radius2=0.0,
        depth=1.4,
        location=(0, 0, 0)
    )
    pyramid = bpy.context.active_object
    pyramid.name = "ProtectorPyramid"
    
    # Rotate 45 deg so faces align cleanly with cardinal axes
    pyramid.rotation_euler = (0, 0, math.radians(45))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    
    # Add Bevel modifier for high-specular chamfered edges
    bevel_mod = pyramid.modifiers.new(name="EdgeBevel", type='BEVEL')
    bevel_mod.width = 0.04
    bevel_mod.segments = 3
    bevel_mod.profile = 0.7
    
    # Create Obsidian Glass Material
    mat_obsidian = bpy.data.materials.new(name="Mat_ObsidianHull")
    mat_obsidian.use_nodes = True
    bsdf = next(n for n in mat_obsidian.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    
    # Obsidian metallic parameters
    bsdf.inputs['Base Color'].default_value = (0.02, 0.03, 0.05, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.85
    bsdf.inputs['Roughness'].default_value = 0.15
    if 'IOR' in bsdf.inputs:
        bsdf.inputs['IOR'].default_value = 1.6
    
    # Create Glowing Conduit Material
    mat_glow = bpy.data.materials.new(name="Mat_CyanConduit")
    mat_glow.use_nodes = True
    bsdf_glow = next(n for n in mat_glow.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf_glow.inputs['Base Color'].default_value = (0.2, 0.9, 1.0, 1.0)
    if 'Emission Color' in bsdf_glow.inputs:
        bsdf_glow.inputs['Emission Color'].default_value = (0.3, 0.95, 1.0, 1.0)
        bsdf_glow.inputs['Emission Strength'].default_value = 4.5
    
    pyramid.data.materials.append(mat_obsidian)
    
    # Add floating apex crystal
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.18, location=(0, 0, 0.85))
    apex_crystal = bpy.context.active_object
    apex_crystal.name = "ApexCrystal"
    apex_crystal.data.materials.append(mat_glow)
    apex_crystal.parent = pyramid
    
    # Export GLB and save Blend
    glb_path = os.path.join(models_dir, "protector_pyramid.glb")
    blend_path = os.path.join(models_dir, "protector_pyramid.blend")
    
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True
    )
    print(f"--> Exported: {glb_path} and {blend_path}")

    # Set up lighting & camera for a high-res preview snapshot
    bpy.ops.object.camera_add(location=(2.2, -2.2, 1.6), rotation=(math.radians(65), 0, math.radians(45)))
    cam = bpy.context.active_object
    bpy.context.scene.camera = cam

    bpy.ops.object.light_add(type='POINT', radius=0.5, location=(2.5, -1.0, 3.0))
    key_light = bpy.context.active_object
    key_light.data.energy = 150
    key_light.data.color = (0.7, 0.9, 1.0)

    bpy.ops.object.light_add(type='POINT', radius=0.8, location=(-2.0, 2.5, 0.5))
    rim_light = bpy.context.active_object
    rim_light.data.energy = 220
    rim_light.data.color = (0.6, 0.3, 1.0)

    bpy.context.scene.render.resolution_x = 800
    bpy.context.scene.render.resolution_y = 600
    preview_img_path = os.path.join(models_dir, "protector_pyramid_preview.png")
    bpy.context.scene.render.filepath = preview_img_path
    bpy.ops.render.render(write_still=True)
    print(f"--> Rendered preview: {preview_img_path}")

create_protector_pyramid()
print(">>> BLENDER ASSET GENERATION COMPLETE!")
