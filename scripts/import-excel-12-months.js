const XLSX = require("xlsx");
const admin = require("firebase-admin");
const readline = require("readline");

const EXCEL_FILE_PATH =
  "C:\\Users\\leandrofa_neowrk\\Desktop\\Planilha-de-gastos-2026  PJ (1).xlsx";
const DEFAULT_PROJECT_ID = "app-financeiro-familiar-95c7d";

let db;
let USER_ID;

const monthMap = {
  Jan: "01",
  Fev: "02",
  Mar: "03",
  Abr: "04",
  Mai: "05",
  Jun: "06",
  Jul: "07",
  Ago: "08",
  Set: "09",
  Out: "10",
  Nov: "11",
  Dez: "12",
};

const expenseColumns = [
  "Gastos Básicos",
  "Gastos Basicos",
  "Gastos Opcionais",
  "Gastos anuais ou parcelados",
];

const incomeColumns = ["Receitas Mensais", "Receitas Eventuais", "Receitas mensais"];

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

function parseMonthYear(sheetName) {
  const parts = String(sheetName).trim().split(" ");
  if (parts.length !== 2) return null;

  const month = monthMap[parts[0]];
  const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];

  if (!month) return null;
  return { month, year };
}

async function initializeFirebase() {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    DEFAULT_PROJECT_ID;

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log("✅ Firebase inicializado com credenciais do .env (Admin SDK)");
  } else {
    try {
      const serviceAccount = require("../service-account-key.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase inicializado com service account");
    } catch {
      if (!projectId) {
        const manualProjectId = await askQuestion("Digite o Firebase Project ID: ");
        admin.initializeApp({ projectId: String(manualProjectId).trim() });
      } else {
        admin.initializeApp({ projectId });
      }
      console.log("✅ Firebase inicializado sem service account (modo fallback)");
    }
  }

  db = admin.firestore();
}

async function getUserId() {
  if (process.env.IMPORT_USER_ID && String(process.env.IMPORT_USER_ID).trim()) {
    return String(process.env.IMPORT_USER_ID).trim();
  }

  try {
    const usersSnapshot = await admin.auth().listUsers(10);
    if (usersSnapshot.users.length > 0) {
      console.log("\nUsuários disponíveis (amostra):");
      usersSnapshot.users.forEach((user, index) => {
        console.log(
          `  ${index + 1}. ${user.email || user.phoneNumber || "Sem email"} (${user.uid})`,
        );
      });
      console.log("");

      if (usersSnapshot.users.length === 1) {
        const onlyUserId = usersSnapshot.users[0].uid;
        console.log(`✅ Apenas 1 usuário encontrado. Usando UID automaticamente: ${onlyUserId}`);
        return onlyUserId;
      }
    }
  } catch {
    console.log("⚠️ Não foi possível listar usuários automaticamente.");
  }

  const userId = await askQuestion("Digite o User ID (UID) para importar os dados: ");
  return String(userId).trim();
}

