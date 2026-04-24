import cron from 'node-cron';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { buildFinancialSnapshot, formatContextForPrompt } from './financialContext.js';
import { sendText } from './evolutionAPI.js';

let pool: Pool;
let openai: OpenAI;

export function initProactiveAlerts(openaiApiKey: string, dbPool: Pool) {
  pool = dbPool;
  openai = new OpenAI({ apiKey: openaiApiKey });

  // Agenda para rodar TODOS OS DIAS às 09:00 da manhã (horário de Brasília)
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Iniciando rotina de alertas diários da Donna...');
    await processDailyAlerts();
  }, {
    timezone: "America/Sao_Paulo"
  });

  console.log('⏰ Módulo de Alertas Ativos da Donna (Cron) iniciado!');
}

async function processDailyAlerts() {
  try {
    // 1. Buscar todos os usuários cadastrados
    const usersRes = await pool.query('SELECT whatsapp, name FROM users');
    const users = usersRes.rows;

    const today = new Date();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 5 = Sexta

    for (const user of users) {
      try {
        const snapshot = await buildFinancialSnapshot(user.whatsapp);
        if (!snapshot) continue;

        const totalIncome = snapshot.receitas;
        const targetSuperfluos = totalIncome > 0 ? totalIncome * 0.3 : 0; // Regra 50/30/20 (30% desejos/supérfluos)
        
        let triggerAlert = false;
        let alertInstruction = "";

        // REGRA 1: Início do mês (Orçamento Base Zero)
        if (dayOfMonth === 1) {
          triggerAlert = true;
          alertInstruction = "Hoje é o primeiro dia do mês. Dê bom dia, mostre que o saldo e os gastos foram zerados e motive o usuário a planejar o mês usando a regra 50/30/20. Seja animadora mas firme.";
        } 
        // REGRA 2: Puxão de Orelha (Gasto excessivo em Supérfluos)
        else if (targetSuperfluos > 0 && snapshot.superfluos > targetSuperfluos) {
          triggerAlert = true;
          alertInstruction = `Alerta Vermelho! O usuário estourou a cota de gastos supérfluos (Gastou R$ ${snapshot.superfluos}, e o limite era R$ ${targetSuperfluos}). Hoje ainda é dia ${dayOfMonth} do mês. Dê um puxão de orelha bem ao estilo Donna Paulsen. Seja irônica e pergunte o que ele vai cortar para compensar.`;
        } 
        // REGRA 3: Sexta-feira (Detox de Consumo e Prevenção)
        else if (dayOfWeek === 5) {
          triggerAlert = true;
          alertInstruction = "Hoje é sexta-feira. Lembre o usuário de segurar os gastos no fim de semana para não destruir o planejamento do mês. Lembre-o de não ceder a gastos por impulso.";
        }

        // Se alguma regra foi ativada, a Donna gera e envia a mensagem
        if (triggerAlert) {
          console.log(`[CRON] Gerando alerta para ${user.whatsapp}... Motivo: Dia ${dayOfMonth}, Sexta=${dayOfWeek === 5}`);
          
          const financialContext = formatContextForPrompt(snapshot);
          const systemPrompt = `Você é a *Donna*, agente financeira pessoal do(a) ${user.name}.
Sua personalidade é inspirada em Donna Paulsen (Suits).

Cenário Financeiro Atual:
${financialContext}

INSTRUÇÃO PARA ESTA MENSAGEM ESPONTÂNEA:
${alertInstruction}

REGRAS:
- Escreva apenas UMA mensagem de WhatsApp (sem separadores '|||').
- Vá direto ao ponto.
- Use o nome do usuário.
- Mantenha a ironia elegante da Donna.`;

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.8,
            messages: [{ role: "system", content: systemPrompt }]
          });

          const messageText = response.choices[0].message.content;
          if (messageText) {
            // Envia via WhatsApp sem que o usuário tenha mandado nada
            await sendText({ phone: user.whatsapp, text: messageText });
            console.log(`[CRON] ✅ Alerta enviado para ${user.whatsapp}`);
            
            // Salvar no histórico para ela ter contexto depois
            await pool.query(
              `INSERT INTO chat_messages (whatsapp, role, content) VALUES ($1, $2, $3)`,
              [user.whatsapp, "assistant", messageText]
            );
          }
        }
      } catch (err) {
        console.error(`[CRON] Erro ao processar usuário ${user.whatsapp}:`, err);
      }
    }
  } catch (error) {
    console.error('[CRON] Erro fatal na rotina de alertas:', error);
  }
}
