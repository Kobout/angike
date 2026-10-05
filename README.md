# ANGIKE — loja virtual

Site estático (GitHub Pages) + **Supabase** (login, pedidos) + **Mercado Pago** (Pix, cartão, boleto).

```
index.html      vitrine (filtro por categoria ?cat= e busca ?q=)
produto.html    página do produto (tamanho, quantidade)
carrinho.html   sacola
checkout.html   endereço de entrega → pagamento no Mercado Pago
conta.html      entrar, criar conta, esqueci a senha, meus pedidos, meus dados
pedido.html     detalhes do pedido (é para onde o Mercado Pago devolve a cliente)
js/config.js    ← ÚNICO arquivo que você precisa editar no site
supabase/       banco de dados e as 2 funções do servidor
```

Enquanto `js/config.js` estiver vazio, o site funciona em **modo demonstração**: vitrine e sacola funcionam, login e pagamento mostram um aviso.

---

## 1. Supabase (grátis)

1. Crie uma conta em **supabase.com** → **New project** (região: *South America (São Paulo)*). Guarde a senha do banco.
2. **SQL Editor → New query** → cole todo o conteúdo de `supabase/schema.sql` → **Run**.
   Isso cria as tabelas e 6 produtos de exemplo **a R$ 1,00** (para testar).
3. **Project Settings → API** (ou botão **Connect**): copie a **Project URL** e a chave **anon / publishable**.
   Cole em `js/config.js` (`SUPABASE_URL` e `SUPABASE_KEY`).
   ⚠️ Nunca coloque a chave **service_role / secret** no site.
4. **Authentication → URL Configuration**:
   - *Site URL*: `https://angike.com.br`
   - *Redirect URLs*: adicione `https://angike.com.br/**`
5. (Opcional) **Authentication → Emails**: traduza os textos dos e-mails de confirmação e de senha.

## 2. Mercado Pago

1. Entre em **mercadopago.com.br/developers** → **Suas integrações → Criar aplicação**
   (tipo: *Pagamentos online*, produto: *Checkout Pro*).
2. Em **Credenciais de teste**, copie o **Access Token** (começa com `TEST-` ou `APP_USR-` de teste).
3. Em **Contas de teste**, crie um usuário *comprador* para simular compras.

## 3. Funções do servidor (Supabase Edge Functions)

Pelo painel, sem instalar nada:

1. **Edge Functions → Secrets** → adicione:
   | Nome | Valor |
   |---|---|
   | `MP_ACCESS_TOKEN` | o Access Token do Mercado Pago |
   | `SITE_URL` | `https://angike.com.br` |
   | `SHIPPING_CENTS` | `2500` (R$ 25,00 — igual ao `config.js`) |
   | `FREE_SHIPPING_MIN_CENTS` | `30000` (R$ 300,00 — igual ao `config.js`) |
2. **Edge Functions → Deploy a new function → Via Editor**:
   - nome **`create-checkout`** → cole `supabase/functions/create-checkout/index.ts` → **Deploy**
   - nome **`mp-webhook`** → cole `supabase/functions/mp-webhook/index.ts` → **Deploy**
3. Em cada função → **Details/Settings** → **desligue "Verify JWT"** (Enforce JWT verification) e salve.
   - `create-checkout` confere o login por conta própria;
   - `mp-webhook` é chamada pelo Mercado Pago, que não tem login.

Ou pela linha de comando (Supabase CLI):
```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set MP_ACCESS_TOKEN=... SITE_URL=https://angike.com.br SHIPPING_CENTS=2500 FREE_SHIPPING_MIN_CENTS=30000
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy mp-webhook --no-verify-jwt
```

## 4. Testar

1. Suba o site (`git add . && git commit -m "..." && git push`) e abra `https://angike.com.br`.
2. Crie uma conta em **Minha conta**, confirme o e-mail, adicione um produto e finalize.
3. No Mercado Pago, entre com o **comprador de teste** e pague com um
   cartão de teste (lista em *developers → Checkout Pro → Teste a integração*; nome do titular `APRO` = aprovado, `OTHE` = recusado).
4. Ao voltar, a página do pedido deve mostrar **Pago**. Confira em Supabase → **Table Editor → orders**.

## 5. Ir para produção

1. No Mercado Pago, ative as **credenciais de produção** e troque o secret `MP_ACCESS_TOKEN` pelo token de produção.
2. Em **Table Editor → products**, cadastre os produtos reais com os **preços em centavos** (`18990` = R$ 189,90).
   Para esconder um produto, marque `active = false`.
3. Coloque as fotos na pasta `img/` com os nomes usados na coluna `images`.

## Dia a dia

- **Ver pedidos pagos**: Table Editor → `orders`, filtre `status = paid`. Itens em `order_items`, endereço na coluna `shipping_address`.
- **Marcar como enviado**: mude `status` para `shipped` e preencha `tracking_code`. A cliente vê em *Minha conta*.
- **Newsletter**: e-mails cadastrados ficam na tabela `newsletter`.
- **Frete**: valor fixo + grátis acima de um valor. Se mudar, altere **nos dois lugares**: `js/config.js` e os secrets da função.

## Segurança — o que já está feito

- Preço, tamanho e frete são **recalculados no servidor** a partir do banco; alterar o navegador não muda o valor cobrado.
- O webhook **consulta o pagamento direto na API do Mercado Pago** antes de marcar como pago e confere se o valor pago bate com o pedido.
- Regras de acesso (RLS): cada cliente só vê o próprio perfil e os próprios pedidos; ninguém cria ou altera pedidos pelo navegador.
