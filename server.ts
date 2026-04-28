import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";
import os from "os";


// Donna AI Services
import { initDonnaAI, processDonnaMessage } from "./services/donaAI.js";
import { initProactiveAlerts } from "./services/proactiveAlerts.js";
import { sendText, sendReaction, parseWebhookPayload, sendPresence } from "./services/evolutionAPI.js";
import { setPool as setFinancialPool } from "./services/financialContext.js";

dotenv.config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  try {
    const client = await pool.connect();
    console.log("Connected to PostgreSQL");
    
    // Simple schema initialization
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          whatsapp VARCHAR(20) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          whatsapp VARCHAR(20),
          type VARCHAR(10) CHECK (type IN ('income', 'expense')),
          amount DECIMAL(12, 2) NOT NULL,
          category VARCHAR(50),
          date DATE NOT NULL,
          description TEXT,
          estabelecimento TEXT,
          timezone_usuario TEXT,
          detalhes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de Cartões de Crédito
      CREATE TABLE IF NOT EXISTS credit_cards (
          id SERIAL PRIMARY KEY,
          whatsapp VARCHAR(20) NOT NULL,
          card_name VARCHAR(50) NOT NULL,
          closing_day INTEGER NOT NULL,
          due_day INTEGER NOT NULL,
          limit_amount DECIMAL(12, 2),
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(whatsapp, card_name)
      );

      -- Tabela de Contas Bancárias
      CREATE TABLE IF NOT EXISTS bank_accounts (
          id SERIAL PRIMARY KEY,
          whatsapp VARCHAR(20) NOT NULL,
          bank_name VARCHAR(50) NOT NULL,
          initial_balance DECIMAL(12, 2) DEFAULT 0,
          current_balance DECIMAL(12, 2) DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(whatsapp, bank_name)
      );

      -- Migration: Add multi-account columns and fix types
      DO $$
      DECLARE
          const_name text;
      BEGIN
          -- Adicionar colunas de estabalecimento e fuso originais
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='whatsapp') THEN
              ALTER TABLE transactions ADD COLUMN whatsapp VARCHAR(20);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='estabelecimento') THEN
              ALTER TABLE transactions ADD COLUMN estabelecimento TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='timezone_usuario') THEN
              ALTER TABLE transactions ADD COLUMN timezone_usuario TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='detalhes') THEN
              ALTER TABLE transactions ADD COLUMN detalhes TEXT;
          END IF;

          -- Novas colunas da Arquitetura Multi-Contas
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='account') THEN
              ALTER TABLE transactions ADD COLUMN account VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='payment_method') THEN
              ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='installment_info') THEN
              ALTER TABLE transactions ADD COLUMN installment_info VARCHAR(20);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='third_party') THEN
              ALTER TABLE transactions ADD COLUMN third_party VARCHAR(100);
          END IF;

          -- Colunas extras para cartões (se não existirem)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_cards' AND column_name='limit_amount') THEN
              ALTER TABLE credit_cards ADD COLUMN limit_amount DECIMAL(12, 2);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='credit_cards' AND column_name='notes') THEN
              ALTER TABLE credit_cards ADD COLUMN notes TEXT;
          END IF;

          -- Permitir tipos além de income e expense (ex: transfer) aumentando o tamanho da coluna
          ALTER TABLE transactions ALTER COLUMN type TYPE VARCHAR(50);
          
          -- Encontrar e remover constraint de verificação antiga ('income', 'expense')
          SELECT conname INTO const_name
          FROM pg_constraint
          WHERE conrelid = 'transactions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%type%';
          
          IF const_name IS NOT NULL THEN
              EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' || const_name;
          END IF;
      END $$;

      -- Tabela de histórico de chat da Donna
      CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          whatsapp VARCHAR(20) NOT NULL,
          role VARCHAR(10) CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          intent VARCHAR(20),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    client.release();
    console.log("Database tables initialized");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

