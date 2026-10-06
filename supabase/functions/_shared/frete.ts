// =========================================================
// ANGIKE — cálculo de frete com a SuperFrete (usado por shipping-quote e create-checkout)
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SUPERFRETE_TOKEN         token da SuperFrete (web.superfrete.com → Integrações → Desenvolvedores)
//   ORIGIN_CEP               CEP de onde você envia, só números (ex.: 74663170)
//   SUPERFRETE_SERVICES      opcional, padrão "1,2,17"  (1 = PAC, 2 = SEDEX, 17 = Mini Envios, 3 = Jadlog, 31 = Loggi)
//   SUPERFRETE_SANDBOX       opcional, "true" para usar o ambiente de testes da SuperFrete
//   FREE_SHIPPING_MIN_CENTS  opcional: a partir de quanto a opção mais barata fica GRÁTIS
//                            (0 = sempre grátis; sem o secret = nunca grátis). Igual ao js/config.js
//   CONTACT_EMAIL            opcional, vai no User-Agent exigido pela SuperFrete
// =========================================================

export type CartItem = { id: string; size?: string; qty: number };
export type ShipOption = { id: string; name: string; company: string; price_cents: number; days: number | null };

// medidas usadas quando o produto não tem as dele cadastradas (peça de roupa dobrada)
const DEFAULT_DIMS = { weight_kg: 0.3, height_cm: 4, width_cm: 25, length_cm: 30 };

export function freeShippingMin(): number | null {
  const raw = Deno.env.get('FREE_SHIPPING_MIN_CENTS');
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateItems(items: unknown): CartItem[] | null {
  if (!Array.isArray(items) || !items.length || items.length > 30) return null;
  for (const i of items as CartItem[]) {
    if (typeof i?.id !== 'string' || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 10) return null;
  }
  return items as CartItem[];
}

/** Busca os produtos no banco e calcula as linhas da sacola com o preço oficial. */
// deno-lint-ignore no-explicit-any
export async function loadLines(admin: any, items: CartItem[]) {
  const ids = [...new Set(items.map((i) => i.id))];
  const { data: products, error } = await admin
    .from('products')
    .select('id, name, price_cents, sizes, active, weight_kg, height_cm, width_cm, length_cm')
    .in('id', ids);
  if (error) throw error;

  const lines = [];
  for (const i of items) {
    const p = products?.find((x: { id: string }) => x.id === i.id);
    if (!p || !p.active) throw new UserError('Um produto da sua sacola não está mais disponível.', 409);
    const size = String(i.size ?? '');
    if (p.sizes?.length && !p.sizes.includes(size)) throw new UserError(`Escolha um tamanho válido para ${p.name}.`, 400);
    lines.push({
      product_id: p.id, name: p.name, size, unit_price_cents: p.price_cents, quantity: i.qty,
      dims: {
        weight: Number(p.weight_kg ?? DEFAULT_DIMS.weight_kg),
        height: Number(p.height_cm ?? DEFAULT_DIMS.height_cm),
        width: Number(p.width_cm ?? DEFAULT_DIMS.width_cm),
        length: Number(p.length_cm ?? DEFAULT_DIMS.length_cm),
      },
    });
  }
  const subtotal = lines.reduce((n, l) => n + l.unit_price_cents * l.quantity, 0);
  return { lines, subtotal };
}

export class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Cota o frete na SuperFrete. Devolve as opções da mais barata para a mais cara. */
export async function quote(
  cep: string,
  lines: { quantity: number; dims: { weight: number; height: number; width: number; length: number } }[],
  subtotal: number,
): Promise<ShipOption[]> {
  const token = Deno.env.get('SUPERFRETE_TOKEN');
  const origin = (Deno.env.get('ORIGIN_CEP') ?? '').replace(/\D/g, '');
  if (!token || origin.length !== 8) throw new Error('SUPERFRETE_TOKEN ou ORIGIN_CEP não configurados.');

  const dest = cep.replace(/\D/g, '');
  if (dest.length !== 8) throw new UserError('CEP inválido.', 400);

  const base = Deno.env.get('SUPERFRETE_SANDBOX') === 'true' ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
  const contact = Deno.env.get('CONTACT_EMAIL') ?? 'contato@angike.com.br';

  const res = await fetch(`${base}/api/v0/calculator`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': `ANGIKE Loja 1.0 (${contact})`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { postal_code: origin },
      to: { postal_code: dest },
      services: Deno.env.get('SUPERFRETE_SERVICES') ?? '1,2,17',
      options: { own_hand: false, receipt: false, insurance_value: subtotal / 100, use_insurance_value: false },
      products: lines.map((l) => ({ quantity: l.quantity, ...l.dims })),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    console.error('SuperFrete respondeu', res.status, body);
    throw new Error('Falha ao consultar a SuperFrete.');
  }

  // a resposta pode vir como lista ou como { services: [...] }
  // deno-lint-ignore no-explicit-any
  const list: any[] = Array.isArray(body) ? body : (body.services ?? body.data ?? []);
  let options: ShipOption[] = list
    .filter((s) => !s.error && !s.has_error && s.price !== undefined && s.price !== null && !Number.isNaN(Number(s.price)))
    .map((s) => ({
      id: String(s.id ?? s.service ?? s.name),
      name: String(s.name ?? 'Entrega'),
      company: String(s.company?.name ?? ''),
      price_cents: Math.round(Number(s.price) * 100),
      days: Number(s.delivery_time ?? s.delivery_range?.max) || null,
    }))
    .sort((a, b) => a.price_cents - b.price_cents);

  // frete grátis: a opção mais barata sai de graça a partir do valor configurado
  const min = freeShippingMin();
  if (min !== null && subtotal >= min && options.length) {
    options = options.map((o, i) => (i === 0 ? { ...o, price_cents: 0 } : o));
  }
  return options;
}
