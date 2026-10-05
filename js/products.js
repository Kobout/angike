/* =========================================================
   Catálogo de DEMONSTRAÇÃO — usado só enquanto o Supabase não estiver
   configurado. Depois disso, os produtos (e os preços que valem no
   pagamento) vêm da tabela "products" do Supabase.
   ========================================================= */
window.ANGIKE_FALLBACK_PRODUCTS = [
  { id: 'vestido-midi-linho', name: 'Vestido Midi Linho', category: 'vestidos', price_cents: 0, is_new: true,
    sizes: ['P', 'M', 'G'], images: ['img/produto-1.jpg'], description: '[Descrição do produto: tecido, caimento, medidas da modelo.]' },
  { id: 'camisa-oversized-algodao', name: 'Camisa Oversized Algodão', category: 'blusas', price_cents: 0, is_new: true,
    sizes: ['P', 'M', 'G'], images: ['img/produto-2.jpg'], description: '[Descrição do produto.]' },
  { id: 'calca-pantalona-alfaiataria', name: 'Calça Pantalona Alfaiataria', category: 'calcas', price_cents: 0, is_new: false,
    sizes: ['36', '38', '40', '42'], images: ['img/produto-3.jpg'], description: '[Descrição do produto.]' },
  { id: 'conjunto-trico-canelado', name: 'Conjunto Tricô Canelado', category: 'conjuntos', price_cents: 0, is_new: true,
    sizes: ['P', 'M', 'G'], images: ['img/produto-4.jpg'], description: '[Descrição do produto.]' },
  { id: 'saia-longa-fluida', name: 'Saia Longa Fluida', category: 'saias', price_cents: 0, is_new: false,
    sizes: ['P', 'M', 'G'], images: ['img/produto-5.jpg'], description: '[Descrição do produto.]' },
  { id: 'blazer-cropped', name: 'Blazer Cropped', category: 'alfaiataria', price_cents: 0, is_new: false,
    sizes: ['P', 'M', 'G'], images: ['img/produto-6.jpg'], description: '[Descrição do produto.]' }
];
