import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importTransactionsFromCsv } from "../src/lib/bulk-import/transactions";
import { getAdminDb } from "../src/lib/firebase/admin";

type CliOptions = {
  filePath: string;
  userId: string;
  projectionMonths: number;
};

function parseArgs(argv: string[]): CliOptions {
  const args = Object.fromEntries(
    argv
      .map((arg) => arg.split("="))
      .filter((parts) => parts.length === 2)
      .map(([key, value]) => [key.replace(/^--/, ""), value]),
  );

  const filePath = args.file ?? args.f;
  const userId = args.uid ?? args.userId;
  const projectionMonths = Number(args.months ?? 3);

  if (!filePath) {
    throw new Error("Informe o arquivo CSV: --file=./imports/transacoes.csv");
  }

  if (!userId) {
    throw new Error("Informe o UID do usuário: --uid=SEU_UID_FIREBASE");
  }

  if (Number.isNaN(projectionMonths) || projectionMonths < 0) {
    throw new Error("--months deve ser um número maior ou igual a 0");
  }

  return {
    filePath,
    userId,
    projectionMonths,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const absolutePath = resolve(process.cwd(), options.filePath);
  const csvContent = await readFile(absolutePath, "utf-8");

  const result = await importTransactionsFromCsv({
    db: getAdminDb(),
    userId: options.userId,
    csvContent,
    projectionMonths: options.projectionMonths,
  });

  console.log("✅ Bulk import finalizado com sucesso");
  console.table(result);
}

main().catch((error) => {
  console.error("❌ Falha no bulk import:", error.message);
  process.exit(1);
});
