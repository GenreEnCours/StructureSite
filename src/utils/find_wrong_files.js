const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MD_IMAGE_REGEX = /!\[.*?\]\((?!https?:\/\/)([^)]+)\)/g;
const HTML_IMAGE_REGEX = /<img[^>]+src=["'](?!https?:\/\/)([^"']+)["']/g;

// CLI flags
const FIX_INDENT = process.argv.includes("--fix-indent");
const GITHUB_OUTPUT = process.env.GITHUB_STEP_SUMMARY !== undefined;

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

  const exact = files.find((f) => f.toLowerCase() === base);
  if (exact) return exact;

  const baseName = path.basename(base, path.extname(base));
  const sameBase = files.find(
    (f) => path.basename(f.toLowerCase(), path.extname(f)) === baseName,
  );
  if (sameBase) return sameBase;

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
// Frontmatter indentation detection & repair
// ---------------------------------------------------------------------------

/**
 * Detects indentation issues in a frontmatter block.
 *
 * Rules checked:
 *   1. Leading tabs  → should use spaces
 *   2. Mixed tabs+spaces on the same line
 *   3. Inconsistent indentation depth (not a multiple of 2 spaces)
 *   4. Top-level keys with unexpected leading spaces
 *
 * Returns an array of issue descriptors:
 *   { line, lineNumber, type, description }
 */
function detectFrontmatterIndentIssues(rawFrontmatter) {
  const issues = [];
  const lines = rawFrontmatter.split("\n");

  // Detect the base indent unit used in the file (2 or 4 spaces)
  const spaceCounts = lines
    .map((l) => {
      const m = l.match(/^( +)/);
      return m ? m[1].length : 0;
    })
    .filter((n) => n > 0);

  const minIndent = spaceCounts.length > 0 ? Math.min(...spaceCounts) : 2;
  const indentUnit = minIndent >= 4 ? 4 : 2;

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;

    // 1. Leading tabs
    if (/^\t/.test(line)) {
      issues.push({
        line,
        lineNumber,
        type: "TAB_INDENT",
        description: `Tabulation en début de ligne (attendu : espaces)`,
      });
      return; // Skip further checks for this line
    }

    // 2. Mixed tabs and spaces
    if (/^ +\t|^\t+ /.test(line)) {
      issues.push({
        line,
        lineNumber,
        type: "MIXED_INDENT",
        description: `Mélange tabulations/espaces en début de ligne`,
      });
      return;
    }

    const leadingSpaces = (line.match(/^( *)/) || ["", ""])[1].length;

    // 3. Non-multiple indentation (only for indented lines)
    if (leadingSpaces > 0 && leadingSpaces % indentUnit !== 0) {
      issues.push({
        line,
        lineNumber,
        type: "ODD_INDENT",
        description: `Indentation de ${leadingSpaces} espace(s) (attendu : multiple de ${indentUnit})`,
      });
    }

    // 4. Top-level key with unexpected indentation
    // A top-level key looks like "key: value" or "key:" with no indent expected
    if (leadingSpaces > 0 && /^ +\w[\w-]*\s*:/.test(line)) {
      // Only flag if the line doesn't look like a nested value
      // (heuristic: if previous non-empty line ends with ":" it's intentionally nested)
      const prevNonEmpty = lines
        .slice(0, idx)
        .reverse()
        .find((l) => l.trim() !== "");
      const isNested = prevNonEmpty && /:\s*$/.test(prevNonEmpty.trim());
      if (!isNested && leadingSpaces < indentUnit) {
        issues.push({
          line,
          lineNumber,
          type: "UNEXPECTED_INDENT",
          description: `Clé de premier niveau avec ${leadingSpaces} espace(s) inattendu(s) en préfixe`,
        });
      }
    }
  });

  return issues;
}

/**
 * Repairs a frontmatter block:
 *   - Converts leading tabs to spaces (2 spaces per tab)
 *   - Removes spurious leading spaces from top-level keys
 *   - Rounds odd indentation to nearest multiple of indentUnit
 *
 * Returns { fixed: string, changed: boolean }
 */
