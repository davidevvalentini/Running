#!/bin/bash
# Pubblica l'app su running.davide-valentini.it (nginx serve /var/www/running).
set -euo pipefail
cd "$(dirname "$0")"
npm test >/dev/null
rsync -a --delete --exclude .git --exclude test --exclude .github --exclude package.json --exclude README.md --exclude deploy-running.sh ./ /var/www/running/
echo "✓ Pubblicato"
