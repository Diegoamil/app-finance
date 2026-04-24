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

const pendingImports = new Map<string, any[]>();

let openai: OpenAI;
let pool: Pool;

// ═══════════════════════════════════════════
// PARSER NATIVO DE CSV (À PROVA DE FALHAS MATEMÁTICAS)
// ═══════════════════════════════════════════
function parseBankCSV(csvText: string): any[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].toLowerCase().split(delimiter).map(h => h.replace(/["\r]/g, ''));
  
  let dateIdx = -1, amountIdx = -1, descIdx = -1;
  headers.forEach((h, i) => {
    if (h.includes('data') || h.includes('date')) dateIdx = i;
    if (h.includes('valor') || h.includes('amount')) amountIdx = i;
    if (h.includes('descri') || h.includes('hist') || h.includes('título') || h.includes('identificador')) descIdx = i;
  });

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.replace(/["\r]/g, ''));
    if (cols.length < 2) continue;
    
    let dateStr = dateIdx !== -1 ? cols[dateIdx] : cols[0];
    let amountStr = amountIdx !== -1 ? cols[amountIdx] : cols.find(c => !isNaN(parseFloat(c.replace(',','.'))));
    let descStr = descIdx !== -1 ? cols[descIdx] : cols.length > 3 ? cols[3] : cols[1];

    if (!amountStr) continue;

    let cleanAmount = amountStr.replace(/[R$\s]/gi, '');
    if (cleanAmount.includes(',') && cleanAmount.includes('.')) {
      if (cleanAmount.lastIndexOf(',') > cleanAmount.lastIndexOf('.')) {
        // Padrão BRL: 1.500,00
        cleanAmount = cleanAmount.replace(/\./g, '').replace(',', '.');
      } else {
        // Padrão US: 1,500.00
        cleanAmount = cleanAmount.replace(/,/g, '');
      }
    } else if (cleanAmount.includes(',')) {
      // Apenas vírgula: 1500,00
      cleanAmount = cleanAmount.replace(',', '.');
    }
    // Se só tiver ponto (150.00), o parseFloat nativo já resolve.

    let amountNum = parseFloat(cleanAmount);
    if (isNaN(amountNum)) continue;

    let finalDate = new Date().toISOString().split('T')[0];
    if (dateStr && dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) finalDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        else finalDate = `20${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    } else if (dateStr && dateStr.includes('-')) {
      finalDate = dateStr;
    }

    const type = amountNum < 0 ? 'expense' : 'income';
    const descLower = (descStr || '').toLowerCase();
    let category = "Outros";
    if (descLower.includes('ifood') || descLower.includes('uber') || descLower.includes('netflix') || descLower.includes('ifd')) category = "Supérfluo";
    else if (descLower.includes('mercado') || descLower.includes('farmacia') || descLower.includes('conta') || descLower.includes('energia')) category = "Essencial";

    transactions.push({
      type,
      amount: Math.abs(amountNum),
      category,
      description: descStr || 'Importado via CSV',
      estabelecimento: descStr || 'CSV',
      date: finalDate,
      account: 'Importação CSV',
      payment_method: 'Outro'
    });
  }
  return transactions;
}

export function initDonnaAI(openaiApiKey: string, dbPool: Pool) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  pool = dbPool;
}

interface DonnaResponse {
  intent: string;
  messages: string[];
  transactionSaved?: boolean;
}

// ═══════════════════════════════════════════
// TOOLS (FERRAMENTAS DA DONNA)
// ═══════════════════════════════════════════

const donnaTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "confirm_pending_import",
      description: "Confirma a importação de um lote de transações CSV que o sistema já processou em background. SÓ CHAME APÓS O USUÁRIO RESPONDER SIM/PODE SALVAR.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "save_transaction",
      description: "Salva UMA transação financeira comum (à vista). SÓ CHAME APÓS CONFIRMAÇÃO DO USUÁRIO.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense", "transfer"] },
          amount: { type: "number" },
          category: { type: "string", enum: ["Essencial", "Importante", "Supérfluo", "Outros"] },
          description: { type: "string" },
          estabelecimento: { type: "string" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD." },
          account: { type: "string", description: "Nome exato do banco ou cartão. Ex: Nubank, Bradesco." },
          payment_method: { type: "string", enum: ["Pix", "Débito", "Crédito", "Dinheiro", "Outro"] }
        },
        required: ["type", "amount", "category", "description", "estabelecimento", "date", "account", "payment_method"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_installment_purchase",
      description: "Salva uma compra PARCELADA no cartão de crédito. Fatiará o valor em múltiplos meses. SÓ CHAME APÓS CONFIRMAÇÃO DO USUÁRIO.",
      parameters: {
        type: "object",
        properties: {
          total_amount: { type: "number", description: "O valor total da compra." },
          installments: { type: "number", description: "O número de parcelas. Ex: se for 2x, mande 2." },
          category: { type: "string" },
          description: { type: "string" },
          estabelecimento: { type: "string" },
          purchase_date: { type: "string", description: "Data da compra em YYYY-MM-DD." },
          account: { type: "string", description: "Nome exato do cartão de crédito cadastrado." }
        },
        required: ["total_amount", "installments", "category", "description", "estabelecimento", "purchase_date", "account"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_credit_card_invoice",
      description: "Consulta o valor total da fatura de um cartão de crédito em um mês específico.",
      parameters: {
        type: "object",
        properties: {
          account: { type: "string", description: "Nome exato do cartão. Ex: Cartão Elo Nanquin do Bradesco" },
          month: { type: "number", description: "Mês (1 a 12)." },
          year: { type: "number", description: "Ano (Ex: 2026)." }
        },
        required: ["account", "month", "year"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "register_credit_card",
      description: "Cadastra um novo cartão de crédito. Chame esta função APENAS DEPOIS que o usuário informar o nome do cartão, dia de fechamento e dia de vencimento.",
      parameters: {
        type: "object",
        properties: {
          card_name: { type: "string", description: "Ex: Nubank, Bradesco" },
          closing_day: { type: "number", description: "Dia de fechamento/virada da fatura." },
          due_day: { type: "number", description: "Dia de vencimento da fatura." }
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

REGRAS DE IMPORTAÇÃO DE EXTRATOS (CSV):
1. Quando o sistema avisar que processou um CSV automaticamente, você receberá os totais exatos de Receitas e Despesas calculados matematicamente pelo servidor.
2. NUNCA tente refazer os cálculos. Apenas comunique os totais exatos que o sistema te enviar.
3. OBRIGATÓRIO: Termine a sua resposta SEMPRE com a pergunta: "Posso salvar essas transações no sistema para você?"
4. Quando o usuário disser "Sim", chame a ferramenta 'confirm_pending_import'.

REGRAS INVIOLÁVEIS SOBRE CARTÕES DE CRÉDITO:
1. NUNCA assuma que a palavra "Cartão de Crédito" é o nome da conta. Você DEVE saber a qual banco ele pertence (Ex: Nubank, Bradesco Elo).
2. Se o usuário comprou no crédito, verifique se o nome exato do cartão está na lista de "Cartões Cadastrados Atualmente".
3. Se NÃO ESTIVER, você ESTÁ PROIBIDA de mostrar o resumo da compra ou perguntar se pode salvar. PARE TUDO e diga: "Vi que foi no crédito, mas em qual cartão? Preciso do nome, dia de fechamento e dia de vencimento para cadastrar primeiro."
4. NUNCA salve NADA (parcelado ou à vista) sem antes mostrar o resumo completo e obter um "Sim/Pode salvar" explícito do usuário.
5. Se for compra parcelada (ex: 2x, 10x), use SEMPRE a ferramenta 'save_installment_purchase', não use 'save_transaction'.

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO (O SEPARADOR |||):
- VOCÊ É OBRIGADA A DIVIDIR SUAS RESPOSTAS! Nunca envie um bloco denso de texto!
- Use o separador EXATO "|||" entre cada parte da sua fala.
- Exemplo Correto: "✅ Lançamento pronto para salvar! ||| 🛒 O valor foi R$ 300 no Cartão Nubank. Posso registrar?"
- Exemplo Incorreto: "✅ Lançamento pronto. O valor foi R$ 300. Posso registrar?" (Faltou o |||)
- Fim das equações matemáticas visíveis (não mostre 487 - 300 = 187). Mostre só o total.`;
}

// ═══════════════════════════════════════════
// LÓGICAS DE BANCO DE DADOS
// ═══════════════════════════════════════════

async function saveTransaction(whatsapp: string, tx: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    // Se for no crédito à vista, precisamos lançar o gasto no dia do VENCIMENTO da fatura
    if (tx.payment_method === 'Crédito') {
      const cardRes = await pool.query('SELECT closing_day, due_day FROM credit_cards WHERE whatsapp = $1 AND card_name = $2', [user.whatsapp, tx.account]);
      if (cardRes.rows.length > 0) {
        const card = cardRes.rows[0];
        const pDate = new Date(tx.date);
        let dueMonth = pDate.getMonth();
        let dueYear = pDate.getFullYear();

        if (pDate.getDate() >= card.closing_day) dueMonth++;
        if (card.due_day < card.closing_day) dueMonth++; // Ex: fecha 25, vence 5 do mês seguinte

        const dueDate = new Date(dueYear, dueMonth, card.due_day);
        tx.date = dueDate.toISOString().split('T')[0];
      }
    }

    await pool.query(
      `INSERT INTO transactions (whatsapp, type, amount, category, date, description, estabelecimento, account, payment_method) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.whatsapp, tx.type, Math.abs(parseFloat(tx.amount)), tx.category, tx.date, tx.description, tx.estabelecimento, tx.account, tx.payment_method]
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function batchSaveTransactions(whatsapp: string, transactions: any[]): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    for (const tx of transactions) {
      if (tx.payment_method === 'Crédito') {
        const cardRes = await pool.query('SELECT closing_day, due_day FROM credit_cards WHERE whatsapp = $1 AND card_name = $2', [user.whatsapp, tx.account]);
        if (cardRes.rows.length > 0) {
          const card = cardRes.rows[0];
          const pDate = new Date(tx.date);
          let dueMonth = pDate.getMonth();
          let dueYear = pDate.getFullYear();
          if (pDate.getDate() >= card.closing_day) dueMonth++;
          if (card.due_day < card.closing_day) dueMonth++;
          const dueDate = new Date(dueYear, dueMonth, card.due_day);
          tx.date = dueDate.toISOString().split('T')[0];
        }
      }
      await pool.query(
        `INSERT INTO transactions (whatsapp, type, amount, category, date, description, estabelecimento, account, payment_method) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.whatsapp, tx.type, Math.abs(parseFloat(tx.amount)), tx.category, tx.date, tx.description, tx.estabelecimento, tx.account, tx.payment_method]
      );
    }
    return true;
  } catch (error) {
    console.error("[DONNA] Erro no lote:", error);
    return false;
  }
}

async function saveInstallmentPurchase(whatsapp: string, tx: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    const cardRes = await pool.query('SELECT closing_day, due_day FROM credit_cards WHERE whatsapp = $1 AND card_name = $2', [user.whatsapp, tx.account]);
    if (cardRes.rows.length === 0) return false;
    const card = cardRes.rows[0];

    const pDate = new Date(tx.purchase_date);
    let dueMonth = pDate.getMonth();
    let dueYear = pDate.getFullYear();

    if (pDate.getDate() >= card.closing_day) dueMonth++;
    if (card.due_day < card.closing_day) dueMonth++;

    const firstDueDate = new Date(dueYear, dueMonth, card.due_day);
    const installmentAmount = Math.abs(parseFloat(tx.total_amount)) / tx.installments;

    for (let i = 0; i < tx.installments; i++) {
      const dueDate = new Date(firstDueDate);
      dueDate.setMonth(dueDate.getMonth() + i); // Adiciona meses
      
      const dateStr = dueDate.toISOString().split('T')[0];
      const installmentInfo = `${i + 1}/${tx.installments}`;

      await pool.query(
        `INSERT INTO transactions (whatsapp, type, amount, category, date, description, estabelecimento, account, payment_method, installment_info) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [user.whatsapp, 'expense', installmentAmount, tx.category, dateStr, tx.description, tx.estabelecimento, tx.account, 'Crédito', installmentInfo]
      );
    }
    return true;
  } catch (error) {
    console.error("[DONNA] Erro no parcelamento:", error);
    return false;
  }
}

async function getCreditCardInvoice(whatsapp: string, account: string, month: number, year: number): Promise<string> {
  try {
    const res = await pool.query(`
      SELECT SUM(amount) as total, COUNT(*) as count 
      FROM transactions 
      WHERE whatsapp = $1 AND account = $2 AND payment_method = 'Crédito' 
      AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(YEAR FROM date) = $4`, 
      [whatsapp, account, month, year]
    );
    
    if (res.rows.length === 0 || res.rows[0].total === null) {
      return `Não há compras para a fatura do ${account} em ${month}/${year}.`;
    }
    return `A fatura do ${account} em ${month}/${year} é de R$ ${parseFloat(res.rows[0].total).toFixed(2)} (${res.rows[0].count} parcelas/compras).`;
  } catch (e) {
    return "Erro ao consultar a fatura.";
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
// AGENTIC FLOW
// ═══════════════════════════════════════════

export async function processDonnaMessage(payload: WebhookPayload): Promise<DonnaResponse> {
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
        const buffer = Buffer.from(mediaData.base64, "base64");
        const file = await toFile(buffer, "audio.ogg", { type: mediaData.mimetype || "audio/ogg" });
        const transcription = await openai.audio.transcriptions.create({ file, model: "whisper-1" });
        userMessageContent = `[Áudio Transcrito]: "${transcription.text}"`;
        textForDb = userMessageContent;
      } 
      else if (payload.rawMessage.message.imageMessage) {
        const imageUrl = `data:${mediaData.mimetype || "image/jpeg"};base64,${mediaData.base64}`;
        userMessageContent = [{ type: "text", text: "Analise este comprovante." }, { type: "image_url", image_url: { url: imageUrl } }];
        textForDb = "[Imagem Enviada]";
      }
      else if (payload.rawMessage.message.documentMessage) {
        try {
          const decodedText = Buffer.from(mediaData.base64, "base64").toString("utf-8");
          const txs = parseBankCSV(decodedText);
          
          if (txs.length === 0) {
            userMessageContent = `[SISTEMA]: Falha ao tentar ler as colunas do arquivo CSV.`;
          } else {
            let income = 0; let expense = 0;
            txs.forEach(t => { if(t.type === 'income') income += t.amount; else expense += t.amount; });
            
            // Cacheia no servidor
            pendingImports.set(payload.phone, txs);

            userMessageContent = `[SISTEMA - AÇÃO AUTOMÁTICA OBRIGATÓRIA]
O sistema interceptou o arquivo CSV e processou a matemática nativamente para evitar erros de cálculo.
Total de Linhas Identificadas: ${txs.length}
Total de Entradas (Receitas): R$ ${income.toFixed(2)}
Total de Saídas (Despesas): R$ ${expense.toFixed(2)}

SUA TAREFA AGORA: 
Apresente APENAS estes totais acima para o usuário (em formato limpo) e pergunte se ele deseja autorizar o registro destas ${txs.length} transações no banco de dados.`;
          }
          textForDb = `[Arquivo CSV Enviado e Calculado]`;
        } catch (e) {
          console.error("[DONNA] Erro no CSV Parser:", e);
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
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? "Transação à vista salva na fatura correspondente." : "Erro ao salvar." });
      }
      else if (toolCall.function.name === "confirm_pending_import") {
        const txs = pendingImports.get(payload.phone);
        let success = false;
        if (txs && txs.length > 0) {
          success = await batchSaveTransactions(payload.phone, txs);
          pendingImports.delete(payload.phone); // Limpa o cache
        }
        transactionSaved = success;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `Lote importado com sucesso no banco de dados.` : "Erro: Nenhum lote pendente encontrado na memória." });
      }
      else if (toolCall.function.name === "save_installment_purchase") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await saveInstallmentPurchase(payload.phone, args);
        transactionSaved = success;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `${args.installments} parcelas salvas nas faturas futuras.` : "Erro ao salvar parcelas." });
      }
      else if (toolCall.function.name === "get_credit_card_invoice") {
        const args = JSON.parse(toolCall.function.arguments);
        const invoiceText = await getCreditCardInvoice(payload.phone, args.account, args.month, args.year);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: invoiceText });
      }
      else if (toolCall.function.name === "register_credit_card") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await registerCreditCard(payload.phone, args);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `Cartão cadastrado. Prossiga com o salvamento da compra (peça confirmação primeiro).` : "Erro ao registrar cartão." });
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

  // Fallback para forçar separador se ela ainda esquecer
  if (finalReply && !finalReply.includes("|||")) {
    finalReply = finalReply.replace(/\n\n/g, " ||| ");
  }

  await saveChatMessage(payload.phone, "assistant", finalReply.replace(/\|\|\|/g, "\n"));
  
  const splitMessages = finalReply.split("|||").map(m => m.trim()).filter(m => m.length > 0);

  return { intent: "agent_flow", messages: splitMessages, transactionSaved };
}
