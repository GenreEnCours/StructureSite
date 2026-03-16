const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MD_IMAGE_REGEX = /!\[.*?\]\((?!https?:\/\/)([^)]+)\)/g;
const HTML_IMAGE_REGEX = /<img[^>]+src=["'](?!https?:\/\/)([^"']+)["']/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    console.error(`Le répertoire ${dir} n'existe pas`);
    return fileList;
  }
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (file.endsWith(".md") || file.endsWith(".markdown")) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function extractLocalImagesFromContent(content) {
  const images = [];
  let match;

  MD_IMAGE_REGEX.lastIndex = 0;
  while ((match = MD_IMAGE_REGEX.exec(content)) !== null) {
    images.push(match[1].trim());
  }

  HTML_IMAGE_REGEX.lastIndex = 0;
  while ((match = HTML_IMAGE_REGEX.exec(content)) !== null) {
    images.push(match[1].trim());
  }

  return images;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

function findClosestFilename(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  const base = path.basename(targetName).toLowerCase();
  const files = fs
    .readdirSync(dir)
    .filter((f) => !fs.statSync(path.join(dir, f)).isDirectory());

  // 1. Correspondance exacte insensible à la casse
  const exact = files.find((f) => f.toLowerCase() === base);
  if (exact) return exact;

  // 2. Même nom de base, extension différente
  const baseName = path.basename(base, path.extname(base));
  const sameBase = files.find(
    (f) => path.basename(f.toLowerCase(), path.extname(f)) === baseName,
  );
  if (sameBase) return sameBase;

  // 3. Distance de Levenshtein sur les fichiers images uniquement
  const imageExts = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif",
  ]);
  const imageFiles = files.filter((f) =>
    imageExts.has(path.extname(f).toLowerCase()),
  );
  if (imageFiles.length === 0) return null;

  const scored = imageFiles
    .map((f) => ({ name: f, dist: levenshtein(f.toLowerCase(), base) }))
    .sort((a, b) => a.dist - b.dist);

  return scored[0].dist <= Math.max(base.length * 0.5, 3)
    ? scored[0].name
    : null;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const dataPath = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataPath)) {
  console.error(`❌ Le répertoire ${dataPath} n'existe pas`);
  process.exit(1);
}

const foundFiles = findMarkdownFiles(dataPath);

if (foundFiles.length === 0) {
  console.log("❌ Aucun fichier Markdown trouvé. Vérifiez les chemins de recherche.");
  process.exit(1);
}

console.log(`🔍 Analyse de ${foundFiles.length} fichiers Markdown...\n`);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const problematicFiles = [];
const missingUuidFiles = [];
const invalidUuidFiles = [];
const missingFrontmatterImageFiles = [];
const missingContentImageFiles = [];

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

