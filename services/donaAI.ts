/**
 * Donna AI — Cérebro da Assistente Financeira (Agentic Flow)
 * 
 * Agora estruturada com OpenAI Function Calling para fluxo de confirmação e 
 * capacidade multimodal (Vision para imagens, Whisper para áudios).
 */

import OpenAI, { toFile } from "openai";
import { Pool } from "pg";
import {
  buildFinancialSnapshot,
  formatContextForPrompt,
  getUserByPhone,
  countWeeklyByEstablishment,
} from "./financialContext.js";
import { getMediaBase64, WebhookPayload } from "./evolutionAPI.js";

let openai: OpenAI;
let pool: Pool;

export function initDonnaAI(openaiApiKey: string, dbPool: Pool) {
  openai = new OpenAI({ apiKey: openaiApiKey });
  pool = dbPool;
}

// ═══════════════════════════════════════════
// TIPOS E FERRAMENTAS
// ═══════════════════════════════════════════

interface DonnaResponse {
  intent: string;
  message: string;
  transactionSaved?: boolean;
}

const donnaTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "save_transaction",
      description: "Salva uma transação financeira no banco de dados. SÓ CHAME ESTA FUNÇÃO APÓS O USUÁRIO TER CONFIRMADO EXPLICITAMENTE OS DADOS DO RESUMO (ex: 'pode salvar', 'sim', 'ok').",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense"] },
          amount: { type: "number", description: "O valor decimal positivo. Ex: 50.90" },
          category: { type: "string", enum: ["Essencial", "Importante", "Supérfluo"] },
          description: { type: "string", description: "Breve descrição." },
          estabelecimento: { type: "string", description: "Local ou estabelecimento." },
          date: { type: "string", description: "Data no formato YYYY-MM-DD. Use a data de hoje se não especificado." }
        },
        required: ["type", "amount", "category", "description", "estabelecimento", "date"]
      }
    }
  }
];

// ═══════════════════════════════════════════
// SYSTEM PROMPT DA DONNA
// ═══════════════════════════════════════════

function buildSystemPrompt(userName: string, financialContext: string): string {
  const today = new Date().toISOString().split("T")[0];
  
  return `Você é a *Donna*, agente financeira pessoal do(a) ${userName}.
Data de hoje: ${today}

Sua personalidade é inspirada em Donna Paulsen (Suits):
- Comunicação clara, direta e estratégica
- Alto nível de inteligência emocional e percepção
- Tom confiante, elegante e objetivo, levemente irônica quando necessário
- Não seja robótica, mantenha naturalidade

${financialContext}

COMPORTAMENTO E FLUXO DE REGISTRO (MUITO IMPORTANTE):
1. Quando o usuário enviar um áudio, imagem (recibo) ou texto relatando um gasto/receita, EXTRAIA os dados.
2. NUNCA SALVE DIRETAMENTE! Apresente um resumo estruturado e PERGUNTE EXPLICITAMENTE se o usuário aprova o registro.
   Exemplo de resposta: "Entendi, você gastou R$ 50 no McDonald's (Supérfluo). Posso salvar esse lançamento?"
3. Se o usuário pedir para alterar algo (ex: "Muda a categoria pra Essencial"), refaça o resumo e peça confirmação novamente.
4. SOMENTE QUANDO O USUÁRIO CONFIRMAR (ex: "Pode salvar", "Sim", "Ok", "Correto"), chame a ferramenta 'save_transaction'.
5. Após chamar a ferramenta de salvar, comemore e dê o impacto no orçamento (se houver padrão preocupante, use ironia).

REGRAS DE CATEGORIZAÇÃO:
- "Essencial": moradia, alimentação básica (mercado), saúde, remédios, água, luz
- "Importante": transporte, Uber, educação, combustível, seguros
- "Supérfluo": delivery/iFood, restaurantes, roupas, lazer, games, bares, cafés

OBJETIVO CENTRAL:
Ajudar ${userName} a tomar melhores decisões. Não seja uma calculadora, seja uma parceira. Se uma despesa não fizer sentido com as metas, questione.`;
}

// ═══════════════════════════════════════════
// FUNÇÕES DE BANCO DE DADOS
// ═══════════════════════════════════════════

async function saveTransaction(whatsapp: string, tx: any): Promise<boolean> {
  try {
    const user = await getUserByPhone(whatsapp);
    if (!user) return false;

    await pool.query(
      `INSERT INTO transactions 
        (whatsapp, type, amount, category, date, description, estabelecimento) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.whatsapp, tx.type, Math.abs(parseFloat(tx.amount)), tx.category, tx.date, tx.description, tx.estabelecimento]
    );
    return true;
  } catch (error) {
    console.error("[DONNA] Erro ao salvar transação:", error);
    return false;
  }
}

async function saveChatMessage(whatsapp: string, role: "user" | "assistant", content: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_messages (whatsapp, role, content) VALUES ($1, $2, $3)`,
      [whatsapp, role, content]
    );
  } catch (error) {
    console.error("[DONNA] Erro ao salvar mensagem:", error);
  }
}

