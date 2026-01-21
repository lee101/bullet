/**
 * AI Art Generator - Uses FAL/Replicate/etc for high-quality art
 * Supports multiple providers and batch generation
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ART_PROMPTS, { CHARACTER_LORE, ArtPrompt } from './art-prompts';

const OUTPUT_DIR = 'public/assets/generated';
const TILED_DIR = 'public/assets/tiled';
const PROGRESS_FILE = 'scripts/.art-progress.json';

// Provider configs
const PROVIDERS = {
  fal_schnell: {
    url: 'https://fal.run/fal-ai/flux/schnell',
    key: process.env.FAL_API_KEY,
    steps: 4,
  },
  fal_dev: {
    url: 'https://fal.run/fal-ai/flux/dev',
    key: process.env.FAL_API_KEY,
    steps: 28,
  },
  fal_pro: {
    url: 'https://fal.run/fal-ai/flux-pro',
    key: process.env.FAL_API_KEY,
    steps: 25,
  },
  replicate_sdxl: {
    url: 'https://api.replicate.com/v1/predictions',
    key: process.env.REPLICATE_API_TOKEN,
    model: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  },
};

type ProviderKey = keyof typeof PROVIDERS;

interface GenerationProgress {
  completed: string[];
  failed: string[];
  lastRun: string;
}

function loadProgress(): GenerationProgress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [], failed: [], lastRun: '' };
}

function saveProgress(progress: GenerationProgress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function generateWithFal(prompt: ArtPrompt, provider: ProviderKey): Promise<Buffer | null> {
  const config = PROVIDERS[provider];
  if (!config.key) {
    console.error('No API key for', provider);
    return null;
  }

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.prompt,
        image_size: { width: prompt.size.width, height: prompt.size.height },
        num_images: 1,
        num_inference_steps: config.steps || 4,
        negative_prompt: prompt.negativePrompt || '',
      }),
    });

    if (!res.ok) {
      console.error(`FAL error ${prompt.id}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) return null;

    const imgRes = await fetch(imageUrl);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error(`Error ${prompt.id}:`, e);
    return null;
  }
}

async function generateWithReplicate(prompt: ArtPrompt): Promise<Buffer | null> {
  const config = PROVIDERS.replicate_sdxl;
  if (!config.key) return null;

  try {
    // Start prediction
    const startRes = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: config.model.split(':')[1],
        input: {
          prompt: prompt.prompt,
          negative_prompt: prompt.negativePrompt || '',
          width: prompt.size.width,
          height: prompt.size.height,
        },
      }),
    });

    const prediction = await startRes.json();
    let result = prediction;

    // Poll for completion
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(result.urls.get, {
        headers: { 'Authorization': `Token ${config.key}` },
      });
      result = await pollRes.json();
    }

    if (result.status === 'failed' || !result.output?.[0]) return null;

    const imgRes = await fetch(result.output[0]);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error(`Replicate error ${prompt.id}:`, e);
    return null;
  }
}

// Generate all character variations (portrait, sprite, icon) from lore
function expandCharacterPrompts(): ArtPrompt[] {
  const expanded: ArtPrompt[] = [];
  const STYLE = {
    animePortrait: 'anime illustration, JRPG character art, dramatic lighting, detailed face and eyes, upper body portrait, vibrant colors, high detail, professional quality, artstation',
    animeChibi: 'chibi anime style, cute proportions, full body, simple clean lines, soft shading, game sprite, transparent background',
    pixelIcon: 'pixel art icon, 16-bit style, clean readable silhouette, limited palette, game UI element',
  };
  const NEGATIVE = 'blurry, low quality, deformed, ugly, bad anatomy, extra limbs, text, watermark, signature, frame, border';

  for (const [id, lore] of Object.entries(CHARACTER_LORE)) {
    // Portrait
    expanded.push({
      id: `char_${id}_portrait`,
      category: 'character',
      name: lore.name,
      description: lore.description,
      style: 'anime-portrait',
      size: { width: 512, height: 512 },
      prompt: `${STYLE.animePortrait}, ${lore.name} ${lore.title}, ${lore.visual}, ${lore.description}, dramatic lighting, epic atmosphere`,
      negativePrompt: NEGATIVE,
      tags: ['portrait', lore.element],
    });

    // Sprite
    expanded.push({
      id: `char_${id}_sprite`,
      category: 'character',
      name: `${lore.name} Sprite`,
      description: `Chibi ${lore.name} for gameplay`,
      style: 'anime-chibi',
      size: { width: 256, height: 256 },
      prompt: `${STYLE.animeChibi}, ${lore.name}, ${lore.visual.split(',').slice(0, 3).join(',')}, cute idle pose, transparent background`,
      negativePrompt: NEGATIVE,
      tags: ['sprite', lore.element],
    });

    // Icon
    expanded.push({
      id: `char_${id}_icon`,
      category: 'character',
      name: `${lore.name} Icon`,
      description: `HUD icon for ${lore.name}`,
      style: 'pixel-icon',
      size: { width: 64, height: 64 },
      prompt: `${STYLE.pixelIcon}, ${lore.name} face icon, ${lore.visual.split(',')[0]}, recognizable silhouette, transparent background`,
      negativePrompt: NEGATIVE,
      tags: ['icon', lore.element],
    });
  }

  return expanded;
}

// Expand variants into separate prompts
function expandVariants(prompts: ArtPrompt[]): ArtPrompt[] {
  const expanded: ArtPrompt[] = [];
  for (const p of prompts) {
    expanded.push(p);
    if (p.variants) {
      for (let i = 0; i < p.variants.length; i++) {
        expanded.push({
          ...p,
          id: `${p.id}_v${i + 1}`,
          name: `${p.name} (${p.variants[i]})`,
          prompt: p.prompt.replace(p.name.toLowerCase(), p.variants[i]),
        });
      }
    }
  }
  return expanded;
}

async function main() {
  const args = process.argv.slice(2);
  const provider = (args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'fal_schnell') as ProviderKey;
  const category = args.find(a => a.startsWith('--category='))?.split('=')[1];
  const single = args.find(a => a.startsWith('--id='))?.split('=')[1];
  const skipCompleted = !args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const withVariants = args.includes('--variants');

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(TILED_DIR)) mkdirSync(TILED_DIR, { recursive: true });

  // Expand character prompts from lore, dedupe by id
  const characterFromLore = expandCharacterPrompts();
  const baseIds = new Set(ART_PROMPTS.map(p => p.id));
  const uniqueCharPrompts = characterFromLore.filter(p => !baseIds.has(p.id));
  let allPrompts = [...ART_PROMPTS, ...uniqueCharPrompts];

  // Optionally expand variants
  if (withVariants) {
    allPrompts = expandVariants(allPrompts);
  }

  // Filter prompts
  let prompts = allPrompts;
  if (category) {
    prompts = prompts.filter(p => p.category === category);
  }
  if (single) {
    prompts = prompts.filter(p => p.id === single || p.id.startsWith(single + '_v'));
  }

  const progress = loadProgress();
  if (skipCompleted) {
    prompts = prompts.filter(p => !progress.completed.includes(p.id));
  }

  console.log(`Generating ${prompts.length} assets with ${provider}${withVariants ? ' (with variants)' : ''}`);
  if (dryRun) {
    console.log('DRY RUN - prompts:');
    prompts.forEach(p => console.log(`  ${p.id}: ${p.prompt.slice(0, 80)}...`));
    return;
  }

  const config = PROVIDERS[provider];
  if (!config.key) {
    console.error(`No API key set. Set ${provider.toUpperCase().replace('_', '_API_')}_KEY`);
    console.log('Available providers: fal_schnell, fal_dev, fal_pro, replicate_sdxl');
    return;
  }

  let successCount = 0;
  for (const prompt of prompts) {
    console.log(`[${successCount + 1}/${prompts.length}] ${prompt.id}`);

    let buffer: Buffer | null = null;
    if (provider.startsWith('fal')) {
      buffer = await generateWithFal(prompt, provider);
    } else if (provider === 'replicate_sdxl') {
      buffer = await generateWithReplicate(prompt);
    }

    if (buffer) {
      const dir = prompt.category === 'terrain' ? TILED_DIR : OUTPUT_DIR;
      writeFileSync(join(dir, `${prompt.id}.png`), buffer);
      progress.completed.push(prompt.id);
      successCount++;
      console.log(`  saved ${prompt.id}.png`);
    } else {
      progress.failed.push(prompt.id);
      console.log(`  FAILED ${prompt.id}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
    saveProgress(progress);
  }

  progress.lastRun = new Date().toISOString();
  saveProgress(progress);
  console.log(`Done! ${successCount}/${prompts.length} succeeded`);
}

main();
