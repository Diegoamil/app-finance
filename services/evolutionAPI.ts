/**
 * Evolution API Client
 * Responsável por enviar mensagens via WhatsApp usando a Evolution API.
 */

// Limpa URL para remover barras no final
const baseUrl = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY || "";
const instance = process.env.EVOLUTION_INSTANCE || "";

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
    const url = `${baseUrl}/message/sendText/${instance}`;
    console.log(`[EVO] Tentando enviar mensagem para ${url}`);
    
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
        "apikey": apiKey,
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
    const url = `${baseUrl}/message/sendReaction/${instance}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
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
 * Ativa o status de "digitando..." (composing) ou "gravando áudio..." (recording) no WhatsApp
 */
export async function sendPresence(params: {
  phone: string;
  presence?: "composing" | "recording" | "available" | "unavailable";
  delay?: number;
}): Promise<boolean> {
  try {
    const url = `${baseUrl}/chat/sendPresence/${instance}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        number: params.phone,
        presence: params.presence || "composing",
        delay: params.delay || 0,
      }),
    });

    if (!response.ok) return false;
    return true;
  } catch (error) {
    console.error("[EVO] Erro ao enviar status de presença:", error);
    return false;
  }
}

/**
 * Obtém o Base64 de uma mensagem de mídia (áudio, imagem, vídeo)
 * Chama o endpoint da Evolution API para baixar a mídia e converter.
 */
export async function getMediaBase64(messageObj: any): Promise<{ base64: string; mimetype?: string } | null> {
  try {
    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${instance}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({ message: messageObj }),
    });

    if (!response.ok) {
      console.error(`[EVO] Erro ao baixar mídia (Status ${response.status})`);
      return null;
    }

    const data = await response.json();
    if (data && data.base64) {
      return { base64: data.base64, mimetype: data.mimetype };
    }
    return null;
  } catch (error) {
    console.error("[EVO] Falha ao obter base64 da mídia:", error);
    return null;
  }
}

/**
 * Extrai o número de telefone limpo de um remoteJid do WhatsApp
 * Ex: "5511999999999@s.whatsapp.net" → "5511999999999"
 */
export function extractPhoneFromJid(remoteJid: string): string {
  return remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
}

export interface WebhookPayload {
  isValid: boolean;
  phone: string;
  messageText: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName: string;
  hasMedia: boolean;
  rawMessage: any;
}

/**
 * Valida e extrai dados de um webhook da Evolution API
 */
export function parseWebhookPayload(body: any): WebhookPayload {
  const defaultResult = {
    isValid: false,
    phone: "",
    messageText: "",
    messageId: "",
    fromMe: false,
    isGroup: false,
    pushName: "",
    hasMedia: false,
    rawMessage: null,
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
    
    const hasMedia = !!(
      message.imageMessage || 
      message.audioMessage || 
      message.videoMessage || 
      message.documentMessage
    );

    return {
      isValid: true,
      phone,
      messageText: messageText.trim(),
      messageId,
      fromMe,
      isGroup,
      pushName,
      hasMedia,
      rawMessage: data, // O data inteiro precisa ser passado para a Evolution API autorizar o download
    };
  } catch (error) {
    console.error("[EVO] Erro ao parsear webhook:", error);
    return defaultResult;
  }
}
