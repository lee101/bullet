#!/usr/bin/env bun
/**
 * Eclipse of Lumen - Art Asset Generator
 * Uses FAL AI FLUX.2 klein 9B for generation + BiRefNet for background removal
 */

import sharp from 'sharp';
import { mkdir, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Load API key from environment or .secretbashrc
const FAL_KEY = process.env.FAL_API_KEY ||
  Bun.spawnSync(['bash', '-c', 'source ~/.secretbashrc && echo $FAL_API_KEY']).stdout.toString().trim();

if (!FAL_KEY) {
  console.error('Error: FAL_API_KEY not found');
  process.exit(1);
}

const PROJECT_DIR = join(import.meta.dir, '..');
const ASSETS_DIR = join(PROJECT_DIR, 'assets');

interface Asset {
  category: string;
  name: string;
  prompt: string;
  removeBg?: boolean;
  size?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function submitGeneration(prompt: string, size: string = 'square'): Promise<string> {
  const response = await fetch('https://queue.fal.run/fal-ai/flux-2-klein/9b/base/lora', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      guidance_scale: 5,
      num_inference_steps: 28,
      image_size: size,
      num_images: 1,
      acceleration: 'regular',
      enable_safety_checker: false,
      output_format: 'png'
    })
  });

  const data = await response.json() as { request_id: string };
  return data.request_id;
}

async function waitForResult(requestId: string, maxAttempts: number = 60): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://queue.fal.run/fal-ai/flux-2-klein/requests/${requestId}`,
      {
        headers: { 'Authorization': `Key ${FAL_KEY}` }
      }
    );

    const data = await response.json() as any;

    if (data.images?.[0]?.url) {
      return data.images[0].url;
    }

    if (data.status === 'FAILED') {
      console.error(`Generation failed for request ${requestId}`);
      return null;
    }

    await sleep(2000);
  }

  console.error(`Timeout waiting for request ${requestId}`);
  return null;
}

async function removeBackground(imageUrl: string): Promise<string | null> {
  const response = await fetch('https://queue.fal.run/fal-ai/birefnet', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: imageUrl,
      model: 'General Use (Light)'
    })
  });

  const data = await response.json() as { request_id: string };
  const requestId = data.request_id;

  if (!requestId) {
    console.error('BiRefNet submission failed');
    return imageUrl; // Return original
  }

  // Wait for result - first check status, then get result
  for (let i = 0; i < 60; i++) {
    // Check status first
    const statusResponse = await fetch(
      `https://queue.fal.run/fal-ai/birefnet/requests/${requestId}/status`,
      {
        headers: { 'Authorization': `Key ${FAL_KEY}` }
      }
    );

    const statusData = await statusResponse.json() as any;

    if (statusData.status === 'COMPLETED') {
      // Get the result
      const result = await fetch(
        `https://queue.fal.run/fal-ai/birefnet/requests/${requestId}`,
        {
          headers: { 'Authorization': `Key ${FAL_KEY}` }
        }
      );

      const resultData = await result.json() as any;

      if (resultData.image?.url) {
        return resultData.image.url;
      }
    }

    if (statusData.status === 'FAILED') {
      console.error('BiRefNet failed');
      return imageUrl;
    }

    await sleep(1000);
  }

  console.warn('BiRefNet timeout, using original');
  return imageUrl; // Return original on timeout
}

async function downloadAndConvert(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const webpBuffer = await sharp(Buffer.from(buffer))
    .webp({ quality: 85 })
    .toBuffer();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, webpBuffer);
}

async function generateAsset(
  style: 'pixel' | 'anime',
  asset: Asset
): Promise<boolean> {
  const outputPath = join(ASSETS_DIR, style, asset.category, `${asset.name}.webp`);

  // Skip if exists
  if (existsSync(outputPath)) {
    console.log(`  Skipping ${style}/${asset.category}/${asset.name} (exists)`);
    return true;
  }

  // Build prompt with style prefix
  const stylePrefix = style === 'pixel'
    ? 'pixel art style, 16-bit retro game sprite, crisp pixels, '
    : 'anime art style, high quality illustration, vibrant colors, detailed, ';

  const styleSuffix = style === 'pixel'
    ? ', game asset, transparent background, centered'
    : ', game character art, full body portrait';

  const fullPrompt = stylePrefix + asset.prompt + styleSuffix;

  console.log(`  Generating: ${style}/${asset.category}/${asset.name}`);

  try {
    // Submit generation
    const requestId = await submitGeneration(fullPrompt, asset.size || 'square');

    // Wait for result
    const imageUrl = await waitForResult(requestId);
    if (!imageUrl) {
      console.error(`  Failed: ${asset.name}`);
      return false;
    }

    // Remove background if requested
    let finalUrl = imageUrl;
    if (asset.removeBg !== false) {
      console.log(`    Removing background...`);
      finalUrl = await removeBackground(imageUrl) || imageUrl;
    }

    // Download and convert to WebP
    await downloadAndConvert(finalUrl, outputPath);
    console.log(`  ✓ ${asset.name}`);
    return true;
  } catch (error) {
    console.error(`  Error generating ${asset.name}:`, error);
    return false;
  }
}