function repairFrontmatterIndent(rawFrontmatter) {
  const lines = rawFrontmatter.split("\n");

  const spaceCounts = lines
    .map((l) => {
      const m = l.match(/^( +)/);
      return m ? m[1].length : 0;
    })
    .filter((n) => n > 0);
  const minIndent = spaceCounts.length > 0 ? Math.min(...spaceCounts) : 2;
  const indentUnit = minIndent >= 4 ? 4 : 2;

  let changed = false;

  const fixed = lines.map((line, idx) => {
    let result = line;

    // Replace leading tabs with spaces
    if (/^\t+/.test(result)) {
      result = result.replace(/^\t+/, (tabs) => " ".repeat(tabs.length * indentUnit));
      changed = true;
    }

    // Remove mixed indent (replace tab after spaces or vice-versa)
    if (/^ +\t/.test(result)) {
      result = result.replace(/^([ \t]+)/, (ws) =>
        " ".repeat(ws.replace(/\t/g, "  ").length),
      );
      changed = true;
    }

    const leadingSpaces = (result.match(/^( *)/) || ["", ""])[1].length;

    // Round odd indentation
    if (leadingSpaces > 0 && leadingSpaces % indentUnit !== 0) {
      const rounded = Math.round(leadingSpaces / indentUnit) * indentUnit;
      result = " ".repeat(rounded) + result.trimStart();
      changed = true;
    }

    // Remove spurious 1-space indent on top-level keys
    if (leadingSpaces > 0 && leadingSpaces < indentUnit && /^ +\w[\w-]*\s*:/.test(result)) {
      const prevNonEmpty = lines
        .slice(0, idx)
        .reverse()
        .find((l) => l.trim() !== "");
      const isNested = prevNonEmpty && /:\s*$/.test(prevNonEmpty.trim());
      if (!isNested) {
        result = result.trimStart();
        changed = true;
      }
    }

    return result;
  });

  return { fixed: fixed.join("\n"), changed };
}

/**
 * Extracts the raw frontmatter string (between the --- delimiters) and
 * applies detection + optional repair to the file on disk.
 *
 * Returns { issues, fixed, changed }
 */
function processFrontmatterIndent(filePath, autoFix = false) {
  const raw = fs.readFileSync(filePath, "utf8");

  // Match opening --- ... closing ---
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return { issues: [], fixed: false, changed: false };

  const rawFm = fmMatch[1];
  const issues = detectFrontmatterIndentIssues(rawFm);

  if (!autoFix || issues.length === 0) {
    return { issues, fixed: false, changed: false };
  }

  const { fixed: fixedFm, changed } = repairFrontmatterIndent(rawFm);
  if (!changed) return { issues, fixed: false, changed: false };

  const newContent = raw.replace(
    /^---\r?\n([\s\S]*?)\r?\n---/,
    `---\n${fixedFm}\n---`,
  );
  fs.writeFileSync(filePath, newContent, "utf8");
  return { issues, fixed: true, changed: true };
}

// ---------------------------------------------------------------------------
// GitHub Step Summary helpers
// ---------------------------------------------------------------------------

function appendSummary(text) {
  if (!GITHUB_OUTPUT) return;
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  fs.appendFileSync(summaryFile, text + "\n");
}

function summarySection(title, emoji) {
  appendSummary(`\n## ${emoji} ${title}\n`);
}

function summaryTable(headers, rows) {
  if (!GITHUB_OUTPUT) return;
  appendSummary("| " + headers.join(" | ") + " |");
  appendSummary("| " + headers.map(() => "---").join(" | ") + " |");
  rows.forEach((row) => appendSummary("| " + row.join(" | ") + " |"));
  appendSummary("");
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
  console.log("❌ Aucun fichier Markdown trouvé.");
  process.exit(1);
}

console.log(`🔍 Analyse de ${foundFiles.length} fichiers Markdown...\n`);
if (FIX_INDENT) console.log("🔧 Mode réparation d'indentation activé (--fix-indent)\n");

