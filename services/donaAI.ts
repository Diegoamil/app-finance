/**
 * Donna AI — Cérebro da Assistente Financeira
 * 
 * Inspirada em Donna Paulsen (Suits): confiante, estratégica, com leve ironia.
 * Classifica intenções, extrai transações, e gera análises financeiras contextualizadas.
 */

import OpenAI from "openai";
import { Pool } from "pg";
import {
  buildFinancialSnapshot,
  formatContextForPrompt,
  getUserByPhone,
  countWeeklyByEstablishment,
  type FinancialSnapshot,
} from "./financialContext.js";

let openai: OpenAI;
let pool: Pool;

export function initDonnaAI(openaiApiKey: string, dbPool: Pool) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  pool = dbPool;
}

// ═══════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════

type Intent = "transaction" | "question" | "analysis" | "greeting";

interface TransactionData {
  type: "income" | "expense";
  amount: number;
  category: "Essencial" | "Importante" | "Supérfluo";
  description: string;
  estabelecimento: string;
  date: string;
}

interface DonnaResponse {
  intent: Intent;
  message: string;
  transactionSaved?: boolean;
}

// ═══════════════════════════════════════════
// SYSTEM PROMPT DA DONNA
// ═══════════════════════════════════════════

function buildSystemPrompt(userName: string, financialContext: string): string {
  return `Você é a *Donna*, agente financeira pessoal do(a) ${userName}.

Sua personalidade é inspirada em Donna Paulsen (Suits):
- Comunicação clara, direta e estratégica
- Alto nível de inteligência emocional
- Capacidade de identificar inconsistências nas decisões do usuário
- Tom confiante, elegante e objetivo
- Não seja robótica nem excessivamente formal
- Pode usar leve ironia quando fizer sentido — você tem personalidade

${financialContext}

COMPORTAMENTO:
1. Sempre priorize decisões financeiras inteligentes
2. Questione o usuário quando houver incoerência (ex: "Você disse que queria economizar, mas é o terceiro iFood essa semana...")
3. Antecipe próximos passos — não espere o usuário perguntar
4. Evite respostas genéricas ou superficiais — vá direto ao ponto com dados reais
5. Seja prática e orientada a resultado
6. Use a metodologia 50/30/20 como referência para o orçamento

ESTILO DE COMUNICAÇÃO:
- Fale como alguém experiente no mundo corporativo e financeiro
- Frases curtas e assertivas
- Use formatação WhatsApp: *negrito*, _itálico_, ~riscado~
- Emojis com moderação e propósito (✅ 📊 💡 ⚠️), nunca excessivos
- Quando registrar uma transação, sempre mostre o impacto no orçamento
- Seja humana — reconheça vitórias, não só problemas

OBJETIVO CENTRAL:
Ajudar ${userName} a tomar melhores decisões financeiras com clareza, controle e estratégia. Você não é uma calculadora — é uma parceira financeira que se importa com o resultado.

REGRAS DE FORMATAÇÃO:
- Mantenha respostas concisas (máximo 300 palavras)
- Use quebras de linha para separar seções
- Nunca use markdown de código (\`\`\`) — apenas formatação WhatsApp`;
}

// ═══════════════════════════════════════════
// CLASSIFICAÇÃO DE INTENÇÃO
// ═══════════════════════════════════════════

async function classifyIntent(message: string): Promise<Intent> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content: `Classifique a intenção da mensagem do usuário em EXATAMENTE uma das categorias:
- "transaction": O usuário está reportando um gasto, despesa, receita ou entrada de dinheiro. Exemplos: "gastei 50 no ifood", "paguei 200 de luz", "recebi meu salário de 5000", "almocei por 35 reais"
- "question": O usuário está fazendo uma pergunta específica. Exemplos: "quanto gastei com comida?", "devo comprar um celular novo?", "qual meu maior gasto?"
- "analysis": O usuário quer uma análise geral ou resumo financeiro. Exemplos: "como estou esse mês?", "me dá um resumo", "como estão minhas finanças?", "manda o relatório"
- "greeting": O usuário está cumprimentando ou mandando algo casual. Exemplos: "oi", "bom dia", "e aí Donna"

Responda APENAS com a palavra da categoria, nada mais.`,
        },
        { role: "user", content: message },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() as Intent;
    
    if (["transaction", "question", "analysis", "greeting"].includes(result)) {
      return result;
    }

    // Fallback: se a classificação falhar, tenta detectar por heurística
    const lower = message.toLowerCase();
    if (lower.match(/gast(ei|ou|amos)|pagu(ei|ou)|comprei|recebi|salário|entrada|saída|boleto|conta de|\d+\s*(reais|conto|real|r\$)/)) {
      return "transaction";
    }
    if (lower.match(/\?|quanto|qual|como|devo|posso|consigo/)) {
      return "question";
    }
    if (lower.match(/resumo|relatório|análise|balanço|como (estou|tô|to)|me (dá|da|manda)/)) {
      return "analysis";
    }

    return "greeting";
  } catch (error) {
    console.error("[DONNA] Erro ao classificar intenção:", error);
    return "greeting"; // safe fallback
  }
}

