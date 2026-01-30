/// <reference lib="webworker" />
import { ProceduralTerrainGenerator } from '../ProceduralTerrain';

declare const self: DedicatedWorkerGlobalScope;

interface TerrainWorkRequest {
  id: number;
  biome: string;
  size: number;
  seed?: number;
}

interface TerrainWorkResponse {
  id: number;
  biome: string;
  size: number;
  pixels: Uint8ClampedArray;
}

let generator = new ProceduralTerrainGenerator();
let currentSeed: number | undefined;

self.onmessage = (event: MessageEvent<TerrainWorkRequest>) => {
  const { id, biome, size, seed } = event.data;
  if (typeof seed === 'number' && seed !== currentSeed) {
    generator = new ProceduralTerrainGenerator(seed);
    currentSeed = seed;
  }
  const pixels = generator.generateBiomePixels(biome, size);
  const response: TerrainWorkResponse = { id, biome, size, pixels };
  self.postMessage(response, [pixels.buffer]);
};