// ============================================================================
// ASSET DEFINITIONS
// ============================================================================

const HEROES: Asset[] = [
  { category: 'characters/heroes', name: 'rune-sellsword', prompt: 'male mercenary warrior with glowing rune sword, leather armor with magical runes, balanced fighter, confident pose, fantasy RPG character' },
  { category: 'characters/heroes', name: 'glass-arcanist', prompt: 'female mage with crystalline staff, flowing robes made of magical glass shards, prism effects around her, fragile elegant appearance, arcane scholar' },
  { category: 'characters/heroes', name: 'thorn-ranger', prompt: 'hooded ranger with vine-wrapped bow, leaf and thorn motif armor, nature magic user, trap specialist, green and brown palette' },
  { category: 'characters/heroes', name: 'grave-cantor', prompt: 'mysterious priest with death magic tome, dark robes with silver trim, healing and curse specialist, skull motifs, ethereal wisps' },
  { category: 'characters/heroes', name: 'storm-pugilist', prompt: 'muscular brawler with lightning-wrapped fists, minimal armor, electrified hair, martial artist stance, crackling energy' },
  { category: 'characters/heroes', name: 'bulwark-saint', prompt: 'heavy armored paladin with massive tower shield, glowing ward symbols, divine protection aura, fortress-like presence' },
  { category: 'characters/heroes', name: 'night-courier', prompt: 'stealthy assassin in dark cloak, twin daggers, shadow magic wisps, masked face, agile pose, rogue character' },
  { category: 'characters/heroes', name: 'beast-warden', prompt: 'druid warrior with beast companion spirit, feral appearance, bone and fur armor, nature summoner, wild magic' },
];

const NPCS: Asset[] = [
  { category: 'characters/npcs', name: 'astra-vale', prompt: 'young female courier with glowing crystal shard embedded in chest, practical traveling clothes, protagonist hero, determined expression, magical light emanating' },
  { category: 'characters/npcs', name: 'sir-rowan-kest', prompt: 'disgraced older knight in worn but noble armor, protective stance, scarred face, loyal guardian, fallen from grace' },
  { category: 'characters/npcs', name: 'mira-glass', prompt: 'luminant arcanist woman with glowing veins of light under skin, brilliant dangerous scholar, crystalline accessories, radiant but unstable' },
  { category: 'characters/npcs', name: 'vesper-vaine', prompt: 'elegant vampire diplomat in formal dark attire, mysterious contract scroll, pale skin, red eyes, aristocratic bearing' },
  { category: 'characters/npcs', name: 'bran-moonmark', prompt: 'werewolf scout in tribal leather armor, wolf features, moon tattoos, wild but wise appearance, forest guardian' },
  { category: 'characters/npcs', name: 'the-archivist', prompt: 'masked luminant historian in ornate robes, carrying ancient tomes, cryptic presence, prophecy speaker, mysterious scholarly figure' },
  { category: 'characters/npcs', name: 'vampire-broker', prompt: 'sinister vampire merchant in fine clothes, blood vials and contracts, shrewd businessman, sable court trader' },
  { category: 'characters/npcs', name: 'werewolf-smith', prompt: 'burly werewolf blacksmith with forge hammer, muscular half-transformed, tribal markings, moonbound craftsman' },
  { category: 'characters/npcs', name: 'luminant-archivist', prompt: 'glowing luminant shopkeeper with floating spell books, radiant robes, magical artifacts vendor, lumen choir merchant' },
  { category: 'characters/npcs', name: 'camp-item-vendor', prompt: 'friendly traveling merchant with pack mule, potions and supplies, helpful smile, waypoint trader' },
  { category: 'characters/npcs', name: 'camp-weapon-vendor', prompt: 'grizzled arms dealer with weapon rack, scarred veteran, practical armor, weapons specialist' },
  { category: 'characters/npcs', name: 'camp-magic-vendor', prompt: 'eccentric spell merchant with floating magical items, robes covered in arcane symbols, mysterious dealer' },
];