async function getRecentChatHistory(whatsapp: string, limit = 8): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT role, content FROM chat_messages 
       WHERE whatsapp = $1 ORDER BY created_at DESC LIMIT $2`,
      [whatsapp, limit]
    );
    return result.rows.reverse().map(row => ({
      role: row.role,
      content: row.content
    }));
  } catch (error) {
    return [];
  }
}

// ═══════════════════════════════════════════
// PROCESSAMENTO PRINCIPAL (AGENTIC FLOW)
// ═══════════════════════════════════════════

export async function processDonnaMessage(payload: WebhookPayload): Promise<DonnaResponse> {
  console.log(`[DONNA] Iniciando processamento para ${payload.phone}`);

  // 1. Buscar usuário
  const user = await getUserByPhone(payload.phone);
  if (!user) {
    return {
      intent: "greeting",
      message: "Oi! Parece que você ainda não tem uma conta no Moneed. Cadastre-se primeiro pelo app para eu poder te ajudar com suas finanças. 📊",
    };
  }

  // 2. Extrair mídia (Áudio / Imagem) se existir
  let userMessageContent: any = payload.messageText;
  let textForDb = payload.messageText;

  if (payload.hasMedia && payload.rawMessage) {
    console.log("[DONNA] Mídia detectada, baixando base64...");
    const mediaData = await getMediaBase64(payload.rawMessage);
    
    if (mediaData) {
      if (payload.rawMessage.audioMessage) {
        // Transcrever Áudio
        console.log("[DONNA] Transcrevendo áudio com Whisper...");
        try {
          const buffer = Buffer.from(mediaData.base64, "base64");
          const file = await toFile(buffer, "audio.ogg", { type: mediaData.mimetype || "audio/ogg" });
          
          const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
          });
          
          const transcribedText = transcription.text;
          console.log(`[DONNA] Áudio transcrito: "${transcribedText}"`);
          
          userMessageContent = `[Áudio Transcrito]: "${transcribedText}"`;
          if (payload.messageText) userMessageContent += `\n[Mensagem Extra]: ${payload.messageText}`;
          textForDb = userMessageContent;

        } catch (err) {
          console.error("[DONNA] Erro ao transcrever áudio:", err);
          return { intent: "error", message: "Desculpe, tive um problema para entender o seu áudio. Pode digitar ou tentar novamente? 🎙️❌" };
        }
      } 
      else if (payload.rawMessage.imageMessage) {
        // Analisar Imagem
        console.log("[DONNA] Imagem detectada, anexando para o Vision...");
        const imageUrl = `data:${mediaData.mimetype || "image/jpeg"};base64,${mediaData.base64}`;
        
        userMessageContent = [
          { type: "text", text: payload.messageText || "Analise esta imagem/comprovante." },
          { type: "image_url", image_url: { url: imageUrl } }
        ];
        textForDb = `[Imagem Enviada] ${payload.messageText || ""}`.trim();
      }
    }
  }

  // Fallback se estiver vazio
  if (!userMessageContent || (typeof userMessageContent === 'string' && userMessageContent.trim() === '')) {
    userMessageContent = "[Mídia sem texto]";
    textForDb = "[Mídia sem texto]";
  }

  // 3. Salvar a mensagem do usuário no banco (antes de chamar a IA)
  await saveChatMessage(payload.phone, "user", textForDb);

  // 4. Buscar contexto financeiro atual
  const snapshot = await buildFinancialSnapshot(payload.phone);
  const financialContext = snapshot ? formatContextForPrompt(snapshot) : "Nenhum dado financeiro encontrado ainda.";

  // 5. Preparar histórico para a OpenAI
  const chatHistory = await getRecentChatHistory(payload.phone, 8);
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt(user.name, financialContext) },
    ...chatHistory, // histórico não tem as imagens passadas, mas tem o texto salvo no DB
    { role: "user", content: userMessageContent }
  ];

  // 6. Chamada para a IA com suporte a Ferramentas (Function Calling)
  console.log("[DONNA] Consultando o Cérebro da OpenAI (Agentic Flow)...");
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Funciona para texto e visão (imagens)
    temperature: 0.7,
    max_tokens: 500,
    messages: messages,
    tools: donnaTools,
  });

  const responseMessage = response.choices[0].message;
  let finalReply = responseMessage.content || "";
  let transactionSaved = false;

  // 7. Verificar se a IA decidiu usar uma ferramenta (salvar no banco)
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    console.log("[DONNA] IA decidiu acionar ferramentas:", responseMessage.tool_calls.map(t => t.function.name));
    
    // Adiciona a intenção de chamada da IA no contexto
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.function.name === "save_transaction") {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const success = await saveTransaction(payload.phone, args);
          transactionSaved = success;
          
          // Informar à IA se deu certo ou errado para ela elaborar a resposta final
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: success ? "Transação salva com sucesso no banco de dados." : "Erro interno ao salvar transação. Peça desculpas."
          });
        } catch (err) {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Erro no parse dos argumentos." });
        }
      }
    }

    // Fazer uma segunda chamada para a IA gerar a mensagem confirmando a gravação
    const secondResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 300,
      messages: messages,
    });

    finalReply = secondResponse.choices[0].message.content || finalReply;
  }

  if (!finalReply) {
    finalReply = "Desculpa, fiquei confusa por um momento. Pode repetir?";
  }

  // 8. Salvar resposta final da Donna
  await saveChatMessage(payload.phone, "assistant", finalReply);

  console.log(`[DONNA] Resposta final gerada.`);

  return {
    intent: transactionSaved ? "transaction_saved" : "conversation",
    message: finalReply,
    transactionSaved,
  };
}