async function getCategoryId(categoryName, type) {
  const normalizedName = String(categoryName).trim();

  const snapshot = await db
    .collection("categories")
    .where("user_id", "==", USER_ID)
    .where("name", "==", normalizedName)
    .where("type", "==", type)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  const newCategoryRef = await db.collection("categories").add({
    user_id: USER_ID,
    name: normalizedName,
    type,
    color: type === "expense" ? "#ef4444" : "#10b981",
    icon: type === "expense" ? "ShoppingCart" : "DollarSign",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Criada categoria: ${normalizedName} (${type})`);
  return newCategoryRef.id;
}

function isCreditCardDescription(description) {
  const normalized = String(description).toLowerCase();
  return (
    normalized.includes("cartão de credito") ||
    normalized.includes("cartão de crédito") ||
    normalized.includes("cartao de credito") ||
    normalized.includes("cartao de crédito")
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getSectionType(label) {
  const text = normalizeText(label);
  if (text.startsWith("gastos basicos")) return "expense";
  if (text.startsWith("gastos opcionais")) return "expense";
  if (text.startsWith("gastos anuais ou parcelados")) return "expense";
  if (text.startsWith("receitas mensais")) return "income";
  if (text.startsWith("receitas eventuais")) return "income";
  return null;
}

function firstPositiveNumber(row) {
  for (const cell of row) {
    if (typeof cell === "number" && Number.isFinite(cell) && cell > 0) {
      return cell;
    }

    const parsed = Number(String(cell).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

async function importSheet(workbook, sheetName) {
  console.log(`\n📄 Processando aba: ${sheetName}`);

  const monthYear = parseMonthYear(sheetName);
  if (!monthYear) {
    console.log("   ⚠️ Nome de aba fora do padrão 'Mar 25'. Pulando...");
    return { imported: 0, skipped: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!data.length) {
    console.log("   ⚠️ Aba vazia, pulando...");
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  let batch = db.batch();
  let batchCount = 0;

  let currentSectionType = null;
  let currentSectionName = null;

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex] || [];
    const firstTextCell = row.find((cell) => typeof cell === "string" && String(cell).trim() !== "") || "";
    const sectionType = getSectionType(firstTextCell);

    if (sectionType) {
      currentSectionType = sectionType;
      currentSectionName = String(firstTextCell).trim();
      continue;
    }

    if (!currentSectionType || !currentSectionName) {
      continue;
    }

    const descriptionCell = row.find((cell) => typeof cell === "string" && String(cell).trim() !== "");
    let description = String(descriptionCell || "").trim();

    if (!description) {
      continue;
    }

    const normalizedDescription = normalizeText(description);
    if (
      normalizedDescription === "comentarios" ||
      normalizedDescription === "percentual" ||
      normalizedDescription === "valor ano" ||
      normalizedDescription === "quanto por mes" ||
      normalizedDescription === "valor"
    ) {
      continue;
    }

    if (getSectionType(description)) {
      continue;
    }

    if (isCreditCardDescription(description)) {
      skipped++;
      continue;
    }

    const numeric = firstPositiveNumber(row);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }

    const { year, month } = monthYear;
    const day = String(Math.min(Math.max(rowIndex, 1), 28)).padStart(2, "0");
    const date = `${year}-${month}-${day}`;

    const categoryId = await getCategoryId(currentSectionName, currentSectionType);
    const transactionRef = db.collection("transactions").doc();

    batch.set(transactionRef, {
      user_id: USER_ID,
      description,
      amount: Math.abs(numeric),
      type: currentSectionType,
      category_id: categoryId,
      date,
      status: "completed",
      payment_method: "cash",
      is_recurring: false,
      installment_current: 1,
      installment_total: 1,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      import_batch_id: `excel-import-${Date.now()}`,
    });

    batchCount++;
    imported++;

    if (batchCount >= 450) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`   ✅ Importadas: ${imported} | ⚠️ Ignoradas: ${skipped}`);
  return { imported, skipped };
}

async function main() {
  console.log("🚀 Iniciando importação do Excel");
  console.log(`📁 Arquivo: ${EXCEL_FILE_PATH}\n`);

  const workbook = XLSX.readFile(EXCEL_FILE_PATH);

  await initializeFirebase();
  USER_ID = await getUserId();

  if (!USER_ID) {
    throw new Error("User ID não informado.");
  }

  const monthSheets = workbook.SheetNames.filter((name) => parseMonthYear(name));
  if (!monthSheets.length) {
    throw new Error("Nenhuma aba no formato 'Mar 25', 'Abr 25', etc. foi encontrada.");
  }

  console.log(`\n📊 Abas válidas: ${monthSheets.join(", ")}`);
  const autoConfirm = String(process.env.IMPORT_CONFIRM || "").trim().toLowerCase();
  const confirm = autoConfirm === "s" || autoConfirm === "sim"
    ? "s"
    : await askQuestion("Deseja prosseguir com a importação? (s/n): ");
  if (String(confirm).trim().toLowerCase() !== "s") {
    console.log("❌ Importação cancelada.");
    return;
  }

  let totalImported = 0;
  let totalSkipped = 0;

  for (const sheetName of monthSheets) {
    const result = await importSheet(workbook, sheetName);
    totalImported += result.imported;
    totalSkipped += result.skipped;
  }

  console.log("\n" + "=".repeat(60));
  console.log("✨ IMPORTAÇÃO CONCLUÍDA");
  console.log(`✅ Total importado: ${totalImported}`);
  console.log(`⚠️ Total ignorado: ${totalSkipped}`);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Erro fatal:", error?.message || error);
    process.exit(1);
  });
