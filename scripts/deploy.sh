#!/usr/bin/env bash
# Static client → https://tcj.io/sprat/ . The ws server runs separately (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
npm test && npm run build
rsync -avz --delete dist/ traviscj@tcj.io:/var/www/tcj.io/sprat/
echo "→ https://tcj.io/sprat/"
