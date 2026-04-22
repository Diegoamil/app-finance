/**
 * Evolution API Client
 * Responsável por enviar mensagens via WhatsApp usando a Evolution API.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || "";

interface SendTextOptions {
  phone: string;
  text: string;
  delay?: number;
}

interface SendReactionOptions {
  phone: string;
  messageId: string;
  emoji: string;
}

/**
 * Envia uma mensagem de texto via WhatsApp
 */
export async function sendText({ phone, text, delay }: SendTextOptions): Promise<boolean> {
  try {
    const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
    
    const body: any = {
      number: phone,
      text,
    };

    if (delay) {
      body.delay = delay;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[EVO] Erro ao enviar mensagem para ${phone}:`, response.status, errorBody);
      return false;
    }

    console.log(`[EVO] ✅ Mensagem enviada para ${phone}`);
    return true;
  } catch (error) {
    console.error("[EVO] Erro de rede ao enviar mensagem:", error);
    return false;
  }
}

/**
 * Envia uma reação (emoji) a uma mensagem específica
 */
export async function sendReaction({ phone, messageId, emoji }: SendReactionOptions): Promise<boolean> {
  try {
    const url = `${EVOLUTION_API_URL}/message/sendReaction/${EVOLUTION_INSTANCE}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        key: {
          remoteJid: phone.includes("@") ? phone : `${phone}@s.whatsapp.net`,
          fromMe: false,
          id: messageId,
        },
        reaction: emoji,
      }),
    });

    if (!response.ok) {
      console.error(`[EVO] Erro ao enviar reação:`, response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[EVO] Erro ao enviar reação:", error);
    return false;
  }
}

/**
 * Extrai o número de telefone limpo de um remoteJid do WhatsApp
 * Ex: "5511999999999@s.whatsapp.net" → "5511999999999"
 */
export function extractPhoneFromJid(remoteJid: string): string {
  return remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
}

/**
 * Valida e extrai dados de um webhook da Evolution API
 */
export function parseWebhookPayload(body: any): {
  isValid: boolean;
  phone: string;
  messageText: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName: string;
} {
  const defaultResult = {
    isValid: false,
    phone: "",
    messageText: "",
    messageId: "",
    fromMe: false,
    isGroup: false,
    pushName: "",
  };

  try {
    // Aceitar tanto o formato da Evolution API (com event/data) quanto direto
    const data = body.data || body;
    const key = data?.key;
    
    if (!key || !key.remoteJid) {
      return defaultResult;
    }

    const remoteJid = key.remoteJid as string;
    const isGroup = remoteJid.endsWith("@g.us");
    const fromMe = key.fromMe === true;
    const messageId = key.id || "";
    const phone = extractPhoneFromJid(remoteJid);

    // Extrair texto da mensagem (pode estar em diferentes campos)
    const message = data.message || {};
    const messageText =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      "";

    const pushName = data.pushName || "";

    return {
      isValid: true,
      phone,
      messageText: messageText.trim(),
      messageId,
      fromMe,
      isGroup,
      pushName,
    };
  } catch (error) {
    console.error("[EVO] Erro ao parsear webhook:", error);
    return defaultResult;
  }
}
