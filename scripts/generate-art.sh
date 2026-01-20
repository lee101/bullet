#!/bin/bash

# Eclipse of Lumen - Art Asset Generator
# Uses FAL AI FLUX.2 klein 9B for generation + BiRefNet for background removal

set -e

# Load API key
source ~/.secretbashrc
FAL_KEY="${FAL_API_KEY}"

if [ -z "$FAL_KEY" ]; then
    echo "Error: FAL_API_KEY not set in ~/.secretbashrc"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_DIR="$PROJECT_DIR/assets"
TEMP_DIR="$PROJECT_DIR/assets/.temp"

mkdir -p "$TEMP_DIR"

# Configuration
MAX_CONCURRENT=3
POLL_INTERVAL=2

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Submit image generation request to FAL
submit_generation() {
    local prompt="$1"
    local output_format="${2:-png}"
    local image_size="${3:-square}"

    local response=$(curl -s --request POST \
        --url "https://queue.fal.run/fal-ai/flux-2-klein/9b/base/lora" \
        --header "Authorization: Key $FAL_KEY" \
        --header "Content-Type: application/json" \
        --data "{
            \"prompt\": \"$prompt\",
            \"guidance_scale\": 5,
            \"num_inference_steps\": 28,
            \"image_size\": \"$image_size\",
            \"num_images\": 1,
            \"acceleration\": \"regular\",
            \"enable_safety_checker\": false,
            \"output_format\": \"$output_format\"
        }")

    echo "$response" | grep -o '"request_id": *"[^"]*"' | sed 's/"request_id": *//; s/"//g'
}

# Poll for completion and get result
wait_for_result() {
    local request_id="$1"
    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local status_response=$(curl -s --request GET \
            --url "https://queue.fal.run/fal-ai/flux-2-klein/requests/$request_id/status" \
            --header "Authorization: Key $FAL_KEY")

        local status=$(echo "$status_response" | grep -o '"status": *"[^"]*"' | head -1 | sed 's/"status": *//; s/"//g')

        if [ "$status" = "COMPLETED" ]; then
            # Get the result
            local result=$(curl -s --request GET \
                --url "https://queue.fal.run/fal-ai/flux-2-klein/requests/$request_id" \
                --header "Authorization: Key $FAL_KEY")
            echo "$result"
            return 0
        elif [ "$status" = "FAILED" ]; then
            log_error "Request $request_id failed"
            return 1
        fi

        sleep $POLL_INTERVAL
        ((attempt++))
    done

    log_error "Request $request_id timed out"
    return 1
}

# Download image from URL
download_image() {
    local url="$1"
    local output_path="$2"

    curl -s -L -o "$output_path" "$url"
}

# Remove background using BiRefNet via FAL
# Uses direct URL approach (much faster than base64)
remove_background() {
    local source_url="$1"
    local output_path="$2"

    local response=$(curl -s --request POST \
        --url "https://queue.fal.run/fal-ai/birefnet" \
        --header "Authorization: Key $FAL_KEY" \
        --header "Content-Type: application/json" \
        --data "{
            \"image_url\": \"$source_url\",
            \"model\": \"General Use (Light)\"
        }")

    local request_id=$(echo "$response" | grep -o '"request_id": *"[^"]*"' | sed 's/"request_id": *//; s/"//g')

    if [ -z "$request_id" ]; then
        log_warn "BiRefNet submission failed, downloading original"
        curl -s -L -o "$output_path" "$source_url"
        return
    fi

    # Wait for BiRefNet result
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local status_response=$(curl -s --request GET \
            --url "https://queue.fal.run/fal-ai/birefnet/requests/$request_id/status" \
            --header "Authorization: Key $FAL_KEY")

        local status=$(echo "$status_response" | grep -o '"status": *"[^"]*"' | head -1 | sed 's/"status": *//; s/"//g')

        if [ "$status" = "COMPLETED" ]; then
            local result=$(curl -s --request GET \
                --url "https://queue.fal.run/fal-ai/birefnet/requests/$request_id" \
                --header "Authorization: Key $FAL_KEY")

            local image_url=$(echo "$result" | grep -o '"url": *"[^"]*"' | head -1 | sed 's/"url": *//; s/"//g')

            if [ -n "$image_url" ]; then
                curl -s -L -o "$output_path" "$image_url"
                return 0
            fi
        elif [ "$status" = "FAILED" ]; then
            log_warn "BiRefNet failed, downloading original"
            curl -s -L -o "$output_path" "$source_url"
            return
        fi

        sleep 1
        ((attempt++))
    done

    log_warn "BiRefNet timed out, downloading original"
    curl -s -L -o "$output_path" "$source_url"
}

# Convert to WebP with 85% quality using bun + sharp
convert_to_webp() {
    local input_path="$1"
    local output_path="$2"

    # Use bun with sharp (installed in project)
    if command -v bun &> /dev/null; then
        bun "$SCRIPT_DIR/convert-to-webp.js" "$input_path" "$output_path" 2>/dev/null
        return $?
    elif command -v cwebp &> /dev/null; then
        cwebp -q 85 "$input_path" -o "$output_path" 2>/dev/null
    else
        log_warn "No WebP converter found, keeping PNG"
        cp "$input_path" "${output_path%.webp}.png"
        return 1
    fi
}

