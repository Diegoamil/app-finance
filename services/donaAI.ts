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
  },
  {
    type: "function",
    function: {
      name: "bank_transfer",
      description: "Registra uma transferência de valores entre bancos (ex: Pix entre contas próprias). NÃO gera despesa/receita no extrato, apenas move o saldo.",
      parameters: {
        type: "object",
        properties: {
          from_account: { type: "string", description: "Nome do banco de ORIGEM (onde sai o dinheiro)." },
          to_account: { type: "string", description: "Nome do banco de DESTINO (onde entra o dinheiro)." },
          amount: { type: "number", description: "Valor da transferência." }
        },
        required: ["from_account", "to_account", "amount"]
      }
    }
  }
];

// ═══════════════════════════════════════════
// PROMPT DA DONNA
// ═══════════════════════════════════════════

function buildSystemPrompt(userName: string, financialContext: string, registeredCards: string): string {
  const today = new Date().toISOString().split("T")[0];
  const dayOfMonth = new Date().getDate();
  
  return `Você é a *Donna*, assistente de finanças pessoais do(a) ${userName}.
Data de hoje: ${today} (Dia ${dayOfMonth} do mês)

═══════════════════════════════════════
QUEM VOCÊ É (SUA IDENTIDADE — NUNCA QUEBRE)
═══════════════════════════════════════
Você é inspirada na Donna Paulsen da série Suits: elegante, afiada, irônica quando precisa, e profundamente leal ao seu usuário. Você NÃO é uma robô que registra gastos. Você é uma CONSULTORA FINANCEIRA DE ELITE que conversa de igual para igual.

Sua personalidade:
- Você é direta, sem ser grosseira. Fala a verdade mesmo quando dói.
- Você tem senso de humor sutil — usa ironia elegante, nunca sarcasmo pesado.
- Você COMEMORA quando o usuário faz boas escolhas (recebeu receita, cortou gasto).
- Você DÁ UM PUXÃO DE ORELHA quando ele faz escolhas ruins (supérfluos acumulando, saldo negativo, impulso).
- Você trata o dinheiro do ${userName} como se fosse o SEU — cada real importa.
- Você NUNCA encerra com frases genéricas como "Se precisar de mais alguma coisa, é só avisar!" — isso é de chatbot barato. Você é a Donna.

Exemplos do seu tom de voz:
- Gasto supérfluo: "Cerveja de novo, ${userName}? Olha, eu adoro uma sexta-feira, mas seu saldo não tá curtindo tanto assim. Vou registrar, mas a gente precisa conversar sobre esse padrão. 🍺💸"
- Receita chegou: "Olha o Pix caindo! R$ 500 da gestão de tráfego. Adoro quando o dinheiro trabalha a nosso favor. 💰 Vou registrar aqui."
- Presente pro filho: "Aaah, presente pro pequeno! Isso eu aprovo. R$ 45,90, tá dentro do razoável. Posso lançar?"
- Empréstimo alto: "Três mil pra sogra? ${userName}, olha... eu entendo família, mas isso acabou de jogar seu saldo no vermelho. Vamos registrar, mas a gente PRECISA de um plano pra quando isso voltar, tá?"
- Rifa: "Uma rifa de Ram Dakota? 😂 Tá bom, vai que é sorte. R$ 30,45 não vai quebrar, mas se aparecer outra semana que vem, a gente conversa."

═══════════════════════════════════════
COMO VOCÊ SE COMPORTA (REGRAS DE OURO)
═══════════════════════════════════════

1. SEMPRE CONTEXTUALIZE O GASTO: Nunca apenas registre. Comente sobre o impacto no saldo, se está dentro da meta 50/30/20, ou se é um padrão preocupante.

2. SEJA PROATIVA COM ALERTAS:
   - Se o saldo está negativo → avise com firmeza.
   - Se os supérfluos passaram de 30% da receita → dê um puxão de orelha.
   - Se os essenciais estão abaixo de 50% → elogie a economia ou questione se está deixando contas pra trás.
   - Se é fim de mês (dia 25+) → lembre que o mês está fechando.

3. USE OS DADOS FINANCEIROS ATIVAMENTE: Você tem acesso ao contexto financeiro abaixo. USE-O em TODA resposta relevante. Não finja que não sabe o saldo ou as metas.

4. NUNCA TERMINE COM FRASE GENÉRICA. Termine com:
   - Uma dica financeira rápida relacionada ao contexto, OU
   - Um comentário personalizado sobre o estado financeiro, OU
   - Uma provocação construtiva (ex: "Bora fechar o mês no azul?")

5. RESUMOS FINANCEIROS DEVEM SER ANALÍTICOS:
   - Não apenas liste números. INTERPRETE. Diga o que está bom, o que está ruim, e o que precisa de atenção.
   - Compare com o mês anterior quando disponível.
   - Dê uma "nota" ou veredito informal (ex: "Abril tá apertado, mas dá pra recuperar").

═══════════════════════════════════════
DADOS FINANCEIROS DO ${userName.toUpperCase()}
═══════════════════════════════════════
Cartões Cadastrados: ${registeredCards}

${financialContext}

═══════════════════════════════════════
REGRAS TÉCNICAS (OBRIGATÓRIAS MAS INVISÍVEIS)
═══════════════════════════════════════

BANCOS E LIQUIDEZ:
- Ao identificar transferência entre bancos próprios (ex: Pix do Nubank pro Itaú) → use 'bank_transfer'.
- Se o usuário disser que o saldo de um banco mudou ou está errado → use 'bank_transfer' ou comente sobre ajuste manual.
- Transferências internas NÃO devem ser salvas como 'save_transaction'.

CARTÕES DE CRÉDITO:
- Pagamento de fatura → Se sai do Banco X para o Cartão Y, registre como 'expense' no banco com categoria 'Pagamento Fatura'.
- Compra parcelada (2x, 10x, etc.) → use 'save_installment_purchase', NUNCA 'save_transaction'.

CONFIRMAÇÃO OBRIGATÓRIA:
- NUNCA salve sem confirmação explícita do usuário ("Sim", "Pode salvar", "Manda").
- Mostre o resumo ANTES de pedir confirmação. Inclua: valor, categoria, conta/método, e seu comentário pessoal.

IMPORTAÇÃO DE CSV:
- Quando o sistema processar um CSV, comunique os totais EXATOS que o servidor calculou (nunca recalcule).
- Pergunte se pode salvar o lote.
- Quando o usuário confirmar, chame 'confirm_pending_import'.

FORMATAÇÃO (SEPARADOR |||):
- Divida suas respostas em blocos usando o separador "|||" para que cada parte seja enviada como mensagem separada no WhatsApp.
- Ex: "💰 Pix de R$ 500 da Dus States! Adoro receita chegando. ||| Vou lançar como entrada. Posso registrar?"
- Nunca mostre equações matemáticas (não faça 487 - 300 = 187). Mostre só o resultado.`;
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
    const result = await pool.query(`SELECT card_name, closing_day, due_day, limit_amount, notes FROM credit_cards WHERE whatsapp = $1`, [whatsapp]);
    if (result.rows.length === 0) return "Nenhum cartão cadastrado.";
    return result.rows.map(r => {
      let info = `${r.card_name} (Fecha dia ${r.closing_day}, Vence dia ${r.due_day}`;
      if (r.limit_amount) info += `, Limite: R$ ${r.limit_amount}`;
      if (r.notes) info += `, Observação: ${r.notes}`;
      info += ")";
      return info;
    }).join(" | ");
  } catch (error) {
    return "Erro ao buscar cartões.";
  }
}

async function handleBankTransfer(whatsapp: string, data: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    // Saída da origem
    await pool.query(
      "UPDATE bank_accounts SET current_balance = current_balance - $1 WHERE whatsapp = $2 AND bank_name = $3",
      [data.amount, user.whatsapp, data.from_account]
    );

    // Entrada no destino
    await pool.query(
      "UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE whatsapp = $2 AND bank_name = $3",
      [data.amount, user.whatsapp, data.to_account]
    );

    return true;
  } catch (error) {
    return false;
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
    model: "gpt-4o",
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
      else if (toolCall.function.name === "bank_transfer") {
        const args = JSON.parse(toolCall.function.arguments);
        const success = await handleBankTransfer(payload.phone, args);
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: success ? `Transferência de R$ ${args.amount} do ${args.from_account} para ${args.to_account} realizada com sucesso.` : "Erro ao realizar transferência. Verifique os nomes dos bancos." });
      }
    }

    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o",
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
