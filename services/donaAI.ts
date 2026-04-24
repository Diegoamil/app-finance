/**
 * Donna AI — Cérebro da Assistente Financeira (Agentic Flow)
 */

import OpenAI, { toFile } from "openai";
import { Pool } from "pg";
import {
  buildFinancialSnapshot,
  formatContextForPrompt,
  getUserByPhone,
} from "./financialContext.js";
import { getMediaBase64, WebhookPayload } from "./evolutionAPI.js";

let openai: OpenAI;
let pool: Pool;

export function initDonnaAI(openaiApiKey: string, dbPool: Pool) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  pool = dbPool;
}

interface DonnaResponse {
  intent: string;
  messages: string[];
  transactionSaved?: boolean;
}

const donnaTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "save_transaction",
      description: "Salva UMA transação financeira comum no banco. SÓ CHAME APÓS CONFIRMAÇÃO DO USUÁRIO.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense", "transfer"] },
          amount: { type: "number" },
          category: { type: "string", enum: ["Essencial", "Importante", "Supérfluo", "Outros"] },
          description: { type: "string" },
          estabelecimento: { type: "string" },
          date: { type: "string" },
          account: { type: "string", description: "Nome da conta. Ex: Nubank, Bradesco" },
          payment_method: { type: "string", enum: ["Pix", "Débito", "Crédito", "Dinheiro", "Outro"] },
          third_party: { type: "string", description: "Nome da pessoa, caso seja um gasto de terceiros (ex: Cunhada)." }
        },
        required: ["type", "amount", "category", "description", "estabelecimento", "date", "account", "payment_method"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "batch_save_transactions",
      description: "Salva MÚLTIPLAS transações de uma vez só. Útil para importar arquivos CSV de extratos lidos. SÓ CHAME APÓS MOSTRAR O RESUMO E OBTER CONFIRMAÇÃO DO USUÁRIO.",
      parameters: {
        type: "object",
        properties: {
          transactions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["income", "expense", "transfer"] },
                amount: { type: "number" },
                category: { type: "string" },
                description: { type: "string" },
                estabelecimento: { type: "string" },
                date: { type: "string" },
                account: { type: "string" },
                payment_method: { type: "string" }
              },
              required: ["type", "amount", "category", "description", "estabelecimento", "date", "account", "payment_method"]
            }
          }
        },
        required: ["transactions"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "register_credit_card",
      description: "Cadastra um novo cartão de crédito. Chame esta função se o usuário gastar num cartão não cadastrado ou pedir para cadastrar.",
      parameters: {
        type: "object",
        properties: {
          card_name: { type: "string", description: "Ex: Nubank, Bradesco" },
          closing_day: { type: "number", description: "Dia de fechamento/virada da fatura (ex: 5)." },
          due_day: { type: "number", description: "Dia de vencimento da fatura (ex: 15)." }
        },
        required: ["card_name", "closing_day", "due_day"]
      }
    }
  }
];

// ═══════════════════════════════════════════
// PROMPT DA DONNA
// ═══════════════════════════════════════════

function buildSystemPrompt(userName: string, financialContext: string, registeredCards: string): string {
  const today = new Date().toISOString().split("T")[0];
  
  return `Você é a *Donna*, agente financeira pessoal do(a) ${userName}.
Data de hoje: ${today}

Cartões Cadastrados Atualmente: ${registeredCards}

${financialContext}

REGRAS INVIOLÁVEIS PARA CARTÕES DE CRÉDITO:
1. Se a compra foi no crédito (ou o recibo indicar "Cartão de Crédito"), você DEVE saber o nome exato do cartão.
2. Se a conta ou cartão NÃO constar na sua lista de "Cartões Cadastrados" acima, VOCÊ ESTÁ PROIBIDA de salvar a transação e proibida de pedir confirmação.
3. Se esbarrar na Regra 2, PARE O FLUXO e responda algo como: "Vi que a compra foi no crédito, mas em qual cartão? Me diga o nome, o dia de fechamento e o vencimento para eu cadastrá-lo antes de lançar."

FLUXO DE REGISTRO GERAL:
1. Extraia os dados. Verifique a Regra Inviolável do Cartão.
2. Se o cartão for conhecido, apresente o resumo da compra com clareza e PERGUNTE se pode registrar no banco de dados.
3. SOMENTE APÓS O USUÁRIO DIGITAR "Sim/Pode salvar", você aciona a ferramenta de salvar.

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO (MÚLTIPLAS MENSAGENS):
- É EXTREMAMENTE PROIBIDO enviar textos longos. Você DEVE separar seus assuntos em balões menores usando EXATAMENTE o separador oculto "|||".
- Exemplo de Resposta: "🛒 Vi aqui a compra de R$ 300 no Supermercado. ||| 💳 Mas em qual cartão de crédito foi? Me passa o fechamento e vencimento dele pra eu cadastrar."
- NUNCA envie contas matemáticas chatas. Mostre apenas o resultado do novo saldo se a compra for confirmada.`;
}

