#!/bin/sh
# Íconos de Inversiones de moyiq (rebrand Entrega 1, 17-nov-2026): ya no se dibujan acá.
# Se copian del set oficial generado desde el isotipo (lupa al 44 % del lado, centrada
# ópticamente, sobre morado #3C2282), en financeos-workspace/branding/rebrand-2026-11/iconos-app/
# (generador: _fuente/generar.py). Uso: sh tools/icons/build.sh (desde la raíz del repo).
# Después de copiar, subir ?v= en los <link> de las 9 páginas y en manifest.webmanifest.
set -e
I="../financeos-workspace/branding/rebrand-2026-11/iconos-app"
[ -d "$I" ] || { echo "No encuentro $I (repo hermano financeos-workspace)"; exit 1; }
cp "$I/favicon.svg" favicon.svg
cp "$I/icono-morado.svg" icon.svg
cp "$I/png/morado/icono-32.png" icon-32.png
cp "$I/apple-touch-icon.png" apple-touch-icon.png
cp "$I/png/morado/icono-192.png" icon-192.png
cp "$I/png/morado/icono-512.png" icon-512.png
cp "$I/png/morado/maskable-192.png" icon-maskable-192.png
cp "$I/png/morado/maskable-512.png" icon-maskable-512.png
