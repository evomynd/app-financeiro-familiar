# App Financeiro Familiar

Web App de controle financeiro pessoal com:

- Next.js (App Router)
- Tailwind CSS
- Firebase Auth
- Firestore
- Deploy na Vercel

## Setup rápido

1. Instale dependências:

	npm install

2. Preencha o arquivo `.env` com suas credenciais Firebase (Client e Admin SDK).

3. Rode localmente:

	npm run dev

## Estrutura técnica criada

- `src/lib/firebase/client.ts` → Firebase Client SDK (Auth + Firestore no front)
- `src/lib/firebase/admin.ts` → Firebase Admin SDK (uso server-side)
- `src/types/firestore.ts` → Tipagens das coleções
- `firestore.rules` → Segurança por usuário (`user_id == request.auth.uid`)
- `src/lib/bulk-import/transactions.ts` → Núcleo do importador CSV + projeções
- `src/app/api/admin/bulk-import/route.ts` → Rota utilitária local/admin
- `scripts/bulk-import-transactions.ts` → Script CLI de importação

## Modelo de dados (TypeScript)

Coleções tipadas:

- `Users`: `id, name, email, overdraft_rate`
- `CreditCards`: `id, user_id, name, closing_day, due_day`
- `Categories`: `id, user_id, name, type, is_variable`
- `Transactions`: `id, user_id, description, amount, date, category_id, type, status, payment_method, credit_card_id, is_recurring, installment_current, installment_total`

## Regras Firestore

As regras foram criadas para garantir isolamento por usuário:

- leitura/escrita permitida somente quando o `user_id` do documento for igual ao UID autenticado.
- para `users/{userDocId}`, o próprio documento deve corresponder ao UID autenticado.

Arquivo: `firestore.rules`.

## Bulk Import CSV (local/admin)

### Formato esperado do CSV

Cabeçalho obrigatório:

date,value,category,description

Exemplo:

2026-01-05,-120.50,Supermercado,Compra mensal mercado
2026-01-10,5000.00,Salário,Salário empresa

### Script local/admin

Executar:

`npm run bulk:import -- --file=./imports/transacoes.csv --uid=FIREBASE_UID --months=6`

Parâmetros:

- `--file`: caminho do CSV
- `--uid`: UID do usuário dono das transações
- `--months`: quantidade de meses de projeção futura para itens recorrentes (default: `3`)

### Rota utilitária local/admin

Endpoint: `POST /api/admin/bulk-import`

Proteções:

- disponível em `development` ou quando `ALLOW_ADMIN_IMPORT=true`
- opcionalmente exige header `x-admin-import-key` (se `BULK_IMPORT_ADMIN_KEY` estiver definido)

Campos multipart/form-data:

- `file` (CSV)
- `userId` (UID alvo)
- `projectionMonths` (opcional)

## Deploy

Recomendado: Vercel.

Antes de publicar, configure todas as variáveis de ambiente no painel da Vercel.
