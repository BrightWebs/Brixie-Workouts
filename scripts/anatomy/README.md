# Muscle body pipeline

`assets/anatomy/body.bin` is baked from a gray mannequin generated for this app with Tencent HY 3D
(text-to-3D, geometry-only GLB). The generator's outputs belong to whoever generated them, so no third-party credit is needed for this asset.

Bake it again (Python 3 with numpy, scipy):

    RAW_GLB=path/to/mannequin.glb python3 scripts/anatomy/export.py 0.004 assets/anatomy/body.bin 0.03 lm

What it does:
1. Simplifies the 500k-triangle sculpt to ~145k triangles (vertex clustering) and keeps the original smooth normals.
2. Measures the sculpted grooves between muscles (concavity) and the broad muscle bellies (convexity).
3. Places seed points on each muscle from anatomical landmarks (`landmarks.py`) and floods outward
   (watershed) so every muscle border settles in the sculpted groove between muscles, not on a straight line.
4. Writes per-vertex: muscle id, soft membership, groove depth, and distance from the muscle's edge
   (used for the orange-core → magenta-edge glow).

Format `RBD3`: header (magic, vertex count, face count, bbox), uint16 positions, int8 normals,
uint8×2 region ids, uint8×2 memberships, uint8 groove, uint8 depth, uint32 indices.

## Skeleton and motion (Mixamo)
The mannequin was rigged with Adobe Mixamo's free auto-rigger (`fbx.py` reads its binary FBX).
- `RIG_FBX=character.fbx` (downloaded in its original pose) supplies the skeleton and skin weights; `export.py`
  writes them into `body.bin` (format `RBD5` adds uint8×4 joint ids + uint8×4 weights) and `assets/anatomy/rig.json`.
- `python3 mixamo_anim.py <folder of animation FBX, no skin> assets/anatomy/rig.json assets/anatomy/anim`
  samples Mixamo motion-capture clips (squats, curls, push-ups, plank, walking...) to per-frame joint rotations.
Exercises without a matching clip are animated in the browser with two-bone IK on the same skeleton (`motion.js`).