// Init summary
if (GITHUB_OUTPUT) {
  appendSummary("# 📋 Rapport de validation des fichiers Markdown\n");
  appendSummary(`> Analyse de **${foundFiles.length} fichiers** dans \`data/\``);
  if (FIX_INDENT) appendSummary("> 🔧 Mode réparation d'indentation activé");
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const problematicFiles = [];
const missingUuidFiles = [];
const invalidUuidFiles = [];
const missingFrontmatterImageFiles = [];
const missingContentImageFiles = [];
const indentIssueFiles = [];
const indentFixedFiles = [];

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

foundFiles.forEach((file) => {
  try {
    // --- Indentation frontmatter ---
    const { issues: indentIssues, fixed, changed } = processFrontmatterIndent(file, FIX_INDENT);
    if (indentIssues.length > 0) {
      indentIssueFiles.push({ file, issues: indentIssues, fixed });
      if (fixed) {
        indentFixedFiles.push(file);
        console.log(`🔧 INDENTATION RÉPARÉE: ${file} (${indentIssues.length} problème(s))`);
      } else {
        console.log(`⚠️  INDENTATION FRONTMATTER: ${file}`);
        indentIssues.forEach(({ lineNumber, type, description }) => {
          console.log(`   Ligne ${lineNumber} [${type}]: ${description}`);
        });
        console.log("");
      }
    }

    // Re-read the file in case it was fixed
    const content = fs.readFileSync(file, "utf8");
    let parsed;
    try {
      parsed = matter(content);
    } catch (parseErr) {
      console.error(`❌ ERREUR de parsing YAML dans ${file}:`);
      console.error(`   ${parseErr.message}\n`);
      return;
    }

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
    console.error(`❌ ERREUR dans ${file}:`);
    console.error(`   ${error.message}\n`);
  }
});

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------

const SEP = "=".repeat(60);

console.log(`\n${SEP}`);

// Indentation
if (indentIssueFiles.length > 0) {
  const fixed = indentIssueFiles.filter((f) => f.fixed);
  const unfixed = indentIssueFiles.filter((f) => !f.fixed);

  if (fixed.length > 0) {
    console.log(`\n🔧 ${fixed.length} fichier(s) avec indentation réparée automatiquement:\n`);
    fixed.forEach(({ file, issues }) => {
      console.log(`  ✅ ${file} (${issues.length} correction(s))`);
    });
  }
  if (unfixed.length > 0) {
    console.log(`\n🎯 ${unfixed.length} fichier(s) avec problèmes d'indentation frontmatter:\n`);
    unfixed.forEach(({ file, issues }) => {
      console.log(`  - ${file}`);
      issues.forEach(({ lineNumber, type, description }) => {
        console.log(`    Ligne ${lineNumber} [${type}]: ${description}`);
      });
    });
    console.log("\n💡 Relancez avec --fix-indent pour corriger automatiquement.");
  }
} else {
  console.log("\n✅ Aucun problème d'indentation dans les frontmatters.");
}

console.log(`\n${SEP}`);

// Author
if (problematicFiles.length > 0) {
  console.log(`\n🎯 ${problematicFiles.length} fichier(s) avec "author" non-tableau:\n`);
  problematicFiles.forEach(({ file, authorValue }) => {
    console.log(`  - ${file}`);
    console.log(`    Valeur actuelle : ${JSON.stringify(authorValue)}`);
  });
  console.log("\n💡 Transformer en tableau : author: \"John\"  →  author: [\"John\"]");
} else {
  console.log('\n✅ Tous les champs "author" sont corrects ou absents.');
}

console.log(`\n${SEP}`);

// UUID
if (missingUuidFiles.length > 0) {
  console.log(`\n🎯 ${missingUuidFiles.length} fichier(s) sans champ "uuid":\n`);
  missingUuidFiles.forEach(({ file }) => console.log(`  - ${file}`));
  console.log("\n💡 Ajouter un uuid valide dans le frontmatter (format RFC 4122)");
} else {
  console.log('\n✅ Tous les fichiers ont un champ "uuid".');
}

if (invalidUuidFiles.length > 0) {
  console.log(`\n🎯 ${invalidUuidFiles.length} fichier(s) avec un "uuid" invalide:\n`);
  invalidUuidFiles.forEach(({ file, uuidValue }) => {
    console.log(`  - ${file}`);
    console.log(`    Valeur actuelle : ${JSON.stringify(uuidValue)}`);
  });
} else if (missingUuidFiles.length === 0) {
  console.log("✅ Tous les UUIDs sont valides.");
}

console.log(`\n${SEP}`);

// Images frontmatter
if (missingFrontmatterImageFiles.length > 0) {
  console.log(`\n🎯 ${missingFrontmatterImageFiles.length} fichier(s) avec une image frontmatter introuvable:\n`);
  missingFrontmatterImageFiles.forEach(({ file, imageValue, suggestion }) => {
    console.log(`  - ${file}`);
    console.log(`    Champ image  : ${JSON.stringify(imageValue)}`);
    console.log(`    Suggestion   : ${suggestion ?? "aucune image proche trouvée"}`);
  });
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
      console.log(`    Suggestion : ${suggestion ?? "aucune image proche trouvée"}`);
    });
  });
} else {
  console.log('\n✅ Toutes les images référencées dans les contenus existent.');
}

console.log(`\n${SEP}\n`);

// ---------------------------------------------------------------------------
// GitHub Step Summary
// ---------------------------------------------------------------------------