// ═══════════════════════════════════════════
// BANCO DE DADOS
// ═══════════════════════════════════════════

async function saveTransaction(whatsapp: string, tx: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    await pool.query(
      `INSERT INTO transactions (whatsapp, type, amount, category, date, description, estabelecimento, account, payment_method, third_party) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [user.whatsapp, tx.type, Math.abs(parseFloat(tx.amount)), tx.category, tx.date, tx.description, tx.estabelecimento, tx.account, tx.payment_method, tx.third_party || null]
    );
    return true;
  } catch (error) {
    console.error("[DONNA] Erro ao salvar transação:", error);
    return false;
  }
}

async function batchSaveTransactions(whatsapp: string, transactions: any[]): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    for (const tx of transactions) {
      await pool.query(
        `INSERT INTO transactions (whatsapp, type, amount, category, date, description, estabelecimento, account, payment_method) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.whatsapp, tx.type, Math.abs(parseFloat(tx.amount)), tx.category, tx.date, tx.description, tx.estabelecimento, tx.account, tx.payment_method]
      );
    }
    return true;
  } catch (error) {
    console.error("[DONNA] Erro ao salvar transações em lote:", error);
    return false;
  }
}

async function registerCreditCard(whatsapp: string, cardData: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    await pool.query(
      `INSERT INTO credit_cards (whatsapp, card_name, closing_day, due_day) VALUES ($1, $2, $3, $4)
       ON CONFLICT (whatsapp, card_name) DO UPDATE SET closing_day = $3, due_day = $4`,
      [user.whatsapp, cardData.card_name, cardData.closing_day, cardData.due_day]
    );
    return true;
  } catch (error) {
    console.error("[DONNA] Erro ao registrar cartão:", error);
    return false;
  }
}

async function getRegisteredCards(whatsapp: string): Promise<string> {
  try {
    const result = await pool.query(`SELECT card_name, closing_day, due_day FROM credit_cards WHERE whatsapp = $1`, [whatsapp]);
    if (result.rows.length === 0) return "Nenhum cartão cadastrado.";
    return result.rows.map(r => `${r.card_name} (Fecha dia ${r.closing_day}, Vence dia ${r.due_day})`).join(" | ");
  } catch (error) {
    return "Erro ao buscar cartões.";
  }
}

async function saveChatMessage(whatsapp: string, role: "user" | "assistant", content: string): Promise<void> {
  try {
    await pool.query(`INSERT INTO chat_messages (whatsapp, role, content) VALUES ($1, $2, $3)`, [whatsapp, role, content]);
  } catch (e) {}
}

async function getRecentChatHistory(whatsapp: string, limit = 8): Promise<any[]> {
  try {
    const result = await pool.query(`SELECT role, content FROM chat_messages WHERE whatsapp = $1 ORDER BY created_at DESC LIMIT $2`, [whatsapp, limit]);
    return result.rows.reverse();
  } catch (e) { return []; }
}

// ═══════════════════════════════════════════
// AGENTIC FLOW PRINCIPAL
// ═══════════════════════════════════════════