const ENEMIES: Asset[] = [
  { category: 'characters/enemies', name: 'rift-spawn', prompt: 'twisted creature made of broken light and shadow, unstable magical entity, rift monster, corrupted energy being' },
  { category: 'characters/enemies', name: 'rift-stalker', prompt: 'fast predatory rift creature, elongated limbs, hunting pose, glowing fractures, ambush monster' },
  { category: 'characters/enemies', name: 'void-weaver', prompt: 'floating rift mage creature, reality-warping effects, eldritch appearance, spell caster enemy' },
  { category: 'characters/enemies', name: 'vampire-thrall', prompt: 'mindless vampire servant, pale gaunt appearance, red eyes, basic undead minion, sable court soldier' },
  { category: 'characters/enemies', name: 'shadow-knight', prompt: 'vampire warrior in dark plate armor, shadow weapons, elite sable court guard, menacing presence' },
  { category: 'characters/enemies', name: 'blood-mage', prompt: 'vampire sorcerer with blood magic, crimson spell effects, dark robes, hemomancy caster' },
  { category: 'characters/enemies', name: 'feral-wolf', prompt: 'aggressive wild wolf with glowing eyes, pack hunter, moonbound beast, snarling attack pose' },
  { category: 'characters/enemies', name: 'rage-berserker', prompt: 'frenzied werewolf warrior in partial transformation, tribal paint, uncontrolled fury, moonbound fighter' },
  { category: 'characters/enemies', name: 'pack-shaman', prompt: 'werewolf magic user with totems and bones, nature magic, tribal leader, moonbound spellcaster' },
  { category: 'characters/enemies', name: 'light-sentinel', prompt: 'robotic luminant guardian, geometric light armor, patrol unit, lumen choir enforcer' },
  { category: 'characters/enemies', name: 'purifier', prompt: 'zealot luminant soldier with light weapons, fanatical expression, purity enforcer, lumen choir militant' },
  { category: 'characters/enemies', name: 'prism-mage', prompt: 'luminant spellcaster with refracted light magic, floating prism crystals, overcharged dangerous aura' },
  { category: 'characters/enemies', name: 'bandit-thug', prompt: 'common bandit with crude weapon, ragged clothes, basic human enemy, lawless rogue' },
  { category: 'characters/enemies', name: 'bandit-archer', prompt: 'ranged bandit with bow, hooded figure, ambush tactics, common enemy' },
  { category: 'characters/enemies', name: 'corrupted-soldier', prompt: 'rift-touched soldier in damaged armor, glowing corruption, once-human enemy, tragic figure' },
];

const BOSSES: Asset[] = [
  { category: 'characters/bosses', name: 'the-choirless', prompt: 'horrific mage fused with broken light, tutorial boss, screaming faces in light, corrupted luminant abomination' },
  { category: 'characters/bosses', name: 'mirror-duke', prompt: 'elegant vampire lord with mirror-like armor, sable court leader, aristocratic terrifying presence, reflection magic' },
  { category: 'characters/bosses', name: 'the-white-stag', prompt: 'massive ethereal stag spirit, moonbound guardian, antlers of pure moonlight, majestic and deadly, forest deity' },
  { category: 'characters/bosses', name: 'prism-sentinel', prompt: 'colossal luminant construct of pure light crystals, geometric guardian, lumen choir ancient defender' },
  { category: 'characters/bosses', name: 'the-fixed-choir', prompt: 'chorus of stilled heroes turned to light statues, frozen smiles, horrific beauty, collective boss entity' },
  { category: 'characters/bosses', name: 'seraph-null-phase1', prompt: 'fallen luminant in corrupted angelic armor, weaponized pure light, final boss first form, tragic villain' },
  { category: 'characters/bosses', name: 'seraph-null-phase2', prompt: 'massive winged prism entity, the stillwell seraph, reality-warping final boss, angelic cosmic horror, ultimate form' },
];

