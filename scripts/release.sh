#!/bin/sh
# =====================================================================
# release.sh — vydání nové verze JEDNÍM příkazem.
#
#   1) zvedne verzi v kořenovém package.json (patch / minor / major)
#   2) srovná stejnou verzi i v podbalíčcích (web, server, shared)
#   3) zacommituje VŠECHNY změny jako release commit
#   4) tag v<verze> vytvoří post-commit hook (fallback níže, kdyby hook nebyl)
#
# ⚠️  Commituje celý pracovní strom (git add -A) — bere aktuální stav jako release.
#
# Použití:
#   npm run release            # patch:  1.0.0 → 1.0.1
#   npm run release -- minor   # minor:  1.0.x → 1.1.0
#   npm run release -- major   # major:  0.x   → 1.0.0
#   npm run release -- patch "vlastni zprava commitu"
#
# Push je vědomě na tobě:  git push && git push --tags
# =====================================================================
set -e

cd "$(git rev-parse --show-toplevel)"

BUMP="${1:-patch}"
case "$BUMP" in
  patch|minor|major) ;;
  *) echo "release: neznámý typ '$BUMP' (čekám patch|minor|major)"; exit 1 ;;
esac

# 1) bump kořenové verze — jen soubor, žádný git (funguje i nad „špinavým" stromem)
npm version "$BUMP" --no-git-tag-version >/dev/null
VER=$(node -p "require('./package.json').version")

# 2) srovnej verzi i v podbalíčcích (jen hodnota, formátování zůstává)
node -e '
  const fs = require("fs");
  const v = require("./package.json").version;
  for (const p of ["apps/web/package.json", "apps/server/package.json", "packages/shared/package.json"]) {
    try {
      const s = fs.readFileSync(p, "utf8").replace(/("version"\s*:\s*")[^"]*(")/, `$1${v}$2`);
      fs.writeFileSync(p, s);
    } catch { /* podbalíček nemá package.json — přeskoč */ }
  }
'

# 3) commit celého pracovního stromu jako release
MSG="${2:-release: v$VER}"
git add -A
git commit -m "$MSG"

# 4) tag — primárně ho udělá post-commit hook; tady jen pojistka, kdyby nebyl aktivní
if ! git rev-parse -q --verify "refs/tags/v$VER" >/dev/null 2>&1; then
  git tag -a "v$VER" -m "Release v$VER"
fi

echo
echo "✅ Release v$VER — commit i tag hotové."
echo "   nahraj: git push && git push origin v$VER   (nebo: git push --tags)"
