import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { z } from "zod";

export const runtime = "nodejs";

const parsedInvoiceItemSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.number().finite(),
  suggested_category: z.string().min(1),
});

const parsedInvoiceSchema = z.array(parsedInvoiceItemSchema);

function extractJsonArray(text: string): unknown {
  console.log("=== RESPOSTA BRUTA DA IA ===");
  console.log(text.substring(0, 800));
  console.log("=== FIM RESPOSTA ===");

  // Limpa markdown e espaços
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // Tenta encontrar array JSON pelo primeiro [ e último ]
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const jsonStr = cleaned.slice(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.error("Erro ao parsear JSON extraído:", e);
    }
  }

  // Tenta parsear a resposta inteira como JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object" && parsed !== null) {
      const arrayValue = Object.values(parsed).find((v) => Array.isArray(v));
      if (arrayValue) return arrayValue;
    }
  } catch (e) {
    console.error("Erro ao parsear JSON direto:", e);
  }

  // Retorna array vazio se a IA respondeu que não há dados
  const lower = cleaned.toLowerCase();
  if (
    lower.includes("no data") ||
    lower.includes("sem dados") ||
    lower.includes("nenhum lançamento") ||
    lower.includes("nenhuma transação") ||
    lower.includes("vazio") ||
    cleaned === "" ||
    cleaned === "null"
  ) {
    return [];
  }

  throw new Error(
    `Resposta da IA não é um JSON válido. Resposta recebida:\n${text.substring(0, 400)}`,
  );
}

function normalizeDate(dateInput: string): string {
  const value = dateInput.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    const yyyy = asDate.getFullYear();
    const mm = String(asDate.getMonth() + 1).padStart(2, "0");
    const dd = String(asDate.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  throw new Error(`Data inválida retornada pela IA: ${value}`);
}

const rigidPrompt = (csvContent: string) => [
  "Você é um extrator de dados financeiros. Sua única saída deve ser JSON puro.",
  "REGRAS ABSOLUTAS:",
  "1. Retorne APENAS o array JSON, sem nenhum texto antes ou depois.",
  "2. Não use markdown, não use ``` , não escreva explicações.",
  "3. Se não houver dados, retorne apenas: []",
  "",
  "FORMATO DO CSV: a primeira coluna contém a descrição do lançamento.",
  "As demais colunas contêm valores mensais com cabeçalho no formato mês/aa (ex: abril/26).",
  "",
  "Para cada célula com valor numérico não vazia, gere um objeto JSON com:",
  "  description (string, da coluna A)",
  "  date (string YYYY-MM-DD, primeiro dia do mês da coluna)",
  "  amount (number positivo, ex: 123.45)",
  "  suggested_category (string curta em português)",
  "",
  "Mapeamento de mês: janeiro=01, fevereiro=02, março=03, abril=04, maio=05, junho=06,",
  "julho=07, agosto=08, setembro=09, outubro=10, novembro=11, dezembro=12.",
  "Ano no formato aa: 26 = 2026, 25 = 2025, etc.",
  "",
  "EXEMPLO de entrada:",
  "Descrição,abril/26,maio/26",
  "Aluguel,1200.00,1200.00",
  "Netflix,55.90,",
  "",
  "EXEMPLO de saída:",
  '[{"description":"Aluguel","date":"2026-04-01","amount":1200.00,"suggested_category":"Moradia"},{"description":"Aluguel","date":"2026-05-01","amount":1200.00,"suggested_category":"Moradia"},{"description":"Netflix","date":"2026-04-01","amount":55.90,"suggested_category":"Entretenimento"}]',
  "",
  "CSV para processar:",
  csvContent,
].join("\n");

// Modelos Gemini em ordem de preferência (cotas independentes)
const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
];

// Modelos Groq em ordem de preferência (llama-3.1-8b-instant tem maior TPM)
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
];

