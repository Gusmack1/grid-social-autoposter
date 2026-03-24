#!/bin/bash
# swap-v4.sh — Replace old monolithic files with Phase 1 modular versions
set -e

FUNCTIONS="netlify/functions"

echo "🔄 Grid Social Phase 1 — File Swap"
echo "==================================="
echo ""

# Step 1: Back up old files
echo "📦 Backing up old files..."
mkdir -p backups
cp "$FUNCTIONS/admin.mjs" "backups/admin.mjs.bak" 2>/dev/null && echo "   ✓ admin.mjs" || echo "   ⚠ admin.mjs not found"
cp "$FUNCTIONS/auth.mjs" "backups/auth.mjs.bak" 2>/dev/null && echo "   ✓ auth.mjs" || echo "   ⚠ auth.mjs not found"
cp "$FUNCTIONS/scheduled-post.mjs" "backups/scheduled-post.mjs.bak" 2>/dev/null && echo "   ✓ scheduled-post.mjs" || echo "   ⚠ scheduled-post.mjs not found"

# Step 2: Replace with v4 versions
echo ""
echo "🔀 Swapping files..."
cp "$FUNCTIONS/admin-v4.mjs" "$FUNCTIONS/admin.mjs"
echo "   ✓ admin.mjs ← admin-v4.mjs"
cp "$FUNCTIONS/auth-v4.mjs" "$FUNCTIONS/auth.mjs"
echo "   ✓ auth.mjs ← auth-v4.mjs"
cp "$FUNCTIONS/scheduled-post-v4.mjs" "$FUNCTIONS/scheduled-post.mjs"
echo "   ✓ scheduled-post.mjs ← scheduled-post-v4.mjs"

# Step 3: Clean up v4 originals (now the primary files)
echo ""
echo "🗑️  Removing v4 originals..."
rm "$FUNCTIONS/admin-v4.mjs"
rm "$FUNCTIONS/auth-v4.mjs"
rm "$FUNCTIONS/scheduled-post-v4.mjs"
echo "   ✓ Removed -v4 originals"

echo ""
echo "✅ Swap complete!"
echo ""
echo "Next steps:"
echo "  1. Add ENCRYPTION_KEY to Netlify env vars:"
echo "     openssl rand -hex 32"
echo "  2. git add -A && git commit -m 'Phase 1: modular backend + encrypted tokens'"
echo "  3. git push origin main"
echo "  4. After deploy, run token migration:"
echo "     curl -X POST 'https://grid-social-autoposter.netlify.app/api/admin?action=migrate-tokens' \\"
echo "       -H 'Authorization: Bearer YOUR_ADMIN_KEY'"
echo "  5. Test the dashboard at gridsocial.co.uk/manage"
echo ""
