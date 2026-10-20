#!/bin/sh
# Regenera los PNG del ícono de Invest desde los SVG (BRD-7). Requiere rsvg-convert y ImageMagick.
# Uso: sh tools/icons/build.sh (desde la raíz del repo)
set -e
png() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3.tmp.png"; magick "$3.tmp.png" -background '#14213D' -alpha remove -alpha off -strip "PNG24:$3"; rm "$3.tmp.png"; }
png icon.svg 32 icon-32.png
png icon.svg 180 apple-touch-icon.png
png icon.svg 192 icon-192.png
png icon.svg 512 icon-512.png
png tools/icons/icon-maskable.svg 192 icon-maskable-192.png
png tools/icons/icon-maskable.svg 512 icon-maskable-512.png
