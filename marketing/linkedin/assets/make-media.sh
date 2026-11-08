#!/usr/bin/env bash
# Turns recorded PNG frames into GIF + MP4 for the LinkedIn posts.
set -euo pipefail
FR=/home/mrybak/Projects/breakpoint/.claude/worktrees/linkedin-series/.playwright-mcp/frames
OUT=/home/mrybak/Projects/breakpoint/.claude/worktrees/linkedin-series/marketing/linkedin/assets
CROP="crop=767:800:225:0"

one() { # frames-dir out-name
  ffmpeg -y -loglevel error -framerate 12 -i "$FR/$1/f%03d.png" \
    -vf "$CROP,scale=720:-2:flags=lanczos,tpad=stop_mode=clone:stop_duration=3" \
    -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/$2.mp4"
  ffmpeg -y -loglevel error -i "$OUT/$2.mp4" \
    -vf "fps=10,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
    "$OUT/$2.gif"
}

pair() { # left-dir right-dir out-name left-label right-label
  ffmpeg -y -loglevel error -framerate 12 -i "$FR/$1/f%03d.png" -framerate 12 -i "$FR/$2/f%03d.png" \
    -filter_complex "[0]$CROP,scale=600:-2,drawtext=text='$4':x=20:y=h-50:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8[l];[1]$CROP,scale=600:-2,drawtext=text='$5':x=20:y=h-50:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8[r];[l][r]hstack=shortest=1,tpad=stop_mode=clone:stop_duration=3" \
    -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/$3.mp4"
}

one launch w1-launch
one retry w5-retry-no-breaker
one retry-breaker w5-retry-breaker
one queue w3-queue
one no-queue w3-no-queue
pair no-queue queue w3-side-by-side "No queue" "With a queue"
pair retry retry-breaker w5-side-by-side "Retries only" "Retries + circuit breaker"

# W4 joke + W1 still: the failed launch run, last frame before the fix
ffmpeg -y -loglevel error -i "$FR/launch/f090.png" -vf "$CROP" "$OUT/w4-failed.png"
ls -la "$OUT"
