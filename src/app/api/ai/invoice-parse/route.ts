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
  // Log para debug (remover em produção)
  console.log("=== RESPOSTA BRUTA DA IA ===");
  console.log(text.substring(0, 500));
  console.log("=== FIM RESPOSTA ===");

  // Limpa markdown e espaços
  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // Tenta encontrar array JSON
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const jsonStr = cleaned.slice(firstBracket, lastBracket + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro ao parsear JSON extraído:", e);
    }
  }

  // Estratégia 2: Tenta parsear a resposta inteira como JSON
  try {
    const parsed = JSON.parse(cleaned);
    // Se for array, retorna
    if (Array.isArray(parsed)) {
      return parsed;
    }
    // Se for objeto com array, tenta encontrar o array
    if (typeof parsed === "object" && parsed !== null) {
      const values = Object.values(parsed);
      const arrayValue = values.find((v) => Array.isArray(v));
      if (arrayValue) {
        return arrayValue;
      }
    }
  } catch (e) {
    console.error("Erro ao parsear JSON direto:", e);
  }

  // Estratégia 3: Remove texto antes do primeiro [ e depois do último ]
  const lines = cleaned.split("\n");
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && lines[i].includes("[")) {
      startIdx = i;
    }
    if (lines[i].includes("]")) {
      endIdx = i;
    }
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    try {
      const jsonLines = lines.slice(startIdx, endIdx + 1).join("\n");
      return JSON.parse(jsonLines);
    } catch (e) {
      console.error("Erro ao parsear JSON por linhas:", e);
    }
  }

  throw new Error("Resposta da IA não contém um JSON array válido.");
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
  "Você é um extrator de dados financeiros.",
  "O CSV fornecido está no seguinte formato: a primeira coluna (A) contém a descrição do lançamento, e as colunas seguintes contêm os valores de cada mês, com o cabeçalho no formato mês/aa (ex: abril/26, maio/26, etc).",
  "Para cada valor preenchido em cada linha e mês, gere um lançamento separado, com as seguintes chaves:",
  "- description: igual ao valor da coluna A.",
  "- date: o primeiro dia do mês correspondente ao cabeçalho da coluna (ex: 'abril/26' vira '2026-04-01').",
  "- amount: valor da célula, como número positivo em reais (ex: 123.45).",
  "- suggested_category: uma categoria curta em português, baseada na descrição.",
  "Ignore células vazias e linhas que não sejam lançamentos.",
  "Retorne APENAS um array JSON válido, sem markdown, sem explicações.",
  "Exemplo de saída: [{\"description\":\"Aluguel\",\"date\":\"2026-04-01\",\"amount\":1200.00,\"suggested_category\":\"Moradia\"}, ...]",
  "CSV:",
  csvContent,
].join("\n");

async function tryGemini(csvContent: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Usando gemini-1.5-pro que é estável e suporta respostas longas
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    generationConfig: {
      maxOutputTokens: 16000
    }
  });
  const result = await model.generateContent(rigidPrompt(csvContent));
  return result.response.text();
}

async function tryGroq(csvContent: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "YOUR_GROQ_API_KEY") {
    throw new Error("GROQ_API_KEY não configurada.");
  }

  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: rigidPrompt(csvContent),
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    max_tokens: 16000, // Aumentar limite de tokens na resposta
  });

  return completion.choices[0]?.message?.content ?? "";
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

    let text: string;
    let usedProvider = "";

    try {
      text = await tryGemini(csvContent);
      usedProvider = "Gemini";
    } catch (geminiError) {
      console.warn("Gemini falhou, tentando Groq:", geminiError);
      try {
        text = await tryGroq(csvContent);
        usedProvider = "Groq";
      } catch (groqError) {
        console.error("Groq também falhou:", groqError);
        return NextResponse.json(
          {
            error:
              "Ambas APIs de IA falharam. Configure GEMINI_API_KEY ou GROQ_API_KEY no .env.",
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

    return NextResponse.json({ ok: true, data: validated, provider: usedProvider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar fatura com IA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