async function startServer() {
  await initDb();

  // Inicializar serviços da Donna
  setFinancialPool(pool);
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    initDonnaAI(openaiKey, pool);
    initProactiveAlerts(openaiKey, pool);
    console.log("🤖 Donna AI e Alertas Ativos (Cron) inicializados com sucesso");
  } else {
    console.warn("⚠️ OPENAI_API_KEY não configurada — Donna AI desabilitada");
  }

  const app = express();
  const PORT = 3000;

  // Aumentando o limite para suportar webhooks com base64 de áudio/imagem
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // ═══════════════════════════════════════════
  // DONNA AI — Webhook da Evolution API
  // ═══════════════════════════════════════════
  app.post("/api/webhook/donna", async (req, res) => {
    // Responder rápido para a Evolution API não dar timeout
    res.status(200).send("OK");

    let parsed: ReturnType<typeof parseWebhookPayload> | null = null;

    try {
      const event = req.body?.event;

      // Só processar mensagens recebidas
      if (event !== "messages.upsert") {
        return;
      }

      // Parsear o payload do webhook
      parsed = parseWebhookPayload(req.body);

      if (!parsed.isValid || parsed.fromMe || (!parsed.messageText && !parsed.hasMedia)) {
        return; // Ignorar mensagens próprias, inválidas ou vazias (se não tiver mídia)
      }

      // Restrição de segurança: Responder apenas ao número autorizado
      const allowedPhone = process.env.ALLOWED_WHATSAPP;
      if (allowedPhone && parsed.phone !== allowedPhone) {
        console.log(`[WEBHOOK] 🚫 Mensagem ignorada de número não autorizado: ${parsed.phone}`);
        return;
      }

      console.log(`[WEBHOOK] 📩 ${parsed.pushName || parsed.phone}: "${parsed.messageText}" | hasMedia: ${parsed.hasMedia}`);

      // Verificar se a OpenAI está configurada
      if (!process.env.OPENAI_API_KEY) {
        console.warn("[WEBHOOK] ⚠️ OPENAI_API_KEY não configurada");
        return;
      }

      // Enviar reação de "processando" (emoji de relógio)
      await sendReaction({
        phone: parsed.phone,
        messageId: parsed.messageId,
        emoji: "⏳",
      });

      // Processar a mensagem com a Donna (Agente Inteligente)
      const result = await processDonnaMessage(parsed);

      // Enviar respostas via WhatsApp com delay humano e "digitando..."
      if (result.messages && result.messages.length > 0) {
        for (const msg of result.messages) {
          // Calcula tempo de digitação: 35ms por caractere, no mínimo 1.2s e no máximo 4.5s
          const typingTime = Math.max(1200, Math.min(4500, msg.length * 35));
          
          // Avisa o WhatsApp que ela está "digitando..."
          await sendPresence({ phone: parsed.phone, presence: "composing" });
          
          // Espera o tempo de digitação falso
          await new Promise(resolve => setTimeout(resolve, typingTime));

          await sendText({
            phone: parsed.phone,
            text: msg,
          });
          
          // Pausa extra após o envio para dar tempo do usuário ler antes da próxima mensagem
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }

      // Trocar reação para ✅ após processar
      await sendReaction({
        phone: parsed.phone,
        messageId: parsed.messageId,
        emoji: result.transactionSaved ? "✅" : "💬",
      });

      console.log(`[WEBHOOK] ✅ Respondido (${result.intent})`);
    } catch (error: any) {
      console.error("[WEBHOOK] ❌ Erro no processamento:", error?.message || error);
      console.error("[WEBHOOK] Stack:", error?.stack);
      
      // Enviar mensagem de fallback para o usuário não ficar sem resposta
      if (parsed?.phone) {
        try {
          await sendText({
            phone: parsed.phone,
            text: "⚠️ Ops, tive um problema técnico ao processar sua mensagem. Tente enviar novamente por texto, por favor!",
          });
          await sendReaction({
            phone: parsed.phone,
            messageId: parsed.messageId,
            emoji: "❌",
          });
        } catch (fallbackErr) {
          console.error("[WEBHOOK] Erro no fallback:", fallbackErr);
        }
      }
    }
  });

  // Health check para a Donna
  app.get("/api/donna/health", (req, res) => {
    res.json({
      status: "ok",
      donna: !!process.env.OPENAI_API_KEY ? "active" : "disabled",
      evolution: !!process.env.EVOLUTION_API_URL ? "configured" : "not_configured",
      timestamp: new Date().toISOString(),
    });
  });

  // === AUTH ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
    const { name, whatsapp, password } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO users (name, whatsapp, password_hash) VALUES ($1, $2, $3) RETURNING id, name, whatsapp",
        [name, whatsapp, password] // Encriptação deveria ser feita aqui (bcrypt)
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(400).json({ error: "Este WhatsApp já está cadastrado." });
      }
      res.status(500).json({ error: "Erro ao registrar usuário." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { identifier, password } = req.body; // identifier is whatsapp
    try {
      const result = await pool.query(
        "SELECT * FROM users WHERE whatsapp = $1 AND password_hash = $2",
        [identifier, password]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Credenciais inválidas." });
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Erro ao fazer login." });
    }
  });

  // Função Helper para lidar com as loucuras do 9º Dígito e DDI 55 do Brasil
  function getWhatsappVariations(phone: string) {
    let clean = phone.replace(/\\D/g, '');
    if (clean.startsWith('55')) clean = clean.substring(2);
    
    // Agora 'clean' tem só DDD + Número
    let ddd = clean.substring(0, 2);
    let number = clean.substring(2);
    
    // Valida se tem 8 ou 9 digitos
    let with9 = number.length === 8 ? '9' + number : number;
    let without9 = (number.length === 9 && number.startsWith('9')) ? number.substring(1) : number;

    return [
      `55${ddd}${with9}`,
      `55${ddd}${without9}`,
      `${ddd}${with9}`,
      `${ddd}${without9}`,
      phone // Mantém o original por segurança
    ];
  }

  // === TRANSACTION ROUTES ===
  app.get("/api/transactions/:whatsapp", async (req, res) => {
    const { whatsapp } = req.params;
    try {
      const variations = getWhatsappVariations(whatsapp);
      const result = await pool.query(
        "SELECT * FROM transactions WHERE whatsapp = ANY($1::text[]) ORDER BY date DESC",
        [variations]
      );
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro ao buscar transações." });
    }
  });

  app.get("/api/cards/:whatsapp", async (req, res) => {
    const { whatsapp } = req.params;
    try {
      const variations = getWhatsappVariations(whatsapp);
      const result = await pool.query(
        "SELECT * FROM credit_cards WHERE whatsapp = ANY($1::text[]) ORDER BY card_name ASC",
        [variations]
      );
      res.json(result.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro ao buscar cartões." });
    }
  });

  app.post("/api/cards", async (req, res) => {
    const { whatsapp, card_name, closing_day, due_day, limit_amount, notes } = req.body;
    try {
      const variations = getWhatsappVariations(whatsapp);
      const userRes = await pool.query(
        "SELECT whatsapp FROM users WHERE whatsapp = ANY($1::text[]) LIMIT 1",
        [variations]
      );
      if (userRes.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });
      
      const matchedWhatsapp = userRes.rows[0].whatsapp;
      const result = await pool.query(
        `INSERT INTO credit_cards (whatsapp, card_name, closing_day, due_day, limit_amount, notes) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (whatsapp, card_name) DO UPDATE 
         SET closing_day = $3, due_day = $4, limit_amount = $5, notes = $6
         RETURNING *`,
        [matchedWhatsapp, card_name, closing_day, due_day, limit_amount, notes]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao salvar cartão." });
    }
  });

  app.get("/api/banks/:whatsapp", async (req, res) => {
    const { whatsapp } = req.params;
    try {
      const variations = getWhatsappVariations(whatsapp);
      const result = await pool.query(
        "SELECT * FROM bank_accounts WHERE whatsapp = ANY($1::text[]) ORDER BY bank_name ASC",
        [variations]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar bancos." });
    }
  });

  app.post("/api/banks", async (req, res) => {
    const { whatsapp, bank_name, initial_balance } = req.body;
    try {
      const variations = getWhatsappVariations(whatsapp);
      const userRes = await pool.query(
        "SELECT whatsapp FROM users WHERE whatsapp = ANY($1::text[]) LIMIT 1",
        [variations]
      );
      if (userRes.rows.length === 0) return res.status(400).json({ error: "Usuário não encontrado." });
      
      const matchedWhatsapp = userRes.rows[0].whatsapp;
      const balance = parseFloat(initial_balance) || 0;
      
      const result = await pool.query(
        `INSERT INTO bank_accounts (whatsapp, bank_name, initial_balance, current_balance) 
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (whatsapp, bank_name) DO UPDATE 
         SET initial_balance = $3, current_balance = bank_accounts.current_balance + ($3 - bank_accounts.initial_balance)
         RETURNING *`,
        [matchedWhatsapp, bank_name, balance]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao salvar banco." });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    const { 
      whatsapp, type, amount, category, date, 
      description, estabelecimento, timezone_usuario, detalhes 
    } = req.body;
    try {
      if (!whatsapp) {
          return res.status(400).json({ error: "O campo 'whatsapp' é obrigatório." });
      }
      
      if (type !== 'income' && type !== 'expense') {
          return res.status(400).json({ error: "O campo 'type' deve ser exatamente 'income' ou 'expense'." });
      }

      if (!amount || isNaN(Number(amount))) {
          return res.status(400).json({ error: "O campo 'amount' é obrigatório e deve ser numérico." });
      }

      // Tenta encontrar o usuário pelo WhatsApp cobrindo todas as variações 
      const variations = getWhatsappVariations(whatsapp);
      const userRes = await pool.query(
        "SELECT id, whatsapp FROM users WHERE whatsapp = ANY($1::text[]) LIMIT 1",
        [variations]
      );
      
      if (userRes.rows.length === 0) {
          return res.status(400).json({ error: "Usuário não registrado com esse whatsapp. Verifique e tente novamente." });
      }

      // Utilizamos o número EXATO como está salvo na base de dados do usuário (com ou sem o 55), 
      // assim o frontend consegue ver a transação corretamente na lista sem conflito de formatação
      const matchedWhatsapp = userRes.rows[0].whatsapp;

      const result = await pool.query(
        `INSERT INTO transactions 
          (whatsapp, type, amount, category, date, description, estabelecimento, timezone_usuario, detalhes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [matchedWhatsapp, type, amount, category, date, description, estabelecimento, timezone_usuario, detalhes]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error("Erro na transação:", err);
      res.status(500).json({ error: "Erro ao salvar transação.", details: err.message });
    }
  });

  app.put("/api/transactions/:id", async (req, res) => {
    const { id } = req.params;
    const { amount, category } = req.body;
    try {
      const result = await pool.query(
        "UPDATE transactions SET amount = $1, category = $2 WHERE id = $3 RETURNING *",
        [amount, category, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Transação não encontrada." });
      }
      res.json(result.rows[0]);
    } catch (err: any) {
      console.error("Erro ao atualizar transação:", err);
      res.status(500).json({ error: "Erro ao atualizar transação." });
    }
  });



  // === VITE MIDDLEWARE ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: true 
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const interfaces = os.networkInterfaces();
    console.log(`\n🚀 Servidor rodando em:`);
    console.log(`   - Local:   http://localhost:${PORT}`);
    
    Object.values(interfaces).forEach((iface) => {
      iface?.forEach((details) => {
        if (details.family === 'IPv4' && !details.internal) {
          console.log(`   - Network: http://${details.address}:${PORT}`);
        }
      });
    });
    console.log(`\n📱 Use o endereço "Network" acima no seu celular!\n`);
  });
}

startServer();
