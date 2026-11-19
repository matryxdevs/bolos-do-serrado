# Bolos do Cerrado Canaã | Catálogo com solicitações via WhatsApp (Node.js)

Aplicação profissional responsiva, com identidade verde e dourada, galeria de bolos, vídeo, localização no Google Maps, integração Instagram, **catálogo sem carrinho** e painel administrativo para acompanhamento dos clientes.

## Fluxo do cliente — sem carrinho

1. O cliente acessa `/` e escolhe **um bolo** do catálogo.
2. Clica no botão de solicitação do próprio produto.
3. O formulário solicita obrigatoriamente: **nome, telefone, e-mail, localização e quantidade** (1 a 50). Também permite observações e exibe consentimento de privacidade.
4. Após o envio, o servidor valida o produto e os dados e registra a solicitação no SQLite.
5. O navegador abre o WhatsApp com texto pronto, contendo **código, bolo, quantidade, valor (quando cadastrado), nome, telefone, e-mail, localização e observações**.
6. O cliente precisa **pressionar Enviar no WhatsApp** para entregar a mensagem à loja. A aplicação não envia mensagens automaticamente nem pode verificar se o cliente as enviou.

**Atenção à métrica:** a contagem no painel representa *solicitações iniciadas pelo formulário*, não vendas fechadas nem mensagens efetivamente entregues. Cada registro contém **um produto**. Para pedir outros bolos, o cliente faz outra solicitação.

## Painel administrativo `/admin`

- Tela inicial: **quantidade total de solicitações**, pendentes, produtos cadastrados e valor estimado dos pedidos marcados como concluídos.
- Seção **Clientes mais recentes**: nome, telefone, bolo e quantidade.
- Seção **Solicitações**: código, data, **nome, telefone, e-mail, localização, produto, quantidade, observações, preço e status**.
- Busca por nome, telefone, e-mail, código, localização e produto; filtro de status.
- Link para contatar o cliente no WhatsApp, atualização manual de status.
- Exportação de **CSV**, com dados de clientes e pedidos; backup SQLite.
- Inclusão/edição/exclusão de bolos, fotos, preço opcional, publicação e disponibilidade.
- Configurações de WhatsApp, endereço, Instagram, horários, banner e vídeo.

**Produtos iniciais:** seis **exemplos ilustrativos visíveis, mas indisponíveis** para pedido. O administrador deve corrigir o catálogo, informar preços, inserir fotos reais e ativar produtos disponíveis. Fotos ilustrativas não são publicações reais da loja.

## Iniciar no VS Code

Pré-requisito: **Node.js 22.13+** (testado com Node 22.16.0; utiliza `node:sqlite` nativo e não possui dependências externas).

1. Extraia o ZIP e abra a pasta pelo VS Code.
2. Copie `.env.example` para `.env`.
3. Edite `ADMIN_PASSWORD` com senha forte de pelo menos 12 caracteres e `SESSION_SECRET` com pelo menos 32 caracteres aleatórios.
4. Em teste local, configure `NODE_ENV=development` para servir o login em `http://localhost`.
5. No terminal, execute `npm start`.
6. Acesse `http://localhost:3000` (site) e `http://localhost:3000/admin` (painel).

Gerar chave de sessão: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

## Instalar na Hostinger

1. No hPanel, confirme que o plano suporta uma **aplicação Node.js 22.13+**.
2. Crie uma aplicação Node.js, envie os arquivos do ZIP e mantenha `server.js`, `package.json`, `public/` e `private/` na **raiz da aplicação**.
3. Configure o início com **`npm start`**. O servidor já utiliza `process.env.PORT` e escuta em `0.0.0.0`.
4. Configure variáveis de ambiente `NODE_ENV=production`, `ADMIN_PASSWORD` e `SESSION_SECRET`. O `.env` não deve ser enviado a repositórios públicos.
5. Defina `DATA_DIR` em um **diretório persistente, fora de `public/`**, quando disponibilizado pela hospedagem. Banco e uploads são armazenados ali. Sem armazenamento persistente, redeploy pode **apagar pedidos e fotos**.
6. Habilite **HTTPS**, acesse `https://SEU-DOMINIO/health` para verificar a aplicação e depois faça login em `https://SEU-DOMINIO/admin`.
7. Ajuste WhatsApp, endereço, horário, logo/imagens e produtos. Não publique o catálogo oficial com preços ou imagens ilustrativas sem revisão.

## Atualizar um projeto anterior desta loja

- Faça **backup** da versão anterior em `/api/admin/backup` antes de qualquer atualização.
- Mantenha o diretório original `DATA_DIR` apontando para o mesmo banco SQLite e uploads, se desejar preservar dados.
- Esta versão migra automaticamente a tabela `orders` para adicionar `customer_email`. Solicitações antigas ficam com e-mail vazio, exibidas como "Não informado (pedido antigo)".
- A aplicação deixa de aceitar o formato de solicitação com múltiplos itens (carrinho); a nova API recebe `product_id` e `quantity` de um único produto.
- **Nunca sobreponha o banco de dados de produção com um banco de exemplo.** O ZIP entregue não contém banco de dados.

## Dados e privacidade

O registro inclui nome, telefone, e-mail e localização, portanto há coleta de **dados pessoais**. A loja deve informar finalidade, base legal, controlador, canal de direitos dos titulares e período de retenção, cumprir a LGPD e proteger o acesso, os backups e o armazenamento. O site inclui `/privacidade.html` como texto inicial, **não como política jurídica definitiva**.

O painel utiliza senha via variável de ambiente, sessão HttpOnly, SameSite, proteção CSRF e rate limits básicos. Para produção, use SSL e mantenha senha e chave em segredo. O cliente precisa confirmar pelo WhatsApp; solicitações abertas não equivalem a vendas.

## Personalização e arquivos

```
server.js               Node HTTP / rotas / SQLite
package.json            npm start
.env.example            exemplo de variáveis
public/index.html       catálogo e formulário individual
public/script.js        comportamento do catálogo e WhatsApp
public/commerce.css     estilos do formulário
public/styles.css       identidade visual verde/dourada
public/assets/          logo e vídeo demonstrativo
public/privacidade.html explicação inicial sobre dados pessoais
private/admin.html      painel
private/admin.js        gestão de produtos e clientes
private/admin.css       estilos do painel
data/.gitkeep           diretório para SQLite; o ZIP NÃO inclui banco
```

### Dados configurados (exigem confirmação)

- WhatsApp inicial: `5594991195754`.
- Instagram: `https://www.instagram.com/bolosdocerradocanaa/`.
- Endereço inicial: Rua Novo Horizonte, 95, Canaã dos Carajás/PA.
- Horários: a confirmar.

A versão inicial do site usa **imagens e vídeo ilustrativos**. Confirme os dados comerciais antes da publicação.