// Divide o CSV em chunks menores para respeitar limites de tokens (~7000 chars por chunk)
function splitCsvIntoChunks(csvContent: string, maxCharsPerChunk = 7000): string[] {
  const lines = csvContent.split("\n");
  if (lines.length <= 1) return [csvContent];

  const header = lines[0];
  const dataLines = lines.slice(1).filter((l) => l.trim());
  if (dataLines.length === 0) return [csvContent];

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLen = header.length + 1;

  for (const line of dataLines) {
    if (currentLen + line.length + 1 > maxCharsPerChunk && currentChunk.length > 0) {
      chunks.push([header, ...currentChunk].join("\n"));
      currentChunk = [];
      currentLen = header.length + 1;
    }
    currentChunk.push(line);
    currentLen += line.length + 1;
  }

  if (currentChunk.length > 0) {
    chunks.push([header, ...currentChunk].join("\n"));
  }

  return chunks.length > 0 ? chunks : [csvContent];
}

async function tryGemini(csvContent: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: Error = new Error("Gemini: nenhum modelo disponível.");

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { maxOutputTokens: 8192 },
      });
      const result = await model.generateContent(rigidPrompt(csvContent));
      console.log(`Gemini OK com modelo: ${modelName}`);
      return result.response.text();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`Gemini modelo ${modelName} falhou:`, lastError.message.substring(0, 120));
    }
  }

  throw lastError;
}

async function tryGroq(csvContent: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "YOUR_GROQ_API_KEY") {
    throw new Error("GROQ_API_KEY não configurada.");
  }

  const groq = new Groq({ apiKey });
  let lastError: Error = new Error("Groq: nenhum modelo disponível.");

  for (const model of GROQ_MODELS) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: rigidPrompt(csvContent) }],
        model,
        temperature: 0.1,
        max_tokens: 8000,
      });
      console.log(`Groq OK com modelo: ${model}`);
      return completion.choices[0]?.message?.content ?? "";
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`Groq modelo ${model} falhou:`, lastError.message.substring(0, 120));
    }
  }

  throw lastError;
}

async function processChunk(chunk: string): Promise<string> {
  try {
    return await tryGemini(chunk);
  } catch (geminiError) {
    console.warn("Gemini falhou para chunk, tentando Groq:", geminiError instanceof Error ? geminiError.message.substring(0, 80) : "");
    return await tryGroq(chunk);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Envie um arquivo CSV no campo 'file'." },
        { status: 400 },
      );
    }

    const csvContent = await file.text();
    if (!csvContent.trim()) {
      return NextResponse.json(
        { error: "O arquivo CSV está vazio." },
        { status: 400 },
      );
    }

    // Divide CSV em chunks para evitar limites de tokens das APIs
    const chunks = splitCsvIntoChunks(csvContent);
    console.log(`CSV dividido em ${chunks.length} chunk(s).`);

    const allValidated: z.infer<typeof parsedInvoiceItemSchema>[] = [];
    let usedProvider = "";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let text: string;

      try {
        text = await tryGemini(chunk);
        usedProvider = "Gemini";
      } catch (geminiError) {
        const geminiMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
        console.warn(`Chunk ${i + 1}: Gemini falhou, tentando Groq:`, geminiMsg.substring(0, 120));
        try {
          text = await tryGroq(chunk);
          usedProvider = usedProvider || "Groq";
        } catch (groqError) {
          const groqMsg = groqError instanceof Error ? groqError.message : String(groqError);
          console.error(`Chunk ${i + 1}: Groq também falhou:`, groqMsg.substring(0, 120));
          return NextResponse.json(
            {
              error: `Ambas APIs de IA falharam no chunk ${i + 1}/${chunks.length}.`,
              details: { gemini: geminiMsg, groq: groqMsg },
            },
            { status: 500 },
          );
        }
      }

      const parsed = extractJsonArray(text);
      const validated = parsedInvoiceSchema.parse(parsed).map((item) => ({
        ...item,
        date: normalizeDate(item.date),
        description: item.description.trim().slice(0, 180),
        amount: Number(item.amount),
        suggested_category: item.suggested_category.trim().slice(0, 80),
      }));
      allValidated.push(...validated);
    }

    return NextResponse.json({ ok: true, data: allValidated, provider: usedProvider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar fatura com IA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
