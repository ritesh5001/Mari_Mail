const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname);
const src = path.join(repoRoot, "../logo.png");
const destDir = path.join(repoRoot, "../client/public");
const dest = path.join(destDir, "logo.png");

try {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(src)) {
    console.warn("Source logo not found at:", src);
    process.exit(0);
  }
  fs.copyFileSync(src, dest);
  console.log("Copied logo to", dest);
} catch (err) {
  console.error("Failed to copy logo:", err);
  process.exit(1);
}