export async function processDonnaMessage(payload: WebhookPayload): Promise<DonnaResponse> {
  console.log(`[DONNA] Processando: ${payload.phone}`);

  const user = await getUserByPhone(payload.phone);
  if (!user) {
    return { intent: "greeting", messages: ["Oi! Cadastre-se primeiro pelo app. 📊"] };
  }

  let userMessageContent: any = payload.messageText;
  let textForDb = payload.messageText;

  if (payload.hasMedia && payload.rawMessage && payload.rawMessage.message) {
    const mediaData = await getMediaBase64(payload.rawMessage);
    if (mediaData) {
      if (payload.rawMessage.message.audioMessage) {
        // ÁUDIO
        const buffer = Buffer.from(mediaData.base64, "base64");
        const file = await toFile(buffer, "audio.ogg", { type: mediaData.mimetype || "audio/ogg" });
        const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
        userMessageContent = `[Áudio Transcrito]: "${transcription.text}"`;
        textForDb = userMessageContent;
      } 
      else if (payload.rawMessage.message.imageMessage) {
        // IMAGEM
        const imageUrl = `data:${mediaData.mimetype || "image/jpeg"};base64,${mediaData.base64}`;
        userMessageContent = [{ type: "text", text: "Analise este comprovante." }, { type: "image_url", image_url: { url: imageUrl } }];
        textForDb = "[Imagem Enviada]";
      }
      else if (payload.rawMessage.message.documentMessage) {
        // DOCUMENTO (Ex: CSV)
        console.log("[DONNA] Documento detectado, extraindo texto...");
        try {
          const decodedText = Buffer.from(mediaData.base64, "base64").toString("utf-8");
          // Pega os primeiros 20.000 caracteres para não estourar os limites da API atoa
          userMessageContent = `[Arquivo CSV/Documento Enviado]\nPor favor, leia este extrato e me resuma as transações:\n\n${decodedText.substring(0, 20000)}`;
          textForDb = `[Arquivo CSV Enviado - Primeiros caracteres: ${decodedText.substring(0, 50)}...]`;
        } catch (e) {
          console.error("[DONNA] Erro ao decodificar documento:", e);
        }
      }
    }
  }

  if (!userMessageContent) {
    userMessageContent = "[Mensagem vazia ou mídia não suportada]";
    textForDb = userMessageContent;
  }

  await saveChatMessage(payload.phone, "user", textForDb);

  const snapshot = await buildFinancialSnapshot(payload.phone);
  const financialContext = snapshot ? formatContextForPrompt(snapshot) : "Nenhum dado encontrado.";
  const registeredCards = await getRegisteredCards(payload.phone);
  
  const chatHistory = await getRecentChatHistory(payload.phone, 8);
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt(user.name, financialContext, registeredCards) },
    ...chatHistory,
    { role: "user", content: userMessageContent }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 1500,
    messages,
    tools: donnaTools,
  });

  const responseMessage = response.choices[0].message;
  let finalReply = responseMessage.content || "";
  let transactionSaved = false;

  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.function.name === "save_transaction") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await saveTransaction(payload.phone, args);
        transactionSaved = success;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? "Transação salva." : "Erro ao salvar." });
      }
      else if (toolCall.function.name === "batch_save_transactions") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await batchSaveTransactions(payload.phone, args.transactions);
        transactionSaved = success;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `Lote de ${args.transactions.length} transações salvo com sucesso.` : "Erro ao salvar lote." });
      }
      else if (toolCall.function.name === "register_credit_card") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await registerCreditCard(payload.phone, args);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `Cartão ${args.card_name} registrado com sucesso. Dias de fechamento e vencimento gravados.` : "Erro ao registrar cartão." });
      }
    }

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 800,
      messages,
    });
    finalReply = secondResponse.choices[0].message.content || finalReply;
  }

  if (!finalReply) finalReply = "Ocorreu um erro interno na resposta.";

  await saveChatMessage(payload.phone, "assistant", finalReply.replace(/\|\|\|/g, "\n"));
  
  const splitMessages = finalReply.split("|||").map(m => m.trim()).filter(m => m.length > 0);

  return { intent: "agent_flow", messages: splitMessages, transactionSaved };
}