const CONSUMABLES: Asset[] = [
  { category: 'items/consumables', name: 'health-potion', prompt: 'red healing potion in glass vial, glowing liquid, HP restore item, fantasy RPG potion' },
  { category: 'items/consumables', name: 'mana-potion', prompt: 'blue mana potion in crystal flask, swirling magical liquid, MP restore item' },
  { category: 'items/consumables', name: 'stamina-potion', prompt: 'green stamina potion, energizing elixir, buff item, glowing emerald liquid' },
  { category: 'items/consumables', name: 'antidote', prompt: 'purple antidote vial, cure poison item, medical remedy, clear bubbling liquid' },
  { category: 'items/consumables', name: 'revive-kit', prompt: 'golden resurrection item, phoenix feather with bandages, revival consumable' },
  { category: 'items/consumables', name: 'fire-bomb', prompt: 'round bomb with flame symbol, explosive throwable, fire damage item' },
  { category: 'items/consumables', name: 'ice-bomb', prompt: 'frost grenade with icicle designs, freeze bomb, cold damage throwable' },
  { category: 'items/consumables', name: 'shock-bomb', prompt: 'lightning bomb with electric sparks, chain damage throwable, shock grenade' },
  { category: 'items/consumables', name: 'smoke-bomb', prompt: 'black smoke bomb, stealth item, escape tool, ninja throwable' },
  { category: 'items/consumables', name: 'spike-trap', prompt: 'mechanical spike trap, deployable hazard, damage trap item' },
  { category: 'items/consumables', name: 'frost-trap', prompt: 'ice crystal trap, freeze snare, slow trap deployable' },
  { category: 'items/consumables', name: 'alarm-trap', prompt: 'magical alarm device, detection trap, alert mechanism' },
];

const WEAPONS: Asset[] = [
  { category: 'items/weapons', name: 'iron-sword', prompt: 'basic iron longsword, starter weapon, simple blade, RPG sword' },
  { category: 'items/weapons', name: 'rune-blade', prompt: 'magical sword with glowing runes, enchanted weapon, blue magical glow' },
  { category: 'items/weapons', name: 'shadow-katana', prompt: 'dark curved blade with shadow wisps, vampire faction weapon, elegant deadly' },
  { category: 'items/weapons', name: 'fang-axe', prompt: 'brutal axe with beast fangs, werewolf faction weapon, savage design' },
  { category: 'items/weapons', name: 'prism-sword', prompt: 'crystalline blade refracting light, luminant faction weapon, pure light weapon' },
  { category: 'items/weapons', name: 'hunting-bow', prompt: 'wooden hunting bow, basic ranged weapon, simple design' },
  { category: 'items/weapons', name: 'thorn-bow', prompt: 'living bow wrapped in thorny vines, nature magic weapon, green organic design' },
  { category: 'items/weapons', name: 'crossbow', prompt: 'mechanical crossbow, precision ranged weapon, metal and wood' },
  { category: 'items/weapons', name: 'light-repeater', prompt: 'magical firearm shooting light projectiles, luminant weapon, energy gun' },
  { category: 'items/weapons', name: 'oak-staff', prompt: 'wooden magic staff, basic arcane focus, nature wood design' },
  { category: 'items/weapons', name: 'crystal-focus', prompt: 'floating crystal arcane focus, powerful magic catalyst, glowing gem' },
  { category: 'items/weapons', name: 'blood-tome', prompt: 'dark book dripping blood, vampire magic weapon, forbidden knowledge' },
  { category: 'items/weapons', name: 'moon-orb', prompt: 'glowing moon sphere, werewolf magic focus, lunar power' },
  { category: 'items/weapons', name: 'lumen-codex', prompt: 'shining holy book, luminant magic weapon, radiant scripture' },
];

const TRINKETS: Asset[] = [
  { category: 'items/trinkets', name: 'frost-pendant', prompt: 'icy blue pendant necklace, cold magic trinket, frozen crystal jewelry' },
  { category: 'items/trinkets', name: 'vampiric-ring', prompt: 'dark red ring with blood gem, lifesteal trinket, sable court accessory' },
  { category: 'items/trinkets', name: 'wolf-fang-necklace', prompt: 'necklace of wolf fangs, werewolf trinket, tribal accessory, pack bond item' },
  { category: 'items/trinkets', name: 'prism-brooch', prompt: 'light-refracting brooch, luminant trinket, rainbow crystal pin' },
  { category: 'items/trinkets', name: 'lucky-coin', prompt: 'golden lucky coin with star, luck boost trinket, fortune item' },
  { category: 'items/trinkets', name: 'speed-boots-charm', prompt: 'winged boot charm, agility trinket, swift movement accessory' },
  { category: 'items/trinkets', name: 'mana-crystal', prompt: 'blue glowing crystal, MP regen trinket, magic enhancement gem' },
  { category: 'items/trinkets', name: 'protection-amulet', prompt: 'golden shield amulet, defense trinket, ward protection charm' },
  { category: 'items/trinkets', name: 'crit-lens', prompt: 'magnifying lens trinket, critical hit chance, precision monocle' },
  { category: 'items/trinkets', name: 'rage-fang', prompt: 'red glowing fang pendant, damage boost trinket, fury accessory' },
];