# Generate a single asset
generate_asset() {
    local category="$1"
    local name="$2"
    local prompt="$3"
    local style="$4"  # pixel or anime
    local remove_bg="${5:-true}"
    local size="${6:-square}"

    local output_dir="$ASSETS_DIR/$style/$category"
    local final_path="$output_dir/${name}.webp"

    # Skip if already exists
    if [ -f "$final_path" ]; then
        log_info "Skipping $style/$category/$name (exists)"
        return 0
    fi

    mkdir -p "$output_dir"

    log_info "Generating: $style/$category/$name"

    # Add style prefix to prompt
    local full_prompt
    if [ "$style" = "pixel" ]; then
        full_prompt="pixel art style, 16-bit retro game sprite, crisp pixels, $prompt, game asset, transparent background, centered"
    else
        full_prompt="anime art style, high quality illustration, vibrant colors, detailed, $prompt, game character art, full body portrait"
    fi

    # Submit generation
    local request_id=$(submit_generation "$full_prompt" "png" "$size")

    if [ -z "$request_id" ]; then
        log_error "Failed to submit generation for $name"
        return 1
    fi

    log_info "Request ID: $request_id"

    # Wait for result
    local result=$(wait_for_result "$request_id")

    if [ -z "$result" ]; then
        log_error "Failed to get result for $name"
        return 1
    fi

    # Extract image URL
    local image_url=$(echo "$result" | grep -o '"url": *"[^"]*"' | head -1 | sed 's/"url": *//; s/"//g')

    if [ -z "$image_url" ]; then
        log_error "No image URL in result for $name"
        return 1
    fi

    # Process image
    local temp_processed="$TEMP_DIR/${name}_processed.png"

    # Remove background if requested (using direct URL)
    if [ "$remove_bg" = "true" ]; then
        log_info "Removing background for $name"
        remove_background "$image_url" "$temp_processed"
    else
        download_image "$image_url" "$temp_processed"
    fi

    # Convert to WebP
    convert_to_webp "$temp_processed" "$final_path"

    # Cleanup temp files
    rm -f "$temp_processed"

    log_success "Generated: $final_path"
}

