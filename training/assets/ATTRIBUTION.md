# Training asset attribution

`a-beautiful-game.glb` is a private, ignored renderer cache. It is never
bundled into the React PWA.

## A Beautiful Game

- Original model: © 2020 ASWF, MaterialX Project
- glTF conversion: © 2022 Ed Mackey
- Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Source: [Khronos glTF Sample Assets — A Beautiful Game](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ABeautifulGame)

The renderer verifies the byte-level SHA-256 recorded in
`asset-lock.json` before generating a dataset. This attribution and the asset
lock travel with every code checkout; the binary itself remains outside Git.