const ATTACHMENTS: Asset[] = [
  { category: 'items/attachments', name: 'serrated-edge', prompt: 'jagged blade attachment, bleed enhancement, weapon mod' },
  { category: 'items/attachments', name: 'frost-rune', prompt: 'ice rune stone, freeze enchantment, cold damage mod' },
  { category: 'items/attachments', name: 'fire-gem', prompt: 'burning red gem, fire enchantment, heat damage mod' },
  { category: 'items/attachments', name: 'shock-coil', prompt: 'electric coil attachment, lightning damage, chain shock mod' },
  { category: 'items/attachments', name: 'blood-gem', prompt: 'dark crimson gem, lifesteal attachment, vampire mod' },
  { category: 'items/attachments', name: 'scope-lens', prompt: 'precision scope attachment, accuracy boost, ranged mod' },
  { category: 'items/attachments', name: 'prism-lens', prompt: 'light splitting lens, beam splitter mod, luminant attachment' },
  { category: 'items/attachments', name: 'shadow-wrap', prompt: 'dark cloth wrap, stealth enhancement, shadow mod' },
];

const SPELLS: Asset[] = [
  { category: 'items/spells', name: 'fireball-scroll', prompt: 'burning spell scroll, fire magic, flame burst spell icon' },
  { category: 'items/spells', name: 'ice-spike-scroll', prompt: 'frozen spell scroll, ice magic, frost spike spell icon' },
  { category: 'items/spells', name: 'lightning-bolt-scroll', prompt: 'electric spell scroll, shock magic, chain lightning icon' },
  { category: 'items/spells', name: 'heal-scroll', prompt: 'glowing green spell scroll, restoration magic, healing spell' },
  { category: 'items/spells', name: 'shadow-step-scroll', prompt: 'dark teleport scroll, shadow magic, blink spell' },
  { category: 'items/spells', name: 'lumenbrand-scroll', prompt: 'radiant marking scroll, light magic, target marking spell' },
  { category: 'items/spells', name: 'curse-scroll', prompt: 'dark purple curse scroll, debuff magic, weakness spell' },
  { category: 'items/spells', name: 'ward-scroll', prompt: 'protective barrier scroll, shield magic, defense spell' },
  { category: 'items/spells', name: 'summon-scroll', prompt: 'creature summoning scroll, conjuration magic, ally summon' },
  { category: 'items/spells', name: 'rage-scroll', prompt: 'red fury scroll, buff magic, attack boost spell' },
];

const TERRAIN: Asset[] = [
  // Gloam Markets
  { category: 'terrain/gloam-markets', name: 'cobblestone-floor', prompt: 'dark cobblestone street tiles, vampire city pavement, gothic marketplace floor, top-down game tile', removeBg: false },
  { category: 'terrain/gloam-markets', name: 'blood-fountain', prompt: 'ornate fountain with red liquid, vampire market centerpiece, gothic architecture, dark elegance' },
  { category: 'terrain/gloam-markets', name: 'market-stall', prompt: 'shadowy market booth, vampire trader stall, dark goods display, gothic tent' },
  { category: 'terrain/gloam-markets', name: 'gas-lamp', prompt: 'wrought iron street lamp, dim red glow, vampire city lighting, gothic lamp post' },
  // Moonwood Trails
  { category: 'terrain/moonwood-trails', name: 'forest-floor', prompt: 'wild forest ground with leaves and moss, moonlit forest tile, nature floor, top-down game tile', removeBg: false },
  { category: 'terrain/moonwood-trails', name: 'ancient-tree', prompt: 'massive gnarled tree, moonwood ancient oak, werewolf territory landmark, mystical forest tree' },
  { category: 'terrain/moonwood-trails', name: 'wolf-totem', prompt: 'tribal wolf totem pole, moonbound marker, werewolf territory, carved wooden pillar' },
  { category: 'terrain/moonwood-trails', name: 'moonstone', prompt: 'glowing moon rock, lunar crystal, werewolf power source, silvery glow' },
  // Lumen Bastion
  { category: 'terrain/lumen-bastion', name: 'light-tiles', prompt: 'glowing white floor tiles, luminant city pavement, radiant geometric floor, top-down game tile', removeBg: false },
  { category: 'terrain/lumen-bastion', name: 'crystal-spire', prompt: 'tall light crystal tower, luminant architecture, beacon of radiance, glowing structure' },
  { category: 'terrain/lumen-bastion', name: 'light-pillar', prompt: 'column of pure light, luminant city pillar, radiant support beam, holy architecture' },
  { category: 'terrain/lumen-bastion', name: 'prism-fountain', prompt: 'rainbow light fountain, luminant water feature, refracting crystal centerpiece' },
  // Stillwell Ark
  { category: 'terrain/stillwell-ark', name: 'ark-floor', prompt: 'pristine white metal floor, stillwell ark tile, sterile futuristic surface, top-down game tile', removeBg: false },
  { category: 'terrain/stillwell-ark', name: 'stasis-pod', prompt: 'human stasis chamber, stillwell prisoner pod, frozen person container, sci-fi coffin' },
  { category: 'terrain/stillwell-ark', name: 'control-console', prompt: 'glowing control panel, stillwell ark computer, light-tech interface' },
  { category: 'terrain/stillwell-ark', name: 'energy-conduit', prompt: 'pulsing energy pipe, stillwell power line, glowing conduit tube' },
  // Camp
  { category: 'terrain/camp', name: 'campfire', prompt: 'warm campfire with logs, safe haven fire, resting point, cozy flames' },
  { category: 'terrain/camp', name: 'tent', prompt: 'adventurer tent, camp shelter, waypoint rest area, travel tent' },
  { category: 'terrain/camp', name: 'supply-crate', prompt: 'wooden supply box, camp storage, adventure crate, provisions container' },
  { category: 'terrain/camp', name: 'vendor-cart', prompt: 'merchant wagon, traveling shop cart, mobile store, trade wagon' },
];

