# Davy Pesca — App de Vendas

App de registro de vendas da loja Davy Pesca. Funciona no celular como aplicativo (PWA), com relatório diário e dashboard mensal.

## Arquivos
- `index.html`, `app.js` — o app
- `manifest.json`, `sw.js` — fazem virar app instalável
- `icon-*.png`, `apple-touch-icon.png`, `favicon.png` — ícones (a logo)

---

## PARTE 1 — Subir no GitHub Pages (grátis)

1. Crie um repositório novo no GitHub (ex: `davypesca`).
2. Faça upload de **todos** estes arquivos (arraste tudo pra dentro do repositório).
3. Vá em **Settings > Pages**.
4. Em "Source", escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**. Salve.
5. Em 1-2 minutos o app estará no ar em: `https://SEU-USUARIO.github.io/davypesca/`

### Instalar na tela do celular
- **Android (Chrome):** abra o link → menu (⋮) → "Adicionar à tela de início".
- **iPhone (Safari):** abra o link → botão compartilhar → "Adicionar à Tela de Início".

O ícone da Davy Pesca aparece junto com os outros apps. Abre em tela cheia, sem barra do navegador.

> Sem a Parte 2, o app já funciona — mas os dados ficam **só neste aparelho**.

---

## PARTE 2 — Ligar o Supabase (grátis) para compartilhar em tempo real

Isso faz todos os celulares verem as mesmas vendas.

### 2.1 Criar conta e projeto
1. Acesse **supabase.com** → **Start your project** (login com GitHub é o mais rápido).
2. **New project**. Dê um nome (ex: `davypesca`), crie uma senha de banco (guarde), região **South America (São Paulo)**. Aguarde ~2 min.

### 2.2 Criar as tabelas
No menu lateral, abra **SQL Editor** → **New query**, cole o bloco abaixo e clique em **Run**:

```sql
create table vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz default now()
);

create table produtos (
  nome text primary key,
  ultimo_preco numeric default 0,
  vezes int default 0,
  criado_em timestamptz default now()
);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  vendedor text,
  itens jsonb not null,
  pagamentos jsonb not null,
  total numeric not null,
  recebido_dinheiro numeric,
  data date not null,
  criado_em timestamptz default now()
);

-- Libera leitura/escrita pelo app (loja pequena, sem login)
alter table vendedores enable row level security;
alter table produtos  enable row level security;
alter table vendas    enable row level security;
create policy "tudo_vendedores" on vendedores for all using (true) with check (true);
create policy "tudo_produtos"  on produtos  for all using (true) with check (true);
create policy "tudo_vendas"    on vendas    for all using (true) with check (true);
```

### 2.3 Ligar o tempo real
Menu **Database > Replication** (ou **Realtime**) → ative a publicação para as tabelas **vendas**, **produtos** e **vendedores**.

### 2.4 Pegar as chaves
Menu **Settings (engrenagem) > API**. Copie:
- **Project URL** (ex: `https://xxxx.supabase.co`)
- **anon public** key (a chave longa)

### 2.5 Colar no app
Abra o arquivo **`app.js`**, lá no começo, e preencha as duas linhas:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

Salve, faça upload do `app.js` atualizado no GitHub (substituindo o antigo). Pronto — agora é em tempo real e compartilhado.

---

## Observações
- A chave `anon public` pode ficar no código (é feita pra isso). Como não há login, quem tiver o link consegue registrar vendas — o ideal é não divulgar o link publicamente.
- Free tier do Supabase: 500 MB de banco. Aguenta anos de vendas de uma loja de pesca.
