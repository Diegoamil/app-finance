import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

// Donna AI Services
import { initDonnaAI, processDonnaMessage } from "./services/donaAI.js";
import { sendText, sendReaction, parseWebhookPayload } from "./services/evolutionAPI.js";
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

      -- Migration: Add whatsapp column if it doesn't exist
      DO $$
      BEGIN
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
    console.log("🤖 Donna AI inicializada com sucesso");
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
    try {
      // Responder rápido para a Evolution API não dar timeout
      res.status(200).send("OK");

      const event = req.body?.event;

      // Só processar mensagens recebidas
      if (event !== "messages.upsert") {
        return;
      }

      // Parsear o payload do webhook
      const parsed = parseWebhookPayload(req.body);

      if (!parsed.isValid || parsed.fromMe || (!parsed.messageText && !parsed.hasMedia)) {
        return; // Ignorar mensagens próprias, inválidas ou vazias (se não tiver mídia)
      }

      // Restrição de segurança: Responder apenas ao número autorizado
      const allowedPhone = process.env.ALLOWED_WHATSAPP;
      if (allowedPhone && parsed.phone !== allowedPhone) {
        console.log(`[WEBHOOK] 🚫 Mensagem ignorada de número não autorizado: ${parsed.phone}`);
        return;
      }

      // Ignorar mensagens de grupo (opcional — descomente se quiser suportar grupos)
      // if (parsed.isGroup) return;

      console.log(`[WEBHOOK] 📩 ${parsed.pushName || parsed.phone}: "${parsed.messageText}"`);

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

      // Enviar resposta via WhatsApp
      await sendText({
        phone: parsed.phone,
        text: result.message,
      });

      // Trocar reação para ✅ após processar
      await sendReaction({
        phone: parsed.phone,
        messageId: parsed.messageId,
        emoji: result.transactionSaved ? "✅" : "💬",
      });

      console.log(`[WEBHOOK] ✅ Respondido (${result.intent})`);
    } catch (error) {
      console.error("[WEBHOOK] Erro no processamento:", error);
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



  // === VITE MIDDLEWARE ===
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
