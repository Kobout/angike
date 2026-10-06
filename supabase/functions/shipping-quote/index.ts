// =========================================================
// ANGIKE — shipping-quote
// Recebe { cep, items } e devolve as formas de entrega (PAC, SEDEX, Mini Envios…)
// calculadas pela SuperFrete. Publique com --no-verify-jwt.
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadLines, quote, UserError, validateItems } from '../_shared/frete.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const items = validateItems(body.items);
    if (!items) return json({ error: 'Sua sacola está vazia.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const { lines, subtotal } = await loadLines(admin, items);
    const options = await quote(String(body.cep ?? ''), lines, subtotal);
    return json({ options });
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Não foi possível calcular o frete agora. Tente novamente em instantes.' }, 500);
  }
});
