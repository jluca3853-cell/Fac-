# Bot de Facção para Discord

Bot completo baseado nas funções mostradas nas imagens.

## Funções incluídas

### Registro + ranking de contratações
- Registro automático de novos membros.
- `/recrutar membro:@usuario`
- `/rank recrutamentos periodo:dia|semana|mes|total`
- Banco de dados SQLite.
- Ranking dos recrutadores.

### Farm + ranking
- `/farm quantidade:100`
- `/farm quantidade:100 membro:@usuario` para a liderança registrar em outro membro.
- `/rank farms periodo:dia|semana|mes|total`
- Soma individual por membro.

### Tickets
- `/painel-ticket`
- Menu de seleção com categorias configuráveis.
- Criação automática de canal privado.
- Botão para fechar.
- Transcript HTML.
- URL do transcript pelo site.
- Logs de abertura/fechamento.

### Hierarquia automática
- Cargo inicial automático quando alguém entra.
- `/promover membro:@usuario`
- `/rebaixar membro:@usuario`
- `/exonerar membro:@usuario motivo:...`
- Cargos e níveis definidos no `config.json`.
- O bot troca automaticamente o cargo antigo pelo novo.

### Advertências
- `/advertencia membro:@usuario motivo:...`
- Contagem automática das advertências.
- Registro no banco de dados.
- Log para a liderança.

### Logs
Configure `LOG_CHANNEL_ID` no `.env`.

## Instalação

1. Instale Node.js 18 ou superior.
2. Abra a pasta no terminal.
3. Rode:
   npm install
4. Copie `.env.example` para `.env`.
5. Coloque o token do bot e os IDs.
6. Edite `config.json` e coloque os IDs dos cargos da hierarquia.
7. No Discord Developer Portal, habilite o intent **Server Members Intent** e **Message Content Intent**.
8. Convide o bot com os escopos `bot` e `applications.commands`.
9. Dê ao bot permissão para gerenciar cargos, canais e enviar mensagens.
10. Rode:
    npm start

## Importante sobre a hierarquia

O cargo mais alto do bot precisa estar acima dos cargos que ele tenta adicionar/remover na lista de cargos do Discord.

Exemplo:
Bot
Líder
Gerente
Soldado
Recruta
Membro

## Transcript via site

O bot gera arquivos HTML na pasta `transcripts`.

Para o link funcionar para outras pessoas, o computador/servidor onde o bot está rodando precisa disponibilizar a porta do site publicamente, ou você pode hospedar o bot em um servidor que forneça uma URL pública.

Defina no `.env`:

TRANSCRIPT_BASE_URL=https://seu-dominio.com

Se estiver apenas testando no próprio computador:

TRANSCRIPT_BASE_URL=http://localhost:3000

## Banco

O arquivo `data.sqlite` é criado automaticamente. Ele guarda:
- membros;
- recrutamentos;
- farms;
- advertências;
- promoções/rebaixamentos/exonerações;
- tickets;
- transcripts.

Não apague esse arquivo se quiser preservar os dados.

## Segurança

Nunca coloque o token do bot dentro do código ou publique o `.env`.
Se o token vazar, gere outro no Discord Developer Portal.