const DECOR: Asset[] = [
  // Rifts
  { category: 'decor/rifts', name: 'rift-portal', prompt: 'swirling magical rift tear in reality, unstable portal, broken space effect, dangerous anomaly' },
  { category: 'decor/rifts', name: 'rift-crystal', prompt: 'corrupted rift crystal, unstable magic shard, reality fragment, glowing anomaly' },
  { category: 'decor/rifts', name: 'exit-portal', prompt: 'stable exit portal, level completion gate, safe teleport circle, golden gateway' },
  // Vampire faction
  { category: 'decor/faction-vampire', name: 'coffin', prompt: 'ornate vampire coffin, gothic casket, sable court resting place, dark elegant' },
  { category: 'decor/faction-vampire', name: 'blood-vat', prompt: 'large blood storage container, vampire feeding tank, crimson vessel' },
  { category: 'decor/faction-vampire', name: 'mirror-frame', prompt: 'ornate empty mirror frame, vampire decor, reflectionless glass, gothic art' },
  { category: 'decor/faction-vampire', name: 'candelabra', prompt: 'tall candle holder with red candles, vampire lighting, gothic atmosphere' },
  // Werewolf faction
  { category: 'decor/faction-werewolf', name: 'bone-pile', prompt: 'pile of animal bones, werewolf territory marker, hunt trophies' },
  { category: 'decor/faction-werewolf', name: 'tribal-banner', prompt: 'werewolf clan banner, moonbound flag, wolf symbol tapestry' },
  { category: 'decor/faction-werewolf', name: 'spirit-shrine', prompt: 'nature spirit shrine, werewolf worship altar, forest sacred site' },
  { category: 'decor/faction-werewolf', name: 'hunting-rack', prompt: 'weapon rack with feral weapons, werewolf armory, tribal gear display' },
  // Luminant faction
  { category: 'decor/faction-luminant', name: 'light-brazier', prompt: 'glowing light brazier, luminant fire bowl, radiant eternal flame' },
  { category: 'decor/faction-luminant', name: 'scripture-stand', prompt: 'holy book display stand, luminant scripture pedestal, sacred text holder' },
  { category: 'decor/faction-luminant', name: 'purity-statue', prompt: 'luminant angel statue, light faction monument, radiant sculpture' },
  { category: 'decor/faction-luminant', name: 'ward-circle', prompt: 'protective magic circle on ground, luminant ward sigil, barrier rune' },
  // Props
  { category: 'decor/props', name: 'treasure-chest', prompt: 'wooden treasure chest with gold trim, loot container, reward box' },
  { category: 'decor/props', name: 'barrel', prompt: 'wooden storage barrel, breakable container, dungeon prop' },
  { category: 'decor/props', name: 'crate', prompt: 'wooden crate box, storage container, breakable object' },
  { category: 'decor/props', name: 'bookshelf', prompt: 'tall wooden bookshelf with books, library furniture, knowledge storage' },
  { category: 'decor/props', name: 'table', prompt: 'simple wooden table, furniture prop, interior decoration' },
  { category: 'decor/props', name: 'chair', prompt: 'wooden chair, simple furniture, seating prop' },
];

