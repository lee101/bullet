import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const OUTPUT_DIR = 'public/assets/generated';

interface TexturePrompt {
  name: string;
  prompt: string;
  size: number;
}

const TEXTURE_PROMPTS: TexturePrompt[] = [
  // === TERRAIN TILES (seamless, medieval top-down) ===
  { name: 'terrain_grass', prompt: 'seamless tileable grass texture, medieval fantasy game, top-down view, lush green meadow with small clovers and tiny wildflowers, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_forest', prompt: 'seamless tileable dark forest floor texture, medieval fantasy game, top-down view, fallen leaves moss and twigs, dappled shadows, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_mountain', prompt: 'seamless tileable rocky mountain texture, medieval fantasy game, top-down view, grey stone with cracks and small pebbles, rugged terrain, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_snow', prompt: 'seamless tileable snow texture, medieval fantasy game, top-down view, white pristine snow with subtle blue shadows and ice crystals, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_shore', prompt: 'seamless tileable sandy beach texture, medieval fantasy game, top-down view, golden sand with small shells and pebbles, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_river', prompt: 'seamless tileable shallow water texture, medieval fantasy game, top-down view, clear blue water with subtle ripples and caustics, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_sea', prompt: 'seamless tileable deep ocean water texture, medieval fantasy game, top-down view, dark blue water with wave patterns, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_swamp', prompt: 'seamless tileable swamp murky water texture, medieval fantasy game, top-down view, dark green stagnant water with algae and lily pads, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_lowland', prompt: 'seamless tileable dry dirt path texture, medieval fantasy game, top-down view, brown earth with dried grass patches and small stones, hand-painted style, 2D game asset', size: 256 },
  { name: 'terrain_town', prompt: 'seamless tileable cobblestone street texture, medieval fantasy game, top-down view, grey stone pavement with moss between stones, hand-painted style, 2D game asset', size: 256 },

  // === TERRAIN DECOR (top-down medieval) ===
  { name: 'decor_tree_oak', prompt: 'oak tree top-down view, medieval fantasy game asset, lush green circular canopy, hand-painted style, transparent background', size: 128 },
  { name: 'decor_tree_pine', prompt: 'pine tree top-down view, medieval fantasy game asset, dark green conifer, hand-painted style, transparent background', size: 128 },
  { name: 'decor_tree_dead', prompt: 'dead tree top-down view, medieval fantasy game asset, bare twisted branches, hand-painted style, transparent background', size: 128 },
  { name: 'decor_tree_palm', prompt: 'palm tree top-down view, medieval fantasy game asset, tropical fronds, hand-painted style, transparent background', size: 128 },
  { name: 'decor_tree_frozen', prompt: 'frozen snow-covered tree top-down view, medieval fantasy game asset, ice crystals, hand-painted style, transparent background', size: 128 },
  { name: 'decor_rock_small', prompt: 'small rock top-down view, medieval fantasy game asset, grey stone, hand-painted style, transparent background', size: 64 },
  { name: 'decor_rock_large', prompt: 'large boulder top-down view, medieval fantasy game asset, mossy grey stone, hand-painted style, transparent background', size: 96 },
  { name: 'decor_bush', prompt: 'green bush top-down view, medieval fantasy game asset, leafy shrub, hand-painted style, transparent background', size: 64 },
  { name: 'decor_flowers', prompt: 'wildflower patch top-down view, medieval fantasy game asset, colorful small flowers, hand-painted style, transparent background', size: 64 },
  { name: 'decor_mushrooms', prompt: 'mushroom cluster top-down view, medieval fantasy game asset, red spotted caps, hand-painted style, transparent background', size: 64 },
  { name: 'decor_ruins', prompt: 'stone ruins top-down view, medieval fantasy game asset, crumbling ancient walls, hand-painted style, transparent background', size: 128 },
  { name: 'decor_bones', prompt: 'skeleton bones pile top-down view, medieval fantasy game asset, scattered remains, hand-painted style, transparent background', size: 64 },
  { name: 'decor_campfire', prompt: 'campfire with logs top-down view, medieval fantasy game asset, warm flames, hand-painted style, transparent background', size: 96 },
  { name: 'decor_tent', prompt: 'medieval camping tent top-down view, fantasy game asset, canvas shelter, hand-painted style, transparent background', size: 128 },
  { name: 'decor_waterlily', prompt: 'water lily pad with flower top-down view, fantasy game asset, floating on water, hand-painted style, transparent background', size: 64 },
  { name: 'decor_reeds', prompt: 'cattail reeds top-down view, medieval fantasy game asset, swamp grass, hand-painted style, transparent background', size: 64 },

  // Fire effects
  { name: 'fire_base', prompt: 'seamless tileable fire texture, orange flames, game asset, transparent background, 2D sprite', size: 256 },
  { name: 'fire_ember', prompt: 'seamless glowing ember particles texture, red orange sparks, game VFX, transparent background', size: 128 },
  { name: 'fire_explosion', prompt: 'explosion fire burst sprite sheet, radial flames, game effect, transparent background', size: 512 },

  // Ice effects
  { name: 'ice_crystal', prompt: 'seamless ice crystal texture, cyan blue frost, game asset, transparent edges, 2D', size: 256 },
  { name: 'ice_shard', prompt: 'ice shard particles, frozen shatter effect, blue white, game VFX sprite', size: 128 },
  { name: 'frost_aura', prompt: 'circular frost aura effect, icy mist, cyan glow, game magic effect, transparent', size: 256 },

  // Lightning
  { name: 'lightning_bolt', prompt: 'electric lightning bolt sprite, yellow white energy, game effect, transparent background', size: 256 },
  { name: 'lightning_arc', prompt: 'electric arc chain lightning, branching electricity, game VFX, transparent', size: 512 },
  { name: 'spark_burst', prompt: 'electric spark burst particles, yellow energy sparks, game effect sprite', size: 128 },

  // Magic/arcane
  { name: 'magic_rune', prompt: 'glowing magic rune circle, purple arcane symbols, game spell effect, transparent', size: 256 },
  { name: 'magic_orb', prompt: 'glowing magic orb sphere, purple pink energy, game projectile sprite, transparent', size: 128 },
  { name: 'nova_ring', prompt: 'expanding magic ring nova, purple shockwave, game AOE effect, transparent', size: 512 },

  // Poison
  { name: 'poison_cloud', prompt: 'toxic poison cloud gas, green purple mist, game effect, transparent background', size: 256 },
  { name: 'poison_drip', prompt: 'dripping poison slime drops, green toxic liquid, game VFX sprite', size: 128 },

  // Misc effects
  { name: 'heal_sparkle', prompt: 'healing magic sparkles, green white particles, game heal effect, transparent', size: 128 },
  { name: 'shield_bubble', prompt: 'magic shield barrier bubble, blue energy dome, game defense effect, transparent', size: 256 },
  { name: 'teleport_swirl', prompt: 'teleport portal swirl effect, purple vortex, game magic effect, transparent', size: 256 },
  { name: 'meteor_rock', prompt: 'flaming meteor rock, fire trail, game projectile sprite, transparent background', size: 256 },

  // City styles - varied architecture
  { name: 'city_medieval', prompt: 'medieval stone castle fortress, towers and walls, fantasy game art, top-down isometric view, detailed pixel art style', size: 512 },
  { name: 'city_desert', prompt: 'desert oasis city with sandstone domes and minarets, palm trees, golden sand, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_asian', prompt: 'asian pagoda temple complex, red roofs, cherry blossoms, zen garden, fantasy game art, top-down isometric view', size: 512 },
  { name: 'city_nordic', prompt: 'viking nordic village with wooden longhouses, snowy mountains, fjord, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_elven', prompt: 'elven forest city with treehouse structures, glowing mushrooms, magical vines, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_dwarven', prompt: 'dwarven mountain hold, stone carved halls, forge fires, underground city entrance, fantasy game art, top-down isometric', size: 512 },

  // Campfire
  { name: 'campfire', prompt: 'cozy campfire with logs and flames, warm orange glow, fantasy game asset, top-down view, transparent background', size: 256 },
  { name: 'campfire_glow', prompt: 'circular warm light glow effect, orange yellow gradient, game lighting effect, transparent background', size: 256 },

  // === CHARACTER PORTRAITS (high-res anime style for dialogs) ===
  // Starters
  { name: 'char_samurai_portrait', prompt: 'anime style character portrait, samurai warrior, traditional japanese armor with red accents, katana, confident expression, dark hair in topknot, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_witch_portrait', prompt: 'anime style character portrait, beautiful witch, purple robes and pointed hat, silver hair, magical aura, mysterious smile, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_ninja_portrait', prompt: 'anime style character portrait, ninja assassin, black mask and hood, sharp eyes visible, kunai weapons, stealthy pose, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_paladin_portrait', prompt: 'anime style character portrait, holy paladin knight, golden armor with white cape, blonde hair, noble expression, holy light aura, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_necromancer_portrait', prompt: 'anime style character portrait, dark necromancer, black robes with skull motifs, pale skin, glowing purple eyes, ethereal ghosts around, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_bard_portrait', prompt: 'anime style character portrait, charismatic bard, colorful performer outfit, lute instrument, charming smile, feathered hat, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_druid_portrait', prompt: 'anime style character portrait, nature druid, green robes with leaf patterns, wooden staff with vines, kind wise expression, antler headdress, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },

  // Elemental variants
  { name: 'char_fire_samurai_portrait', prompt: 'anime style character portrait, fire samurai, flaming red armor, katana wreathed in flames, fierce expression, fire aura, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_ice_witch_portrait', prompt: 'anime style character portrait, ice witch, crystalline blue robes, ice crown, pale blue skin, frozen magic aura, cold beauty, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_storm_ninja_portrait', prompt: 'anime style character portrait, storm ninja, electric blue outfit, lightning crackling around, white hair standing up, intense eyes, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },

  // Monster characters
  { name: 'char_dragon_knight_portrait', prompt: 'anime style character portrait, dragon knight warrior, draconic armor with scales, dragon horns helmet, fierce red eyes, fire breath, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_vampire_portrait', prompt: 'anime style character portrait, elegant vampire lord, gothic black and red attire, pale skin, red glowing eyes, fangs visible, aristocratic, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_werewolf_portrait', prompt: 'anime style character portrait, werewolf hybrid form, fur and fangs, torn clothes, feral yellow eyes, muscular, savage expression, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_angel_portrait', prompt: 'anime style character portrait, divine angel, white feathered wings, golden halo, flowing white robes, serene expression, holy light, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_demon_portrait', prompt: 'anime style character portrait, demon warrior, black horns, red skin, infernal armor, burning eyes, menacing grin, hellfire aura, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },

  // Legendaries
  { name: 'char_phoenix_portrait', prompt: 'anime style character portrait, phoenix humanoid, fiery red and gold feathers, burning wings, blazing eyes, majestic pose, rebirth flames, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_titan_portrait', prompt: 'anime style character portrait, ancient titan giant, stone-like skin with glowing runes, massive build, ancient wise eyes, cosmic power, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_void_walker_portrait', prompt: 'anime style character portrait, void walker entity, ethereal dark form, starfield within body, glowing white eyes, cosmic horror aesthetic, dimensional rifts, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },

  // Joke characters
  { name: 'char_chef_portrait', prompt: 'anime style character portrait, battle chef, white chef hat and apron, wielding frying pan and cleaver, determined expression, food magic effects, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },
  { name: 'char_chicken_portrait', prompt: 'anime style character portrait, heroic battle chicken, feathered warrior with tiny armor, fierce determined expression, absurd but epic, fantasy RPG game art, detailed face, upper body shot, dramatic lighting, high quality, 2D illustration', size: 512 },

  // === CHARACTER SPRITES (smaller for selection screen) ===
  { name: 'char_samurai_sprite', prompt: 'anime chibi character sprite, samurai warrior, full body, standing pose, traditional armor, katana, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_witch_sprite', prompt: 'anime chibi character sprite, witch with staff, full body, standing pose, purple robes, pointed hat, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_ninja_sprite', prompt: 'anime chibi character sprite, ninja in black, full body, action pose, kunai weapons, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_paladin_sprite', prompt: 'anime chibi character sprite, holy paladin knight, full body, standing pose, golden armor, shield, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_necromancer_sprite', prompt: 'anime chibi character sprite, dark necromancer, full body, casting pose, black robes, skull staff, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_bard_sprite', prompt: 'anime chibi character sprite, bard with lute, full body, performing pose, colorful outfit, fantasy game asset, clean lines, transparent background', size: 256 },
  { name: 'char_druid_sprite', prompt: 'anime chibi character sprite, nature druid, full body, standing pose, green robes, wooden staff, fantasy game asset, clean lines, transparent background', size: 256 },

  // === CHARACTER ICONS (tiny for HUD) ===
  { name: 'char_samurai_icon', prompt: 'anime character icon, samurai face with helmet, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_witch_icon', prompt: 'anime character icon, witch face with hat, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_ninja_icon', prompt: 'anime character icon, ninja masked face, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_paladin_icon', prompt: 'anime character icon, paladin knight face with helmet, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_necromancer_icon', prompt: 'anime character icon, necromancer hooded face, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_bard_icon', prompt: 'anime character icon, bard face with feathered hat, minimalist style, game UI icon, clean lines, transparent background', size: 64 },
  { name: 'char_druid_icon', prompt: 'anime character icon, druid face with antlers, minimalist style, game UI icon, clean lines, transparent background', size: 64 },

  // === FACTION CASTLES (top-down, detailed) ===
  // Blue player faction castles
  { name: 'castle_blue_main', prompt: 'top-down medieval fantasy castle, blue faction stronghold, white stone walls with blue banners and flags, circular central keep with blue roof, ornate golden details, defensive towers at corners, cobblestone courtyard, epic scale, game art style, detailed architectural features, high fantasy aesthetic', size: 512 },
  { name: 'castle_blue_tower', prompt: 'top-down single defensive tower, blue faction, white stone construction with blue tile conical roof, flag with blue banner waving, arrow slits, crenellations, small courtyard, game art style, medieval fantasy, detailed', size: 256 },
  { name: 'castle_blue_gate', prompt: 'top-down castle gatehouse, blue faction, white stone archway with blue portcullis, twin guard towers with blue roofs, drawbridge over moat, blue banners flanking entrance, game art style, medieval fantasy', size: 256 },
  { name: 'castle_blue_wall', prompt: 'top-down castle wall segment, blue faction, white stone battlements, blue banner posts, torches in sconces, patrol walkway on top, seamless tileable horizontal, game art style, medieval fantasy', size: 256 },
  { name: 'castle_blue_outpost', prompt: 'top-down small fortified outpost, blue faction, circular wooden palisade with stone watchtower, blue flag, small garrison quarters, campfire in center, game art style, medieval fantasy', size: 256 },

  // Red enemy faction castles
  { name: 'castle_red_main', prompt: 'top-down dark medieval fortress, red faction evil stronghold, black stone walls with crimson red banners and skull motifs, jagged angular keep with red glowing windows, spiked towers, lava moat or red magical energy, dark ominous atmosphere, game art style, dark fantasy evil castle aesthetic', size: 512 },
  { name: 'castle_red_tower', prompt: 'top-down single dark tower, red faction, black obsidian stone with crimson red accents, spiked conical roof, demonic gargoyles, red glowing orb at top, evil banner, game art style, dark fantasy', size: 256 },
  { name: 'castle_red_gate', prompt: 'top-down evil fortress gatehouse, red faction, black iron portcullis with skull motif, jagged black stone arch, twin demon statue towers, red flame braziers, game art style, dark fantasy', size: 256 },
  { name: 'castle_red_wall', prompt: 'top-down dark fortress wall segment, red faction, black stone with spike battlements, red banners with skull emblems, torch braziers with red fire, bones and chains decoration, seamless tileable, game art style, dark fantasy', size: 256 },
  { name: 'castle_red_outpost', prompt: 'top-down dark outpost camp, red faction, wooden spikes and black tents, red banner, sacrificial altar in center, skull totems, campfire with red flames, game art style, dark fantasy evil encampment', size: 256 },

  // Castle interiors/floors
  { name: 'castle_floor_blue', prompt: 'seamless tileable castle floor texture, blue faction, white marble with blue carpet runner, golden trim details, medieval fantasy game asset, top-down view', size: 256 },
  { name: 'castle_floor_red', prompt: 'seamless tileable dark castle floor texture, red faction, black stone with blood red carpet, skull pattern inlays, chains, medieval dark fantasy game asset, top-down view', size: 256 },
];

// Seamless texture LoRA - trigger word: smlstxtr
const TILING_LORA = 'https://huggingface.co/gokaygokay/Flux-Seamless-Texture-LoRA/resolve/main/seamless_texture.safetensors';

async function generateTexture(prompt: TexturePrompt): Promise<Buffer | null> {
  const isTerrain = prompt.name.startsWith('terrain_');

  try {
    if (isTerrain) {
      // Use flux-lora with seamless tiling LoRA for terrain
      const res = await fetch('https://fal.run/fal-ai/flux-lora', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `smlstxtr, ${prompt.prompt}, seamless texture`,
          image_size: { width: prompt.size, height: prompt.size },
          num_images: 1,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          loras: [{ path: TILING_LORA, scale: 1.0 }],
        }),
      });

      if (!res.ok) {
        console.error(`Failed ${prompt.name}: ${res.status}`);
        return null;
      }

      const data = await res.json();
      const imageUrl = data.images?.[0]?.url;
      if (!imageUrl) return null;

      const imgRes = await fetch(imageUrl);
      return Buffer.from(await imgRes.arrayBuffer());
    } else {
      // Regular flux schnell for non-terrain
      const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.prompt,
          image_size: { width: prompt.size, height: prompt.size },
          num_images: 1,
          num_inference_steps: 4,
        }),
      });

      if (!res.ok) {
        console.error(`Failed ${prompt.name}: ${res.status}`);
        return null;
      }

      const data = await res.json();
      const imageUrl = data.images?.[0]?.url;
      if (!imageUrl) return null;

      const imgRes = await fetch(imageUrl);
      return Buffer.from(await imgRes.arrayBuffer());
    }
  } catch (e) {
    console.error(`Error ${prompt.name}:`, e);
    return null;
  }
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${TEXTURE_PROMPTS.length} textures...`);

  for (const prompt of TEXTURE_PROMPTS) {
    console.log(`Generating: ${prompt.name}`);
    const buffer = await generateTexture(prompt);
    if (buffer) {
      writeFileSync(join(OUTPUT_DIR, `${prompt.name}.png`), buffer);
      console.log(`  Saved: ${prompt.name}.png`);
    }
  }

  console.log('Done!');
}

main();
