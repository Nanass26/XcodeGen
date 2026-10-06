#!/usr/bin/env bash
# Génère showreel-claude.mp4 : images (render.js) + musique (music.py) + assemblage.
set -euo pipefail
cd "$(dirname "$0")"
node render.js "$@"
python3 music.py build/events.json build/music.wav
ffmpeg -y -loglevel error -i build/video.mp4 -i build/music.wav \
  -c:v copy -af loudnorm=I=-14:TP=-1.0:LRA=11 -ar 44100 -c:a aac -b:a 192k -shortest -movflags +faststart showreel-claude.mp4
echo "OK -> $(pwd)/showreel-claude.mp4"