// ═══════════════════════════════════════════
// EXTRAÇÃO DE TRANSAÇÃO
// ═══════════════════════════════════════════

async function extractTransaction(message: string): Promise<TransactionData | null> {
  try {
    const today = new Date().toISOString().split("T")[0];
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extraia os dados da transação financeira da mensagem do usuário.
Retorne um JSON com exatamente estes campos:
{
  "type": "income" ou "expense",
  "amount": número decimal (ex: 45.90),
  "category": uma entre "Essencial", "Importante" ou "Supérfluo",
  "description": descrição curta da transação,
  "estabelecimento": nome do estabelecimento ou local (se mencionado, senão use a descrição),
  "date": data no formato YYYY-MM-DD (se não mencionada, use ${today})
}

REGRAS DE CATEGORIZAÇÃO:
- "Essencial": moradia, alimentação básica, saúde, medicamentos, água, luz, gás, mercado, supermercado
- "Importante": transporte, educação, combustível, manutenção, seguros
- "Supérfluo": delivery/iFood, restaurantes, assinaturas streaming, roupas, lazer, games, bares, café, shopping

Se o usuário mencionar "recebi", "salário", "freelance", "pagamento" como entrada, o type é "income" e a category deve ser "Essencial".
Se não conseguir extrair, retorne: { "error": true }`,
        },
        { role: "user", content: message },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (parsed.error) return null;

    // Validação básica
    if (!parsed.type || !parsed.amount || isNaN(parsed.amount)) return null;
    if (parsed.type !== "income" && parsed.type !== "expense") return null;

    return {
      type: parsed.type,
      amount: Math.abs(parseFloat(parsed.amount)),
      category: parsed.category || "Supérfluo",
      description: parsed.description || "",
      estabelecimento: parsed.estabelecimento || parsed.description || "",
      date: parsed.date || today,
    };
  } catch (error) {
    console.error("[DONNA] Erro ao extrair transação:", error);
    return null;
  }
}

// ═══════════════════════════════════════════
// SALVAR TRANSAÇÃO NO BANCO
// ═══════════════════════════════════════════

async function saveTransaction(whatsapp: string, tx: TransactionData): Promise<boolean> {
  try {
    // Encontrar o whatsapp exato do usuário no banco
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    await pool.query(
      `INSERT INTO transactions 
        (whatsapp, type, amount, category, date, description, estabelecimento) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.whatsapp, tx.type, tx.amount, tx.category, tx.date, tx.description, tx.estabelecimento]
    );

    return true;
  } catch (error) {
    console.error("[DONNA] Erro ao salvar transação:", error);
    return false;
  }
}

// ═══════════════════════════════════════════
// SALVAR MENSAGEM NO HISTÓRICO
// ═══════════════════════════════════════════

async function saveChatMessage(
  whatsapp: string,
  role: "user" | "assistant",
  content: string,
  intent?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_messages (whatsapp, role, content, intent) VALUES ($1, $2, $3, $4)`,
      [whatsapp, role, content, intent || null]
    );
  } catch (error) {
    console.error("[DONNA] Erro ao salvar mensagem:", error);
  }
}

// ═══════════════════════════════════════════
// BUSCAR HISTÓRICO RECENTE
// ═══════════════════════════════════════════

async function getRecentChatHistory(
  whatsapp: string,
  limit = 10
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const result = await pool.query(
      `SELECT role, content FROM chat_messages 
       WHERE whatsapp = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [whatsapp, limit]
    );
    return result.rows.reverse(); // Mais antigo primeiro
  } catch (error) {
    return [];
  }
}

// ═══════════════════════════════════════════
// PROCESSAMENTO PRINCIPAL
// ═══════════════════════════════════════════

