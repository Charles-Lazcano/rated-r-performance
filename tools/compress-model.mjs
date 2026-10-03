// Meshopt-compresses assets/car.glb in place (geometry is ~90% of the file; textures are already small webp).
//   node compress-model.mjs   (run after build-model.mjs; a no-op if the model is already compressed)
// The page loads three r128's examples/js/libs/meshopt_decoder.js, so vertex data stays on codec version 0.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const FILE = new URL('../assets/car.glb', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(FILE);
if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) { console.log('already compressed'); process.exit(0); }
const before = statSync(FILE).size;
await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' })); // data is already quantized by build-model.mjs
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(FILE, doc);
console.log(`car.glb ${(before / 1048576).toFixed(2)} MB -> ${(statSync(FILE).size / 1048576).toFixed(2)} MB`);
