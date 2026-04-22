import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("Iniciando migração de dados...");
    
    const res = await pool.query(`
      INSERT INTO transactions 
        (user_id, whatsapp, type, amount, category, date, description, estabelecimento, timezone_usuario, detalhes, created_at)
      SELECT 
        t.usuario_id,
        u.whatsapp,
        CASE 
          WHEN t.tipo = 'despesa' THEN 'expense'
          WHEN t.tipo = 'receita' THEN 'income'
          ELSE t.tipo 
        END,
        t.valor,
        t.categoria,
        t.data::date,
        t.estabelecimento || ' - ' || COALESCE(t.detalhes, ''),
        t.estabelecimento,
        t.timezone_usuario,
        t.detalhes,
        t.criado_em
      FROM transacoes t
      LEFT JOIN users u ON t.usuario_id = u.id
    `);
    
    console.log(`Migração concluída! ${res.rowCount} registros processados.`);
  } catch (err) {
    console.error("Erro na migração:", err);
  } finally {
    await pool.end();
  }
}
run();