export async function processDonnaMessage(
  phone: string,
  userMessage: string
): Promise<DonnaResponse> {
  console.log(`[DONNA] 📩 Mensagem de ${phone}: "${userMessage}"`);

  // 1. Buscar usuário
  const user = await getUserByPhone(phone);
  if (!user) {
    return {
      intent: "greeting",
      message: "Oi! Parece que você ainda não tem uma conta no Moneed. Cadastre-se primeiro pelo app para eu poder te ajudar com suas finanças. 📊",
    };
  }

  // 2. Salvar mensagem do usuário
  await saveChatMessage(phone, "user", userMessage);

  // 3. Classificar intenção
  const intent = await classifyIntent(userMessage);
  console.log(`[DONNA] 🎯 Intenção: ${intent}`);

  // 4. Buscar contexto financeiro
  const snapshot = await buildFinancialSnapshot(phone);
  const financialContext = snapshot ? formatContextForPrompt(snapshot) : "Nenhum dado financeiro encontrado ainda.";

  let donnaMessage: string;
  let transactionSaved = false;

  // 5. Processar por intenção
  if (intent === "transaction") {
    donnaMessage = await handleTransaction(phone, userMessage, user.name, financialContext, snapshot);
    transactionSaved = true;
  } else {
    donnaMessage = await handleConversation(phone, userMessage, user.name, financialContext, intent);
  }

  // 6. Salvar resposta da Donna
  await saveChatMessage(phone, "assistant", donnaMessage, intent);

  return {
    intent,
    message: donnaMessage,
    transactionSaved,
  };
}

// ═══════════════════════════════════════════
// HANDLERS POR TIPO
// ═══════════════════════════════════════════

async function handleTransaction(
  phone: string,
  userMessage: string,
  userName: string,
  financialContext: string,
  snapshot: FinancialSnapshot | null
): Promise<string> {
  // 1. Extrair dados da transação
  const txData = await extractTransaction(userMessage);
  
  if (!txData) {
    return "Hmm, não consegui entender os detalhes da transação. Me conta de novo: qual foi o valor, onde gastou e o que foi? 🤔";
  }

  // 2. Salvar no banco
  const saved = await saveTransaction(phone, txData);
  if (!saved) {
    return "⚠️ Tive um problema para salvar essa transação. Tenta de novo em alguns segundos?";
  }

  // 3. Buscar dados complementares para a resposta
  let weeklyCount = 0;
  if (txData.estabelecimento) {
    weeklyCount = await countWeeklyByEstablishment(phone, txData.estabelecimento);
  }

  // 4. Gerar resposta contextualizada com a Donna
  const updatedSnapshot = await buildFinancialSnapshot(phone);
  const updatedContext = updatedSnapshot ? formatContextForPrompt(updatedSnapshot) : financialContext;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(userName, updatedContext) + `

AÇÃO REALIZADA: Acabei de registrar uma transação com estes dados:
- Tipo: ${txData.type === "income" ? "Receita" : "Despesa"}
- Valor: R$ ${txData.amount.toFixed(2)}
- Local: ${txData.estabelecimento}
- Categoria: ${txData.category}
- Ocorrências desta semana neste local: ${weeklyCount}

Confirme o registro de forma breve e mostre o impacto no orçamento. Se houver padrão preocupante (ex: muitas compras no mesmo local), comente com sua ironia característica.`,
        },
        { role: "user", content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content || "✅ Registrado!";
  } catch (error) {
    console.error("[DONNA] Erro na resposta de transação:", error);
    // Fallback estático caso a IA falhe
    const emoji = txData.type === "income" ? "💰" : "💸";
    return `✅ *Registrado!*\n\n${emoji} ${txData.estabelecimento} — R$ ${txData.amount.toFixed(2)}\n🏷️ ${txData.category}`;
  }
}

async function handleConversation(
  phone: string,
  userMessage: string,
  userName: string,
  financialContext: string,
  intent: Intent
): Promise<string> {
  try {
    // Buscar histórico recente para contexto
    const chatHistory = await getRecentChatHistory(phone, 6);

    const messages: any[] = [
      {
        role: "system",
        content: buildSystemPrompt(userName, financialContext),
      },
    ];

    // Adicionar histórico
    chatHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Adicionar mensagem atual
    messages.push({
      role: "user",
      content: userMessage,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 500,
      messages,
    });

    return response.choices[0]?.message?.content || "Desculpa, tive um problema para processar isso. Tenta de novo? 🤔";
  } catch (error) {
    console.error("[DONNA] Erro na conversa:", error);
    return "⚠️ Estou com dificuldade para acessar os dados agora. Tenta daqui a pouco?";
  }
}
