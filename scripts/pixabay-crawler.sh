#!/bin/bash
# Pixabay Music Crawler
# Downloads royalty-free music from Pixabay

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BASE_URL="https://pixabay.com"
OUTPUT_DIR="assets/music"

download_music() {
    local search_term="$1"
    local output_name="$2"
    local max_tracks="${3:-1}"

    echo "Searching for: $search_term"

    # Get track page URLs from search
    local track_urls=$(curl -s -A "$UA" "${BASE_URL}/music/search/${search_term}/" 2>/dev/null | \
        grep -oE 'href="/music/[a-z0-9-]+-[0-9]+/"' | \
        sed 's/href="//' | sed 's/"$//' | \
        head -$max_tracks)

    local count=1
    for track_path in $track_urls; do
        echo "  Found track: $track_path"

        # Get download URL from track page
        local download_url=$(curl -s -A "$UA" "${BASE_URL}${track_path}" 2>/dev/null | \
            grep -oE 'https://cdn\.pixabay\.com/download/audio[^"]+\.mp3[^"]*' | \
            head -1)

        if [ -n "$download_url" ]; then
            local filename="${output_name}"
            if [ $max_tracks -gt 1 ]; then
                filename="${output_name}_${count}"
            fi
            filename="${filename}.mp3"

            echo "  Downloading: $filename"
            curl -s -A "$UA" -o "${OUTPUT_DIR}/${filename}" "$download_url"
            echo "  Saved: ${OUTPUT_DIR}/${filename}"
            ((count++))
        else
            echo "  Could not find download URL"
        fi
    done
}

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Download music for each category
echo "=== Pixabay Music Crawler ==="
echo ""

download_music "fantasy%20battle%20epic" "battle" 1
download_music "fantasy%20menu%20calm" "menu" 1
download_music "fantasy%20town%20medieval" "town" 1
download_music "epic%20boss%20orchestral" "boss" 1

echo ""
echo "=== Download complete ==="
ls -la "$OUTPUT_DIR"
