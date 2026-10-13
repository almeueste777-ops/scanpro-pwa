git add -f dist
$tree = git write-tree --prefix=dist/
$commit = git commit-tree $tree.Trim() -m "feat: release ScanPro v1.2.0 Semnaturi & Stampile"
git push origin "$($commit.Trim()):refs/heads/gh-pages" --force
git reset HEAD dist
Write-Host "DEPLOYED COMMIT: $commit"