foundFiles.forEach((file) => {
  try {
    const content = fs.readFileSync(file, "utf8");
    const parsed = matter(content);
    const { author, uuid, image } = parsed.data;
    const fileDir = path.dirname(file);

    // --- Author ---
    if (author !== undefined && !Array.isArray(author)) {
      problematicFiles.push({ file, authorValue: author });
      console.log(`⚠️  AUTHOR INVALIDE: ${file}`);
      console.log(`   author = ${JSON.stringify(author)} (type: ${typeof author})`);
      console.log("");
    } else if (author === undefined) {
      console.log(`ℹ️  ${file} - pas de champ author`);
    } else {
      console.log(`✓ ${file} - author OK (tableau)`);
    }

    // --- UUID ---
    if (uuid === undefined || uuid === null || uuid === "") {
      missingUuidFiles.push({ file });
      console.log(`⚠️  UUID MANQUANT: ${file}`);
      console.log("");
    } else if (!UUID_REGEX.test(String(uuid))) {
      invalidUuidFiles.push({ file, uuidValue: uuid });
      console.log(`⚠️  UUID INVALIDE: ${file}`);
      console.log(`   uuid = ${JSON.stringify(uuid)}`);
      console.log("");
    } else {
      console.log(`✓ ${file} - uuid OK (${uuid})`);
    }

    // --- Image frontmatter ---
    if (image !== undefined && image !== null && image !== "") {
      const imagePath = path.join(fileDir, image);
      if (!fs.existsSync(imagePath)) {
        const suggestion = findClosestFilename(fileDir, image);
        missingFrontmatterImageFiles.push({ file, imageValue: image, suggestion });
        console.log(`⚠️  IMAGE FRONTMATTER MANQUANTE: ${file}`);
        console.log(`   image = ${JSON.stringify(image)}`);
        if (suggestion) console.log(`   Vouliez-vous dire : ${suggestion} ?`);
        console.log("");
      } else {
        console.log(`✓ ${file} - image frontmatter OK (${image})`);
      }
    } else if (image !== undefined) {
      console.log(`ℹ️  ${file} - champ image présent mais vide`);
    }

    // --- Images dans le contenu ---
    const localImages = extractLocalImagesFromContent(parsed.content);
    if (localImages.length > 0) {
      const missing = localImages
        .filter((imgRef) => !fs.existsSync(path.join(fileDir, imgRef)))
        .map((imgRef) => ({
          ref: imgRef,
          suggestion: findClosestFilename(fileDir, imgRef),
        }));

      if (missing.length > 0) {
        missingContentImageFiles.push({ file, missing });
        missing.forEach(({ ref, suggestion }) => {
          console.log(`⚠️  IMAGE CONTENU MANQUANTE: ${file}`);
          console.log(`   référence = ${JSON.stringify(ref)}`);
          if (suggestion) console.log(`   Vouliez-vous dire : ${suggestion} ?`);
          console.log("");
        });
      } else {
        console.log(`✓ ${file} - ${localImages.length} image(s) contenu OK`);
      }
    }
  } catch (error) {
    console.error(`❌ ERREUR de parsing dans ${file}:`);
    console.error(`   ${error.message}\n`);
  }
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const SEP = "=".repeat(60);

console.log(`\n${SEP}`);

// Author
if (problematicFiles.length > 0) {
  console.log(`\n🎯 ${problematicFiles.length} fichier(s) avec "author" non-tableau:\n`);
  problematicFiles.forEach(({ file, authorValue }) => {
    console.log(`  - ${file}`);
    console.log(`    Valeur actuelle : ${JSON.stringify(authorValue)}`);
  });
  console.log("\n💡 Transformer en tableau, par exemple :");
  console.log('   author: "John Doe"  →  author: ["John Doe"]');
} else {
  console.log('\n✅ Tous les champs "author" sont corrects ou absents.');
}

console.log(`\n${SEP}`);

// UUID
if (missingUuidFiles.length > 0) {
  console.log(`\n🎯 ${missingUuidFiles.length} fichier(s) sans champ "uuid":\n`);
  missingUuidFiles.forEach(({ file }) => console.log(`  - ${file}`));
  console.log("\n💡 Ajouter un uuid dans le frontmatter, par exemple :");
  console.log("   uuid: 550e8400-e29b-41d4-a716-446655440000");
} else {
  console.log('\n✅ Tous les fichiers ont un champ "uuid".');
}

if (invalidUuidFiles.length > 0) {
  console.log(`\n🎯 ${invalidUuidFiles.length} fichier(s) avec un "uuid" invalide:\n`);
  invalidUuidFiles.forEach(({ file, uuidValue }) => {
    console.log(`  - ${file}`);
    console.log(`    Valeur actuelle : ${JSON.stringify(uuidValue)}`);
  });
  console.log("\n💡 Un UUID valide respecte le format RFC 4122 :");
  console.log("   xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx");
} else if (missingUuidFiles.length === 0) {
  console.log("✅ Tous les UUIDs sont valides.");
}

console.log(`\n${SEP}`);

// Image frontmatter
if (missingFrontmatterImageFiles.length > 0) {
  console.log(`\n🎯 ${missingFrontmatterImageFiles.length} fichier(s) avec une image frontmatter introuvable:\n`);
  missingFrontmatterImageFiles.forEach(({ file, imageValue, suggestion }) => {
    console.log(`  - ${file}`);
    console.log(`    Champ image  : ${JSON.stringify(imageValue)}`);
    console.log(`    Suggestion   : ${suggestion ?? "aucune image proche trouvée dans le dossier"}`);
  });
  console.log("\n💡 Vérifiez que le fichier image existe bien dans le même dossier que le .md");
} else {
  console.log('\n✅ Toutes les images frontmatter référencées existent.');
}

console.log(`\n${SEP}`);

// Images contenu
if (missingContentImageFiles.length > 0) {
  const totalMissing = missingContentImageFiles.reduce(
    (acc, { missing }) => acc + missing.length,
    0,
  );
  console.log(
    `\n🎯 ${totalMissing} image(s) manquante(s) dans le contenu de ${missingContentImageFiles.length} fichier(s):\n`,
  );
  missingContentImageFiles.forEach(({ file, missing }) => {
    console.log(`  - ${file}`);
    missing.forEach(({ ref, suggestion }) => {
      console.log(`    Référence  : ${JSON.stringify(ref)}`);
      console.log(`    Suggestion : ${suggestion ?? "aucune image proche trouvée dans le dossier"}`);
    });
  });
  console.log("\n💡 Vérifiez que les images référencées dans le contenu existent bien relativement au fichier .md");
} else {
  console.log('\n✅ Toutes les images référencées dans les contenus existent.');
}

console.log(`\n${SEP}\n`);