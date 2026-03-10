# 📊 Importador de Excel - 12 Meses de Transações

Script para importar automaticamente dados financeiros de um arquivo Excel com múltiplas abas (uma para cada mês).

## 🎯 Pré-requisitos

1. **Arquivo Excel** na sua área de trabalho: `Planilha-de-gastos-2026  PJ (1).xlsx`
2. **Abas nomeadas** com meses abreviados: Mar 25, Abr 25, Mai 25, etc.
3. **Firebase Admin SDK** configurado (o script tentará usar credenciais padrão)

## 🚀 Como usar

### Passo 1: Executar o script

```bash
node scripts/import-excel-12-months.js
```

### Passo 2: Responder às perguntas

O script vai perguntar:
1. **Firebase Project ID** (se não encontrar nas variáveis de ambiente)
2. **User ID (UID)** - Você consegue encontrar:
   - No Firebase Console → Authentication → seu email → copiar UID
   - No código do app quando fizer login (console.log do user.uid)
   - O script tentará listar os usuários disponíveis para ajudar

### Passo 3: Confirmar importação

- O script mostrará as configurações
- Digite `s` para confirmar e iniciar a importação

## 📋 Estrutura esperada do Excel

Cada aba (mês) deve ter **colunas agrupadas** por tipo:

### Despesas (serão importadas como `type: expense`):
- Gastos Básicos
- Gastos Opcionais  
- Gastos anuais ou parcelados

### Receitas (serão importadas como `type: income`):
- Receitas Mensais
- Receitas Eventuais

### Estrutura de cada aba:

```
| Descrição      | Gastos Básicos | Gastos Opcionais | Receitas Mensais |
|----------------|----------------|------------------|------------------|
| Aluguel        | 1500          | -                | -                |
| Netflix        | -              | 50               | -                |
| Salário        | -              | -                | 5000             |
```

## ⚙️ Regras de importação

✅ **Serão importados:**
- Valores positivos (números > 0)
- Todas as descrições válidas
- Criará automaticamente categorias baseadas nos nomes das colunas

❌ **Serão ignorados:**
- Valores negativos
- Células vazias
- Linhas com "Cartão de Credito" na descrição

## 🔧 Autenticação Firebase

O script tenta 3 métodos de autenticação (em ordem):

1. **Service Account Key** (`service-account-key.json` na raiz do projeto)
2. **Variáveis de Ambiente** (FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID)
3. **Input Manual** (você digita o Project ID quando solicitado)

### Opção 1: Service Account (Recomendado)

1. Vá para Firebase Console → Project Settings → Service Accounts
2. Clique em "Generate New Private Key"
3. Salve o arquivo como `service-account-key.json` na raiz do projeto
4. **IMPORTANTE:** Adicione ao `.gitignore`

### Opção 2: Application Default Credentials (ADC)

```bash
gcloud auth application-default login
```

### Opção 3: Variáveis de Ambiente

Crie arquivo `.env.local`:
```env
FIREBASE_PROJECT_ID=seu-project-id
```

## 📊 Resultado esperado

```
🚀 Iniciando importação do Excel...

📁 Arquivo: C:\Users\...\Planilha-de-gastos-2026  PJ (1).xlsx
📊 Abas encontradas: Mar 25, Abr 25, Mai 25, ...

📄 Processando aba: Mar 25
✅ Criada nova categoria: Gastos Básicos (expense)
✅ Criada nova categoria: Receitas Mensais (income)
   💾 Batch de 45 transações salvo
   ✅ Importadas: 45 | ⚠️  Ignoradas: 3

...

✨ IMPORTAÇÃO CONCLUÍDA!
✅ Total importado: 428 transações
⚠️  Total ignorado: 12 transações
```

## 🐛 Solução de problemas

### "Erro ao ler arquivo Excel"
- Verifique o caminho do arquivo no script
- Confirme que o arquivo existe e não está aberto no Excel

### "Permission denied" ou "Unauthorized"
- Configure as credenciais do Firebase (veja seção Autenticação acima)
- Verifique se o User ID está correto

### "Aba vazia"
- Verifique se as abas têm conteúdo
- Confirme que os nomes das abas seguem o padrão "Mês AA" (ex: Mar 25)

## 🎨 Personalização

Para ajustar o comportamento do script, edite em `scripts/import-excel-12-months.js`:

- **EXCEL_FILE_PATH**: Caminho do arquivo Excel
- **expenseColumns**: Array com nomes das colunas de despesas
- **incomeColumns**: Array com nomes das colunas de receitas
- **categoryMap**: Mapeamento de nomes de categorias

## ⚠️ Atenção

- O script cria **novas transações** - não atualiza existentes
- Cada execução gerará um novo `import_batch_id` único
- As datas serão geradas baseadas no número da linha (pode ajustar no código)
- **Faça backup** antes de importar dados em produção!
