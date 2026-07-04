"""Procedural arena board generator (PRD section 5.1).

Run inside Blender 4.x (Scripting workspace or `blender --background --python
tools/blender/generate_arena.py`). Builds the 12x24 tile grid with team
territory colors: rows 0-10 Player 1 (blue), rows 13-23 Player 2 (red),
rows 11-12 the neutral river divider (grey).
"""

import bpy


def clear_scene_meshes():
    bpy.ops.object.select_all(action='DESELECT')
    mesh_objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in mesh_objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def generate_stylized_arena():
    clear_scene_meshes()

    tile_dimension = 2.0
    padding = 0.1
    stride = tile_dimension + padding

    # 12x24 Grid Construction Loop
    for x in range(12):
        for y in range(24):
            bpy.ops.mesh.primitive_cube_add(
                size=tile_dimension,
                location=(x * stride, y * stride, 0.0)
            )
            tile_obj = bpy.context.active_object
            tile_obj.name = f"Tile_Node_{x}_{y}"

            # Setup Procedural Material Data
            mat = bpy.data.materials.new(name=f"Mat_Node_Data_{x}_{y}")
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            principled_node = nodes.get("Principled BSDF")

            # Determine Team Territories
            if y <= 10:
                color_vector = (0.15, 0.35, 0.75, 1.0)  # Player 1 Home Blue
            elif y >= 13:
                color_vector = (0.75, 0.15, 0.15, 1.0)  # Player 2 Home Red
            else:
                color_vector = (0.25, 0.25, 0.25, 1.0)  # Divider River Zone

            principled_node.inputs['Base Color'].default_value = color_vector
            tile_obj.data.materials.append(mat)


if __name__ == "__main__":
    generate_stylized_arena()
