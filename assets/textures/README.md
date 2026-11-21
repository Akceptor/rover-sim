# Building materials

`building-materials.png` is an original texture atlas generated with the built-in
`image_gen` tool for Rover Sim on 2026-11-21. It contains plaster, brick, concrete
and bitumen material swatches. It does not depict the actual facades of mapped
OSM buildings. Runtime canvas textures add windows, frames, sills and decorative
doors and sample inset regions of the atlas. All assets work offline.

The texture set is shared between buildings and reused across world reloads.
Texture detail, openings and color variation are visual; collisions still use
the existing OSM footprint prisms. Roofs remain flat and doors are decorative.

## Generation prompt

```
Use case: photorealistic-natural. Asset type: seamless game building material texture atlas, square 1536 by 1536 pixels. A strict 2 by 2 grid of four equally sized material tiles, each filling exactly one quadrant edge to edge, no gutters, no labels. Top left quadrant: realistic old pale warm ivory stucco/plaster facade, fine rough grain, subtle aged staining, no openings or windows. Top right quadrant: realistic red/brown clay brick wall, small horizontal running-bond bricks, light recessed mortar, subtle variation, no openings. Bottom left quadrant: realistic grey cast concrete wall, subtle small pores and weathering, no strong panel seams. Bottom right quadrant: realistic flat grey dark bitumen roof surface, subtle fine asphalt grain, no objects or seams. Strictly orthographic front-on albedo/base-color textures, uniform diffuse neutral light, equal exposure. No perspective, no dramatic shadows, no gradients, no vignettes, no structural protrusions, no windows, no doors, no vegetation, no sky, no people, no text or logos. These four materials will be sampled separately and repeated on building walls in a rover FPV game; sharp physically credible close-range surface detail, understated wear. All quadrants must be seamless repeatable material swatches.
```