if (GITHUB_OUTPUT) {
  const totalIssues =
    indentIssueFiles.filter((f) => !f.fixed).length +
    problematicFiles.length +
    missingUuidFiles.length +
    invalidUuidFiles.length +
    missingFrontmatterImageFiles.length +
    missingContentImageFiles.length;

  // Global status badge
  if (totalIssues === 0 && indentFixedFiles.length === 0) {
    appendSummary("\n> ✅ **Tous les fichiers sont valides !**\n");
  } else {
    appendSummary(
      `\n> ⚠️ **${totalIssues} type(s) de problème(s) détecté(s)** — voir le détail ci-dessous\n`,
    );
  }

  // ── Indentation ──────────────────────────────────────────────────────────
  summarySection("Indentation frontmatter", "🔤");

  const indentFixed = indentIssueFiles.filter((f) => f.fixed);
  const indentUnfixed = indentIssueFiles.filter((f) => !f.fixed);

  if (indentFixed.length > 0) {
    appendSummary(`### ✅ Fichiers réparés automatiquement (${indentFixed.length})\n`);
    summaryTable(
      ["Fichier", "Corrections"],
      indentFixed.map(({ file, issues }) => [
        `\`${file}\``,
        String(issues.length),
      ]),
    );
  }

  if (indentUnfixed.length > 0) {
    appendSummary(`### ⚠️ Fichiers avec problèmes d'indentation non réparés (${indentUnfixed.length})\n`);
    const rows = [];
    indentUnfixed.forEach(({ file, issues }) => {
      issues.forEach(({ lineNumber, type, description }) => {
        rows.push([`\`${file}\``, String(lineNumber), `\`${type}\``, description]);
      });
    });
    summaryTable(["Fichier", "Ligne", "Type", "Description"], rows);
    appendSummary("> 💡 Relancez le workflow avec `fix_indent: true` pour corriger automatiquement.\n");
  }

  if (indentFixed.length === 0 && indentUnfixed.length === 0) {
    appendSummary("✅ Aucun problème d'indentation détecté.\n");
  }

  // ── Author ────────────────────────────────────────────────────────────────
  summarySection("Champ `author`", "👤");
  if (problematicFiles.length > 0) {
    summaryTable(
      ["Fichier", "Valeur actuelle"],
      problematicFiles.map(({ file, authorValue }) => [
        `\`${file}\``,
        `\`${JSON.stringify(authorValue)}\``,
      ]),
    );
    appendSummary('> 💡 Le champ `author` doit être un tableau YAML : `author: ["Prénom Nom"]`\n');
  } else {
    appendSummary("✅ Tous les champs `author` sont valides.\n");
  }

  // ── UUID ──────────────────────────────────────────────────────────────────
  summarySection("Champ `uuid`", "🔑");
  if (missingUuidFiles.length > 0 || invalidUuidFiles.length > 0) {
    if (missingUuidFiles.length > 0) {
      appendSummary(`**UUID manquant (${missingUuidFiles.length} fichier(s)) :**\n`);
      summaryTable(
        ["Fichier"],
        missingUuidFiles.map(({ file }) => [`\`${file}\``]),
      );
    }
    if (invalidUuidFiles.length > 0) {
      appendSummary(`**UUID invalide (${invalidUuidFiles.length} fichier(s)) :**\n`);
      summaryTable(
        ["Fichier", "Valeur invalide"],
        invalidUuidFiles.map(({ file, uuidValue }) => [
          `\`${file}\``,
          `\`${uuidValue}\``,
        ]),
      );
    }
    appendSummary("> 💡 Format attendu : `xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx` (RFC 4122)\n");
  } else {
    appendSummary("✅ Tous les UUIDs sont présents et valides.\n");
  }

  // ── Images frontmatter ────────────────────────────────────────────────────
  summarySection("Images frontmatter", "🖼️");
  if (missingFrontmatterImageFiles.length > 0) {
    summaryTable(
      ["Fichier", "Image référencée", "Suggestion"],
      missingFrontmatterImageFiles.map(({ file, imageValue, suggestion }) => [
        `\`${file}\``,
        `\`${imageValue}\``,
        suggestion ? `\`${suggestion}\`` : "_aucune_",
      ]),
    );
    appendSummary("> 💡 Vérifiez que le fichier image existe dans le même dossier que le `.md`\n");
  } else {
    appendSummary("✅ Toutes les images frontmatter existent.\n");
  }

  // ── Images contenu ────────────────────────────────────────────────────────
  summarySection("Images dans le contenu", "📄");
  if (missingContentImageFiles.length > 0) {
    const rows = [];
    missingContentImageFiles.forEach(({ file, missing }) => {
      missing.forEach(({ ref, suggestion }) => {
        rows.push([
          `\`${file}\``,
          `\`${ref}\``,
          suggestion ? `\`${suggestion}\`` : "_aucune_",
        ]);
      });
    });
    summaryTable(["Fichier", "Référence manquante", "Suggestion"], rows);
    appendSummary("> 💡 Vérifiez les chemins relatifs au fichier `.md`\n");
  } else {
    appendSummary("✅ Toutes les images de contenu existent.\n");
  }
}

// ---------------------------------------------------------------------------
// Exit code
// ---------------------------------------------------------------------------

const totalErrors =
  indentIssueFiles.filter((f) => !f.fixed).length +
  problematicFiles.length +
  missingUuidFiles.length +
  invalidUuidFiles.length +
  missingFrontmatterImageFiles.length +
  missingContentImageFiles.length;

if (totalErrors > 0) {
  process.exit(1);
}