# Generate all assets in a category
generate_category() {
    local style="$1"
    local category="$2"
    shift 2

    # Remaining args are name:prompt pairs
    while [ $# -gt 0 ]; do
        local name="$1"
        local prompt="$2"
        local remove_bg="${3:-true}"
        local size="${4:-square}"
        shift 4 2>/dev/null || shift $#

        generate_asset "$category" "$name" "$prompt" "$style" "$remove_bg" "$size"
    done
}

# ============================================================================
# ASSET DEFINITIONS - All game assets organized by category
# ============================================================================

generate_heroes() {
    local style="$1"

    log_info "=== Generating Heroes ($style) ==="

    # 8 Main Heroes
    generate_asset "characters/heroes" "rune-sellsword" \
        "male mercenary warrior with glowing rune sword, leather armor with magical runes, balanced fighter, confident pose, fantasy RPG character" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "glass-arcanist" \
        "female mage with crystalline staff, flowing robes made of magical glass shards, prism effects around her, fragile elegant appearance, arcane scholar" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "thorn-ranger" \
        "hooded ranger with vine-wrapped bow, leaf and thorn motif armor, nature magic user, trap specialist, green and brown palette" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "grave-cantor" \
        "mysterious priest with death magic tome, dark robes with silver trim, healing and curse specialist, skull motifs, ethereal wisps" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "storm-pugilist" \
        "muscular brawler with lightning-wrapped fists, minimal armor, electrified hair, martial artist stance, crackling energy" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "bulwark-saint" \
        "heavy armored paladin with massive tower shield, glowing ward symbols, divine protection aura, fortress-like presence" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "night-courier" \
        "stealthy assassin in dark cloak, twin daggers, shadow magic wisps, masked face, agile pose, rogue character" \
        "$style" "true" "square"

    generate_asset "characters/heroes" "beast-warden" \
        "druid warrior with beast companion spirit, feral appearance, bone and fur armor, nature summoner, wild magic" \
        "$style" "true" "square"
}

generate_npcs() {
    local style="$1"

    log_info "=== Generating NPCs ($style) ==="

    # Main cast NPCs
    generate_asset "characters/npcs" "astra-vale" \
        "young female courier with glowing crystal shard embedded in chest, practical traveling clothes, protagonist hero, determined expression, magical light emanating" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "sir-rowan-kest" \
        "disgraced older knight in worn but noble armor, protective stance, scarred face, loyal guardian, fallen from grace" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "mira-glass" \
        "luminant arcanist woman with glowing veins of light under skin, brilliant dangerous scholar, crystalline accessories, radiant but unstable" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "vesper-vaine" \
        "elegant vampire diplomat in formal dark attire, mysterious contract scroll, pale skin, red eyes, aristocratic bearing" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "bran-moonmark" \
        "werewolf scout in tribal leather armor, wolf features, moon tattoos, wild but wise appearance, forest guardian" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "the-archivist" \
        "masked luminant historian in ornate robes, carrying ancient tomes, cryptic presence, prophecy speaker, mysterious scholarly figure" \
        "$style" "true" "square"

    # Faction vendors
    generate_asset "characters/npcs" "vampire-broker" \
        "sinister vampire merchant in fine clothes, blood vials and contracts, shrewd businessman, sable court trader" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "werewolf-smith" \
        "burly werewolf blacksmith with forge hammer, muscular half-transformed, tribal markings, moonbound craftsman" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "luminant-archivist" \
        "glowing luminant shopkeeper with floating spell books, radiant robes, magical artifacts vendor, lumen choir merchant" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "camp-item-vendor" \
        "friendly traveling merchant with pack mule, potions and supplies, helpful smile, waypoint trader" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "camp-weapon-vendor" \
        "grizzled arms dealer with weapon rack, scarred veteran, practical armor, weapons specialist" \
        "$style" "true" "square"

    generate_asset "characters/npcs" "camp-magic-vendor" \
        "eccentric spell merchant with floating magical items, robes covered in arcane symbols, mysterious dealer" \
        "$style" "true" "square"
}

generate_enemies() {
    local style="$1"

    log_info "=== Generating Enemies ($style) ==="

    # Rift creatures
    generate_asset "characters/enemies" "rift-spawn" \
        "twisted creature made of broken light and shadow, unstable magical entity, rift monster, corrupted energy being" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "rift-stalker" \
        "fast predatory rift creature, elongated limbs, hunting pose, glowing fractures, ambush monster" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "void-weaver" \
        "floating rift mage creature, reality-warping effects, eldritch appearance, spell caster enemy" \
        "$style" "true" "square"

    # Vampire faction enemies
    generate_asset "characters/enemies" "vampire-thrall" \
        "mindless vampire servant, pale gaunt appearance, red eyes, basic undead minion, sable court soldier" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "shadow-knight" \
        "vampire warrior in dark plate armor, shadow weapons, elite sable court guard, menacing presence" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "blood-mage" \
        "vampire sorcerer with blood magic, crimson spell effects, dark robes, hemomancy caster" \
        "$style" "true" "square"

    # Werewolf faction enemies
    generate_asset "characters/enemies" "feral-wolf" \
        "aggressive wild wolf with glowing eyes, pack hunter, moonbound beast, snarling attack pose" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "rage-berserker" \
        "frenzied werewolf warrior in partial transformation, tribal paint, uncontrolled fury, moonbound fighter" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "pack-shaman" \
        "werewolf magic user with totems and bones, nature magic, tribal leader, moonbound spellcaster" \
        "$style" "true" "square"

    # Luminant faction enemies
    generate_asset "characters/enemies" "light-sentinel" \
        "robotic luminant guardian, geometric light armor, patrol unit, lumen choir enforcer" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "purifier" \
        "zealot luminant soldier with light weapons, fanatical expression, purity enforcer, lumen choir militant" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "prism-mage" \
        "luminant spellcaster with refracted light magic, floating prism crystals, overcharged dangerous aura" \
        "$style" "true" "square"

    # Generic enemies
    generate_asset "characters/enemies" "bandit-thug" \
        "common bandit with crude weapon, ragged clothes, basic human enemy, lawless rogue" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "bandit-archer" \
        "ranged bandit with bow, hooded figure, ambush tactics, common enemy" \
        "$style" "true" "square"

    generate_asset "characters/enemies" "corrupted-soldier" \
        "rift-touched soldier in damaged armor, glowing corruption, once-human enemy, tragic figure" \
        "$style" "true" "square"
}

generate_bosses() {
    local style="$1"

    log_info "=== Generating Bosses ($style) ==="

    generate_asset "characters/bosses" "the-choirless" \
        "horrific mage fused with broken light, tutorial boss, screaming faces in light, corrupted luminant abomination" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "mirror-duke" \
        "elegant vampire lord with mirror-like armor, sable court leader, aristocratic terrifying presence, reflection magic" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "the-white-stag" \
        "massive ethereal stag spirit, moonbound guardian, antlers of pure moonlight, majestic and deadly, forest deity" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "prism-sentinel" \
        "colossal luminant construct of pure light crystals, geometric guardian, lumen choir ancient defender" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "the-fixed-choir" \
        "chorus of stilled heroes turned to light statues, frozen smiles, horrific beauty, collective boss entity" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "seraph-null-phase1" \
        "fallen luminant in corrupted angelic armor, weaponized pure light, final boss first form, tragic villain" \
        "$style" "true" "square"

    generate_asset "characters/bosses" "seraph-null-phase2" \
        "massive winged prism entity, the stillwell seraph, reality-warping final boss, angelic cosmic horror, ultimate form" \
        "$style" "true" "square"
}

generate_consumables() {
    local style="$1"

    log_info "=== Generating Consumables ($style) ==="

    # Potions
    generate_asset "items/consumables" "health-potion" \
        "red healing potion in glass vial, glowing liquid, HP restore item, fantasy RPG potion" \
        "$style" "true" "square"

    generate_asset "items/consumables" "mana-potion" \
        "blue mana potion in crystal flask, swirling magical liquid, MP restore item" \
        "$style" "true" "square"

    generate_asset "items/consumables" "stamina-potion" \
        "green stamina potion, energizing elixir, buff item, glowing emerald liquid" \
        "$style" "true" "square"

    generate_asset "items/consumables" "antidote" \
        "purple antidote vial, cure poison item, medical remedy, clear bubbling liquid" \
        "$style" "true" "square"

    generate_asset "items/consumables" "revive-kit" \
        "golden resurrection item, phoenix feather with bandages, revival consumable" \
        "$style" "true" "square"

    # Bombs
    generate_asset "items/consumables" "fire-bomb" \
        "round bomb with flame symbol, explosive throwable, fire damage item" \
        "$style" "true" "square"

    generate_asset "items/consumables" "ice-bomb" \
        "frost grenade with icicle designs, freeze bomb, cold damage throwable" \
        "$style" "true" "square"

    generate_asset "items/consumables" "shock-bomb" \
        "lightning bomb with electric sparks, chain damage throwable, shock grenade" \
        "$style" "true" "square"

    generate_asset "items/consumables" "smoke-bomb" \
        "black smoke bomb, stealth item, escape tool, ninja throwable" \
        "$style" "true" "square"

    # Traps
    generate_asset "items/consumables" "spike-trap" \
        "mechanical spike trap, deployable hazard, damage trap item" \
        "$style" "true" "square"

    generate_asset "items/consumables" "frost-trap" \
        "ice crystal trap, freeze snare, slow trap deployable" \
        "$style" "true" "square"

    generate_asset "items/consumables" "alarm-trap" \
        "magical alarm device, detection trap, alert mechanism" \
        "$style" "true" "square"
}

generate_weapons() {
    local style="$1"

    log_info "=== Generating Weapons ($style) ==="

    # Melee weapons
    generate_asset "items/weapons" "iron-sword" \
        "basic iron longsword, starter weapon, simple blade, RPG sword" \
        "$style" "true" "square"

    generate_asset "items/weapons" "rune-blade" \
        "magical sword with glowing runes, enchanted weapon, blue magical glow" \
        "$style" "true" "square"

    generate_asset "items/weapons" "shadow-katana" \
        "dark curved blade with shadow wisps, vampire faction weapon, elegant deadly" \
        "$style" "true" "square"

    generate_asset "items/weapons" "fang-axe" \
        "brutal axe with beast fangs, werewolf faction weapon, savage design" \
        "$style" "true" "square"

    generate_asset "items/weapons" "prism-sword" \
        "crystalline blade refracting light, luminant faction weapon, pure light weapon" \
        "$style" "true" "square"

    # Ranged weapons
    generate_asset "items/weapons" "hunting-bow" \
        "wooden hunting bow, basic ranged weapon, simple design" \
        "$style" "true" "square"

    generate_asset "items/weapons" "thorn-bow" \
        "living bow wrapped in thorny vines, nature magic weapon, green organic design" \
        "$style" "true" "square"

    generate_asset "items/weapons" "crossbow" \
        "mechanical crossbow, precision ranged weapon, metal and wood" \
        "$style" "true" "square"

    generate_asset "items/weapons" "light-repeater" \
        "magical firearm shooting light projectiles, luminant weapon, energy gun" \
        "$style" "true" "square"

    # Magic weapons
    generate_asset "items/weapons" "oak-staff" \
        "wooden magic staff, basic arcane focus, nature wood design" \
        "$style" "true" "square"

    generate_asset "items/weapons" "crystal-focus" \
        "floating crystal arcane focus, powerful magic catalyst, glowing gem" \
        "$style" "true" "square"

    generate_asset "items/weapons" "blood-tome" \
        "dark book dripping blood, vampire magic weapon, forbidden knowledge" \
        "$style" "true" "square"

    generate_asset "items/weapons" "moon-orb" \
        "glowing moon sphere, werewolf magic focus, lunar power" \
        "$style" "true" "square"

    generate_asset "items/weapons" "lumen-codex" \
        "shining holy book, luminant magic weapon, radiant scripture" \
        "$style" "true" "square"
}

generate_trinkets() {
    local style="$1"

    log_info "=== Generating Trinkets ($style) ==="

    generate_asset "items/trinkets" "frost-pendant" \
        "icy blue pendant necklace, cold magic trinket, frozen crystal jewelry" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "vampiric-ring" \
        "dark red ring with blood gem, lifesteal trinket, sable court accessory" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "wolf-fang-necklace" \
        "necklace of wolf fangs, werewolf trinket, tribal accessory, pack bond item" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "prism-brooch" \
        "light-refracting brooch, luminant trinket, rainbow crystal pin" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "lucky-coin" \
        "golden lucky coin with star, luck boost trinket, fortune item" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "speed-boots-charm" \
        "winged boot charm, agility trinket, swift movement accessory" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "mana-crystal" \
        "blue glowing crystal, MP regen trinket, magic enhancement gem" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "protection-amulet" \
        "golden shield amulet, defense trinket, ward protection charm" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "crit-lens" \
        "magnifying lens trinket, critical hit chance, precision monocle" \
        "$style" "true" "square"

    generate_asset "items/trinkets" "rage-fang" \
        "red glowing fang pendant, damage boost trinket, fury accessory" \
        "$style" "true" "square"
}

generate_attachments() {
    local style="$1"

    log_info "=== Generating Attachments ($style) ==="

    generate_asset "items/attachments" "serrated-edge" \
        "jagged blade attachment, bleed enhancement, weapon mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "frost-rune" \
        "ice rune stone, freeze enchantment, cold damage mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "fire-gem" \
        "burning red gem, fire enchantment, heat damage mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "shock-coil" \
        "electric coil attachment, lightning damage, chain shock mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "blood-gem" \
        "dark crimson gem, lifesteal attachment, vampire mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "scope-lens" \
        "precision scope attachment, accuracy boost, ranged mod" \
        "$style" "true" "square"

    generate_asset "items/attachments" "prism-lens" \
        "light splitting lens, beam splitter mod, luminant attachment" \
        "$style" "true" "square"

    generate_asset "items/attachments" "shadow-wrap" \
        "dark cloth wrap, stealth enhancement, shadow mod" \
        "$style" "true" "square"
}

generate_spells() {
    local style="$1"

    log_info "=== Generating Spells ($style) ==="

    generate_asset "items/spells" "fireball-scroll" \
        "burning spell scroll, fire magic, flame burst spell icon" \
        "$style" "true" "square"

    generate_asset "items/spells" "ice-spike-scroll" \
        "frozen spell scroll, ice magic, frost spike spell icon" \
        "$style" "true" "square"

    generate_asset "items/spells" "lightning-bolt-scroll" \
        "electric spell scroll, shock magic, chain lightning icon" \
        "$style" "true" "square"

    generate_asset "items/spells" "heal-scroll" \
        "glowing green spell scroll, restoration magic, healing spell" \
        "$style" "true" "square"

    generate_asset "items/spells" "shadow-step-scroll" \
        "dark teleport scroll, shadow magic, blink spell" \
        "$style" "true" "square"

    generate_asset "items/spells" "lumenbrand-scroll" \
        "radiant marking scroll, light magic, target marking spell" \
        "$style" "true" "square"

    generate_asset "items/spells" "curse-scroll" \
        "dark purple curse scroll, debuff magic, weakness spell" \
        "$style" "true" "square"

    generate_asset "items/spells" "ward-scroll" \
        "protective barrier scroll, shield magic, defense spell" \
        "$style" "true" "square"

    generate_asset "items/spells" "summon-scroll" \
        "creature summoning scroll, conjuration magic, ally summon" \
        "$style" "true" "square"

    generate_asset "items/spells" "rage-scroll" \
        "red fury scroll, buff magic, attack boost spell" \
        "$style" "true" "square"
}

generate_terrain() {
    local style="$1"

    log_info "=== Generating Terrain ($style) ==="

    # Gloam Markets (Vampire territory)
    generate_asset "terrain/gloam-markets" "cobblestone-floor" \
        "dark cobblestone street tiles, vampire city pavement, gothic marketplace floor, top-down game tile" \
        "$style" "false" "square"

    generate_asset "terrain/gloam-markets" "blood-fountain" \
        "ornate fountain with red liquid, vampire market centerpiece, gothic architecture, dark elegance" \
        "$style" "true" "square"

    generate_asset "terrain/gloam-markets" "market-stall" \
        "shadowy market booth, vampire trader stall, dark goods display, gothic tent" \
        "$style" "true" "square"

    generate_asset "terrain/gloam-markets" "gas-lamp" \
        "wrought iron street lamp, dim red glow, vampire city lighting, gothic lamp post" \
        "$style" "true" "square"

    # Moonwood Trails (Werewolf territory)
    generate_asset "terrain/moonwood-trails" "forest-floor" \
        "wild forest ground with leaves and moss, moonlit forest tile, nature floor, top-down game tile" \
        "$style" "false" "square"

    generate_asset "terrain/moonwood-trails" "ancient-tree" \
        "massive gnarled tree, moonwood ancient oak, werewolf territory landmark, mystical forest tree" \
        "$style" "true" "square"

    generate_asset "terrain/moonwood-trails" "wolf-totem" \
        "tribal wolf totem pole, moonbound marker, werewolf territory, carved wooden pillar" \
        "$style" "true" "square"

    generate_asset "terrain/moonwood-trails" "moonstone" \
        "glowing moon rock, lunar crystal, werewolf power source, silvery glow" \
        "$style" "true" "square"

    # Lumen Bastion (Luminant territory)
    generate_asset "terrain/lumen-bastion" "light-tiles" \
        "glowing white floor tiles, luminant city pavement, radiant geometric floor, top-down game tile" \
        "$style" "false" "square"

    generate_asset "terrain/lumen-bastion" "crystal-spire" \
        "tall light crystal tower, luminant architecture, beacon of radiance, glowing structure" \
        "$style" "true" "square"

    generate_asset "terrain/lumen-bastion" "light-pillar" \
        "column of pure light, luminant city pillar, radiant support beam, holy architecture" \
        "$style" "true" "square"

    generate_asset "terrain/lumen-bastion" "prism-fountain" \
        "rainbow light fountain, luminant water feature, refracting crystal centerpiece" \
        "$style" "true" "square"

    # Stillwell Ark (Final dungeon)
    generate_asset "terrain/stillwell-ark" "ark-floor" \
        "pristine white metal floor, stillwell ark tile, sterile futuristic surface, top-down game tile" \
        "$style" "false" "square"

    generate_asset "terrain/stillwell-ark" "stasis-pod" \
        "human stasis chamber, stillwell prisoner pod, frozen person container, sci-fi coffin" \
        "$style" "true" "square"

    generate_asset "terrain/stillwell-ark" "control-console" \
        "glowing control panel, stillwell ark computer, light-tech interface" \
        "$style" "true" "square"

    generate_asset "terrain/stillwell-ark" "energy-conduit" \
        "pulsing energy pipe, stillwell power line, glowing conduit tube" \
        "$style" "true" "square"

    # Camp
    generate_asset "terrain/camp" "campfire" \
        "warm campfire with logs, safe haven fire, resting point, cozy flames" \
        "$style" "true" "square"

    generate_asset "terrain/camp" "tent" \
        "adventurer tent, camp shelter, waypoint rest area, travel tent" \
        "$style" "true" "square"

    generate_asset "terrain/camp" "supply-crate" \
        "wooden supply box, camp storage, adventure crate, provisions container" \
        "$style" "true" "square"

    generate_asset "terrain/camp" "vendor-cart" \
        "merchant wagon, traveling shop cart, mobile store, trade wagon" \
        "$style" "true" "square"
}

generate_decor() {
    local style="$1"

    log_info "=== Generating Decor ($style) ==="

    # Rift decorations
    generate_asset "decor/rifts" "rift-portal" \
        "swirling magical rift tear in reality, unstable portal, broken space effect, dangerous anomaly" \
        "$style" "true" "square"

    generate_asset "decor/rifts" "rift-crystal" \
        "corrupted rift crystal, unstable magic shard, reality fragment, glowing anomaly" \
        "$style" "true" "square"

    generate_asset "decor/rifts" "exit-portal" \
        "stable exit portal, level completion gate, safe teleport circle, golden gateway" \
        "$style" "true" "square"

    # Vampire faction decor
    generate_asset "decor/faction-vampire" "coffin" \
        "ornate vampire coffin, gothic casket, sable court resting place, dark elegant" \
        "$style" "true" "square"

    generate_asset "decor/faction-vampire" "blood-vat" \
        "large blood storage container, vampire feeding tank, crimson vessel" \
        "$style" "true" "square"

    generate_asset "decor/faction-vampire" "mirror-frame" \
        "ornate empty mirror frame, vampire decor, reflectionless glass, gothic art" \
        "$style" "true" "square"

    generate_asset "decor/faction-vampire" "candelabra" \
        "tall candle holder with red candles, vampire lighting, gothic atmosphere" \
        "$style" "true" "square"

    # Werewolf faction decor
    generate_asset "decor/faction-werewolf" "bone-pile" \
        "pile of animal bones, werewolf territory marker, hunt trophies" \
        "$style" "true" "square"

    generate_asset "decor/faction-werewolf" "tribal-banner" \
        "werewolf clan banner, moonbound flag, wolf symbol tapestry" \
        "$style" "true" "square"

    generate_asset "decor/faction-werewolf" "spirit-shrine" \
        "nature spirit shrine, werewolf worship altar, forest sacred site" \
        "$style" "true" "square"

    generate_asset "decor/faction-werewolf" "hunting-rack" \
        "weapon rack with feral weapons, werewolf armory, tribal gear display" \
        "$style" "true" "square"

    # Luminant faction decor
    generate_asset "decor/faction-luminant" "light-brazier" \
        "glowing light brazier, luminant fire bowl, radiant eternal flame" \
        "$style" "true" "square"

    generate_asset "decor/faction-luminant" "scripture-stand" \
        "holy book display stand, luminant scripture pedestal, sacred text holder" \
        "$style" "true" "square"

    generate_asset "decor/faction-luminant" "purity-statue" \
        "luminant angel statue, light faction monument, radiant sculpture" \
        "$style" "true" "square"

    generate_asset "decor/faction-luminant" "ward-circle" \
        "protective magic circle on ground, luminant ward sigil, barrier rune" \
        "$style" "true" "square"

    # General props
    generate_asset "decor/props" "treasure-chest" \
        "wooden treasure chest with gold trim, loot container, reward box" \
        "$style" "true" "square"

    generate_asset "decor/props" "barrel" \
        "wooden storage barrel, breakable container, dungeon prop" \
        "$style" "true" "square"

    generate_asset "decor/props" "crate" \
        "wooden crate box, storage container, breakable object" \
        "$style" "true" "square"

    generate_asset "decor/props" "bookshelf" \
        "tall wooden bookshelf with books, library furniture, knowledge storage" \
        "$style" "true" "square"

    generate_asset "decor/props" "table" \
        "simple wooden table, furniture prop, interior decoration" \
        "$style" "true" "square"

    generate_asset "decor/props" "chair" \
        "wooden chair, simple furniture, seating prop" \
        "$style" "true" "square"
}

generate_ui() {
    local style="$1"

    log_info "=== Generating UI Elements ($style) ==="

    # Status effect icons
    generate_asset "ui/icons" "icon-burn" \
        "fire status effect icon, burning debuff symbol, flame damage indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-freeze" \
        "ice status effect icon, frozen debuff symbol, cold slow indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-shock" \
        "lightning status effect icon, electrified debuff symbol, shock indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-bleed" \
        "blood status effect icon, bleeding debuff symbol, wound indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-curse" \
        "dark curse status icon, weakened debuff symbol, hex indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-lumenbrand" \
        "light mark status icon, target debuff symbol, radiant marker" \
        "$style" "true" "square"

    # Stat icons
    generate_asset "ui/icons" "icon-attack" \
        "sword attack stat icon, ATK symbol, damage indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-defense" \
        "shield defense stat icon, DEF symbol, armor indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-magic" \
        "magic wand stat icon, MAG symbol, spell power indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-health" \
        "heart health stat icon, HP symbol, vitality indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-mana" \
        "blue crystal mana stat icon, MP symbol, magic points indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-speed" \
        "wing speed stat icon, AGI symbol, agility indicator" \
        "$style" "true" "square"

    # Currency icons
    generate_asset "ui/icons" "icon-gold" \
        "gold coin currency icon, money symbol, wealth indicator" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-relic" \
        "rare relic currency icon, special token, premium currency" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-faction-favor" \
        "faction favor currency icon, reputation token, alliance symbol" \
        "$style" "true" "square"

    # Faction icons
    generate_asset "ui/icons" "icon-vampire" \
        "vampire faction icon, sable court symbol, bat and moon emblem" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-werewolf" \
        "werewolf faction icon, moonbound symbol, wolf and moon emblem" \
        "$style" "true" "square"

    generate_asset "ui/icons" "icon-luminant" \
        "luminant faction icon, lumen choir symbol, radiant sun emblem" \
        "$style" "true" "square"
}

generate_backgrounds() {
    local style="$1"

    log_info "=== Generating Backgrounds ($style) ==="

    # Full screen backgrounds (no bg removal, landscape size)
    generate_asset "ui/backgrounds" "menu-background" \
        "epic fantasy landscape, shattered crystal in sky, eclipse lighting, mystical world panorama, game title screen background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "gloam-markets-bg" \
        "gothic vampire city at night, dark marketplace, gas lamps and shadows, moody atmosphere, game level background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "moonwood-trails-bg" \
        "mystical moonlit forest, ancient trees, ethereal mist, werewolf territory, game level background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "lumen-bastion-bg" \
        "radiant crystal city, glowing white towers, pure light architecture, luminant territory, game level background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "stillwell-ark-bg" \
        "sterile white interior, frozen humans in pods, ominous perfection, final dungeon background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "camp-bg" \
        "cozy adventurer camp at twilight, campfire glow, tents and wagons, safe haven background" \
        "$style" "false" "landscape_16_9"

    generate_asset "ui/backgrounds" "eclipse-bg" \
        "dramatic solar eclipse, magical energy, world-ending event, climax scene background" \
        "$style" "false" "landscape_16_9"
}

generate_portraits() {
    local style="$1"

    log_info "=== Generating Portraits ($style) ==="

    # Character portraits for dialogue (portrait aspect ratio)
    generate_asset "ui/portraits" "portrait-astra" \
        "young female protagonist portrait, glowing crystal in chest, determined expression, JRPG character portrait, bust shot" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-rowan" \
        "older male knight portrait, scarred face, noble but worn, protector character, JRPG portrait, bust shot" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-mira" \
        "luminant woman portrait, glowing veins under skin, brilliant intense eyes, dangerous scholar, JRPG portrait" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-vesper" \
        "elegant vampire man portrait, pale skin, red eyes, aristocratic, mysterious contract holder, JRPG portrait" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-bran" \
        "werewolf scout portrait, wolf-like features, tribal markings, wild wisdom, JRPG portrait" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-archivist" \
        "masked mysterious figure portrait, ornate mask, cryptic presence, prophet character, JRPG portrait" \
        "$style" "true" "portrait_4_3"

    generate_asset "ui/portraits" "portrait-seraph-null" \
        "fallen luminant villain portrait, corrupted angelic features, tragic antagonist, JRPG villain portrait" \
        "$style" "true" "portrait_4_3"
}

generate_effects() {
    local style="$1"

    log_info "=== Generating Effects ($style) ==="

    generate_asset "ui/effects" "effect-slash" \
        "sword slash effect, melee attack arc, white energy trail, action game effect" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-fire-burst" \
        "fire explosion effect, flame burst, orange red magic, spell effect" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-ice-shatter" \
        "ice crystal shatter effect, frozen break, blue white particles" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-lightning-strike" \
        "lightning bolt strike effect, electric shock, yellow white energy" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-heal" \
        "healing magic effect, green sparkles, restoration glow, buff visual" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-shadow" \
        "shadow magic effect, dark wisps, void energy, vampire spell visual" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-light-beam" \
        "light beam effect, radiant ray, luminant magic, holy spell visual" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-blood" \
        "blood splash effect, crimson splatter, damage indicator, hit effect" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-levelup" \
        "level up celebration effect, golden sparkles, achievement visual, power up glow" \
        "$style" "true" "square"

    generate_asset "ui/effects" "effect-critical" \
        "critical hit effect, impact burst, powerful strike visual, damage spike" \
        "$style" "true" "square"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

show_help() {
    echo "Eclipse of Lumen - Art Asset Generator"
    echo ""
    echo "Usage: $0 [options] [category]"
    echo ""
    echo "Options:"
    echo "  --style STYLE    Generate only specified style (pixel or anime)"
    echo "  --help           Show this help message"
    echo ""
    echo "Categories:"
    echo "  all              Generate all assets (default)"
    echo "  heroes           Generate hero characters"
    echo "  npcs             Generate NPC characters"
    echo "  enemies          Generate enemy characters"
    echo "  bosses           Generate boss characters"
    echo "  consumables      Generate consumable items"
    echo "  weapons          Generate weapons"
    echo "  trinkets         Generate trinkets"
    echo "  attachments      Generate weapon attachments"
    echo "  spells           Generate spells"
    echo "  terrain          Generate terrain tiles"
    echo "  decor            Generate decorations"
    echo "  ui               Generate UI elements"
    echo "  backgrounds      Generate backgrounds"
    echo "  portraits        Generate character portraits"
    echo "  effects          Generate visual effects"
    echo ""
    echo "Examples:"
    echo "  $0                    # Generate all assets in both styles"
    echo "  $0 --style pixel      # Generate all assets in pixel style only"
    echo "  $0 heroes             # Generate heroes in both styles"
    echo "  $0 --style anime heroes  # Generate heroes in anime style only"
}

main() {
    local style="all"
    local category="all"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --style)
                style="$2"
                shift 2
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                category="$1"
                shift
                ;;
        esac
    done

    log_info "Eclipse of Lumen Art Generator"
    log_info "Style: $style | Category: $category"
    log_info "Output: $ASSETS_DIR"
    echo ""

    # Determine which styles to generate
    local styles=()
    if [ "$style" = "all" ]; then
        styles=("pixel" "anime")
    else
        styles=("$style")
    fi

    # Generate assets
    for s in "${styles[@]}"; do
        case $category in
            all)
                generate_heroes "$s"
                generate_npcs "$s"
                generate_enemies "$s"
                generate_bosses "$s"
                generate_consumables "$s"
                generate_weapons "$s"
                generate_trinkets "$s"
                generate_attachments "$s"
                generate_spells "$s"
                generate_terrain "$s"
                generate_decor "$s"
                generate_ui "$s"
                generate_backgrounds "$s"
                generate_portraits "$s"
                generate_effects "$s"
                ;;
            heroes) generate_heroes "$s" ;;
            npcs) generate_npcs "$s" ;;
            enemies) generate_enemies "$s" ;;
            bosses) generate_bosses "$s" ;;
            consumables) generate_consumables "$s" ;;
            weapons) generate_weapons "$s" ;;
            trinkets) generate_trinkets "$s" ;;
            attachments) generate_attachments "$s" ;;
            spells) generate_spells "$s" ;;
            terrain) generate_terrain "$s" ;;
            decor) generate_decor "$s" ;;
            ui) generate_ui "$s" ;;
            backgrounds) generate_backgrounds "$s" ;;
            portraits) generate_portraits "$s" ;;
            effects) generate_effects "$s" ;;
            *)
                log_error "Unknown category: $category"
                show_help
                exit 1
                ;;
        esac
    done

    # Cleanup temp directory
    rm -rf "$TEMP_DIR"

    log_success "Art generation complete!"
    log_info "Assets saved to: $ASSETS_DIR"
}

main "$@"
