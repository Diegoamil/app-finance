import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // === API ROUTES ===
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Webhook for WhatsApp integration (future implementation)
  app.post("/api/webhook/whatsapp", (req, res) => {
    const data = req.body;
    console.log("Received WhatsApp webhook:", data);
    // Here you would process the incoming message, text, audio, or photo
    // and store it in your database as an income or expense.
    res.status(200).send("EVENT_RECEIVED");
  });

  // Verify webhook (WhatsApp requirement)
  app.get("/api/webhook/whatsapp", (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === verify_token) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
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
