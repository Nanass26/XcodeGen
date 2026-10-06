#!/usr/bin/env bash
# Génère histoire-claude.mp4 : images (render.js) + musique (music.py) + assemblage.
set -euo pipefail
cd "$(dirname "$0")"
node render.js "$@"
python3 music.py build/events.json build/music.wav
ffmpeg -y -loglevel error -i build/video.mp4 -i build/music.wav \
  -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 -c:a aac -b:a 192k -shortest -movflags +faststart histoire-claude.mp4
echo "OK -> $(pwd)/histoire-claude.mp4"