const UI_ICONS: Asset[] = [
  // Status effects
  { category: 'ui/icons', name: 'icon-burn', prompt: 'fire status effect icon, burning debuff symbol, flame damage indicator' },
  { category: 'ui/icons', name: 'icon-freeze', prompt: 'ice status effect icon, frozen debuff symbol, cold slow indicator' },
  { category: 'ui/icons', name: 'icon-shock', prompt: 'lightning status effect icon, electrified debuff symbol, shock indicator' },
  { category: 'ui/icons', name: 'icon-bleed', prompt: 'blood status effect icon, bleeding debuff symbol, wound indicator' },
  { category: 'ui/icons', name: 'icon-curse', prompt: 'dark curse status icon, weakened debuff symbol, hex indicator' },
  { category: 'ui/icons', name: 'icon-lumenbrand', prompt: 'light mark status icon, target debuff symbol, radiant marker' },
  // Stats
  { category: 'ui/icons', name: 'icon-attack', prompt: 'sword attack stat icon, ATK symbol, damage indicator' },
  { category: 'ui/icons', name: 'icon-defense', prompt: 'shield defense stat icon, DEF symbol, armor indicator' },
  { category: 'ui/icons', name: 'icon-magic', prompt: 'magic wand stat icon, MAG symbol, spell power indicator' },
  { category: 'ui/icons', name: 'icon-health', prompt: 'heart health stat icon, HP symbol, vitality indicator' },
  { category: 'ui/icons', name: 'icon-mana', prompt: 'blue crystal mana stat icon, MP symbol, magic points indicator' },
  { category: 'ui/icons', name: 'icon-speed', prompt: 'wing speed stat icon, AGI symbol, agility indicator' },
  // Currency
  { category: 'ui/icons', name: 'icon-gold', prompt: 'gold coin currency icon, money symbol, wealth indicator' },
  { category: 'ui/icons', name: 'icon-relic', prompt: 'rare relic currency icon, special token, premium currency' },
  { category: 'ui/icons', name: 'icon-faction-favor', prompt: 'faction favor currency icon, reputation token, alliance symbol' },
  // Factions
  { category: 'ui/icons', name: 'icon-vampire', prompt: 'vampire faction icon, sable court symbol, bat and moon emblem' },
  { category: 'ui/icons', name: 'icon-werewolf', prompt: 'werewolf faction icon, moonbound symbol, wolf and moon emblem' },
  { category: 'ui/icons', name: 'icon-luminant', prompt: 'luminant faction icon, lumen choir symbol, radiant sun emblem' },
];

