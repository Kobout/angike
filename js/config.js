/* =========================================================
   ANGIKE — configuração
   Preencha depois de criar o projeto no Supabase (veja README.md).
   Enquanto SUPABASE_URL estiver vazio, o site roda em "modo demonstração":
   catálogo e sacola funcionam, mas login e pagamento ficam desativados.
   ========================================================= */
window.ANGIKE_CONFIG = {
  // Supabase → Project Settings → API (ou "Connect")
  SUPABASE_URL: '',          // ex.: 'https://abcdefghijk.supabase.co'
  SUPABASE_KEY: '',          // a chave pública: "anon" ou "publishable" (NUNCA a service_role)

  // Frete — precisa ser IGUAL aos secrets SHIPPING_CENTS e FREE_SHIPPING_MIN_CENTS da função
  SHIPPING_CENTS: 2500,            // R$ 25,00
  FREE_SHIPPING_MIN_CENTS: 30000,  // frete grátis a partir de R$ 300,00

  // Contato (aparece no rodapé)
  EMAIL: 'contato@angike.com.br',
  INSTAGRAM: 'angike',
  WHATSAPP: ''               // só números, com DDI e DDD: '5511999999999'
};
