/* =========================================================
   ANGIKE — configuração
   Preencha depois de criar o projeto no Supabase (veja README.md).
   Enquanto SUPABASE_URL estiver vazio, o site roda em "modo demonstração":
   catálogo e sacola funcionam, mas login e pagamento ficam desativados.
   ========================================================= */
window.ANGIKE_CONFIG = {
  // Supabase → Project Settings → API (ou "Connect")
  SUPABASE_URL: 'https://rdwekdijijofqaxkmwmi.supabase.co',
  SUPABASE_KEY: 'sb_publishable_mKthUPMvCqVbFcNn1bkAZA_n7ILHwkd',

  // Frete grátis (opção mais barata) a partir deste valor, em centavos.
  // 0 = sempre grátis | null = nunca. Precisa ser IGUAL ao secret FREE_SHIPPING_MIN_CENTS.
  // (o valor do frete em si vem da SuperFrete)
  FREE_SHIPPING_MIN_CENTS: 30000,  // frete grátis a partir de R$ 300,00

  // Contato (aparece no rodapé)
  EMAIL: 'contato@angike.com.br',
  INSTAGRAM: 'angike',
  WHATSAPP: ''               // só números, com DDI e DDD: '5511999999999'
};