const BACKGROUNDS: Asset[] = [
  { category: 'ui/backgrounds', name: 'menu-background', prompt: 'epic fantasy landscape, shattered crystal in sky, eclipse lighting, mystical world panorama, game title screen background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'gloam-markets-bg', prompt: 'gothic vampire city at night, dark marketplace, gas lamps and shadows, moody atmosphere, game level background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'moonwood-trails-bg', prompt: 'mystical moonlit forest, ancient trees, ethereal mist, werewolf territory, game level background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'lumen-bastion-bg', prompt: 'radiant crystal city, glowing white towers, pure light architecture, luminant territory, game level background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'stillwell-ark-bg', prompt: 'sterile white interior, frozen humans in pods, ominous perfection, final dungeon background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'camp-bg', prompt: 'cozy adventurer camp at twilight, campfire glow, tents and wagons, safe haven background', removeBg: false, size: 'landscape_16_9' },
  { category: 'ui/backgrounds', name: 'eclipse-bg', prompt: 'dramatic solar eclipse, magical energy, world-ending event, climax scene background', removeBg: false, size: 'landscape_16_9' },
];

const PORTRAITS: Asset[] = [
  { category: 'ui/portraits', name: 'portrait-astra', prompt: 'young female protagonist portrait, glowing crystal in chest, determined expression, JRPG character portrait, bust shot', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-rowan', prompt: 'older male knight portrait, scarred face, noble but worn, protector character, JRPG portrait, bust shot', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-mira', prompt: 'luminant woman portrait, glowing veins under skin, brilliant intense eyes, dangerous scholar, JRPG portrait', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-vesper', prompt: 'elegant vampire man portrait, pale skin, red eyes, aristocratic, mysterious contract holder, JRPG portrait', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-bran', prompt: 'werewolf scout portrait, wolf-like features, tribal markings, wild wisdom, JRPG portrait', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-archivist', prompt: 'masked mysterious figure portrait, ornate mask, cryptic presence, prophet character, JRPG portrait', size: 'portrait_4_3' },
  { category: 'ui/portraits', name: 'portrait-seraph-null', prompt: 'fallen luminant villain portrait, corrupted angelic features, tragic antagonist, JRPG villain portrait', size: 'portrait_4_3' },
];

const EFFECTS: Asset[] = [
  { category: 'ui/effects', name: 'effect-slash', prompt: 'sword slash effect, melee attack arc, white energy trail, action game effect' },
  { category: 'ui/effects', name: 'effect-fire-burst', prompt: 'fire explosion effect, flame burst, orange red magic, spell effect' },
  { category: 'ui/effects', name: 'effect-ice-shatter', prompt: 'ice crystal shatter effect, frozen break, blue white particles' },
  { category: 'ui/effects', name: 'effect-lightning-strike', prompt: 'lightning bolt strike effect, electric shock, yellow white energy' },
  { category: 'ui/effects', name: 'effect-heal', prompt: 'healing magic effect, green sparkles, restoration glow, buff visual' },
  { category: 'ui/effects', name: 'effect-shadow', prompt: 'shadow magic effect, dark wisps, void energy, vampire spell visual' },
  { category: 'ui/effects', name: 'effect-light-beam', prompt: 'light beam effect, radiant ray, luminant magic, holy spell visual' },
  { category: 'ui/effects', name: 'effect-blood', prompt: 'blood splash effect, crimson splatter, damage indicator, hit effect' },
  { category: 'ui/effects', name: 'effect-levelup', prompt: 'level up celebration effect, golden sparkles, achievement visual, power up glow' },
  { category: 'ui/effects', name: 'effect-critical', prompt: 'critical hit effect, impact burst, powerful strike visual, damage spike' },
];

// ============================================================================
// MAIN
// ============================================================================

type Category = 'all' | 'heroes' | 'npcs' | 'enemies' | 'bosses' | 'consumables' | 'weapons' |
  'trinkets' | 'attachments' | 'spells' | 'terrain' | 'decor' | 'ui' | 'backgrounds' | 'portraits' | 'effects';

async function generateCategory(style: 'pixel' | 'anime', category: Category): Promise<void> {
  const categories: Record<string, Asset[]> = {
    heroes: HEROES,
    npcs: NPCS,
    enemies: ENEMIES,
    bosses: BOSSES,
    consumables: CONSUMABLES,
    weapons: WEAPONS,
    trinkets: TRINKETS,
    attachments: ATTACHMENTS,
    spells: SPELLS,
    terrain: TERRAIN,
    decor: DECOR,
    ui: UI_ICONS,
    backgrounds: BACKGROUNDS,
    portraits: PORTRAITS,
    effects: EFFECTS,
  };

  if (category === 'all') {
    for (const [name, assets] of Object.entries(categories)) {
      console.log(`\n=== Generating ${name} (${style}) ===`);
      for (const asset of assets) {
        await generateAsset(style, asset);
      }
    }
  } else {
    const assets = categories[category];
    if (!assets) {
      console.error(`Unknown category: ${category}`);
      return;
    }
    console.log(`\n=== Generating ${category} (${style}) ===`);
    for (const asset of assets) {
      await generateAsset(style, asset);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let style: 'pixel' | 'anime' | 'all' = 'all';
  let category: Category = 'all';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--style' && args[i + 1]) {
      style = args[i + 1] as any;
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Eclipse of Lumen - Art Asset Generator

Usage: bun scripts/generate-art.ts [options] [category]

Options:
  --style STYLE    Generate only specified style (pixel, anime, or all)
  --help           Show this help message

Categories:
  all, heroes, npcs, enemies, bosses, consumables, weapons,
  trinkets, attachments, spells, terrain, decor, ui,
  backgrounds, portraits, effects

Examples:
  bun scripts/generate-art.ts                      # All assets, both styles
  bun scripts/generate-art.ts --style pixel        # All pixel assets
  bun scripts/generate-art.ts heroes               # Heroes in both styles
  bun scripts/generate-art.ts --style anime heroes # Anime heroes only
`);
      return;
    } else {
      category = args[i] as Category;
    }
  }

  console.log('Eclipse of Lumen - Art Asset Generator');
  console.log(`Style: ${style} | Category: ${category}`);
  console.log(`Output: ${ASSETS_DIR}\n`);

  const styles: ('pixel' | 'anime')[] = style === 'all' ? ['pixel', 'anime'] : [style as any];

  for (const s of styles) {
    await generateCategory(s, category);
  }

  console.log('\n✓ Art generation complete!');
}

main().catch(console.error);
