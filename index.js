require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const config = require("../config.json");
const database = require("./database");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TRANSCRIPT_BASE_URL = (process.env.TRANSCRIPT_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

const transcriptDir = path.join(__dirname, "..", "transcripts");
if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });

app.use("/transcripts", express.static(transcriptDir));
app.get("/", (_, res) => {
  res.send("<h1>Bot de Facção</h1><p>Servidor de transcripts online.</p>");
});

app.listen(PORT, () => console.log(`Site de transcripts: http://localhost:${PORT}`));

const commands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Mostra rankings da facção")
    .addSubcommand(s => s.setName("recrutamentos").setDescription("Ranking de recrutamentos")
      .addStringOption(o => o.setName("periodo").setDescription("Período").setRequired(true)
        .addChoices(
          { name: "Dia", value: "dia" },
          { name: "Semana", value: "semana" },
          { name: "Mês", value: "mes" },
          { name: "Total", value: "total" }
        )))
    .addSubcommand(s => s.setName("farms").setDescription("Ranking de farms")
      .addStringOption(o => o.setName("periodo").setDescription("Período").setRequired(true)
        .addChoices(
          { name: "Dia", value: "dia" },
          { name: "Semana", value: "semana" },
          { name: "Mês", value: "mes" },
          { name: "Total", value: "total" }
        ))),

  new SlashCommandBuilder()
    .setName("recrutar")
    .setDescription("Registra um recrutamento")
    .addUserOption(o => o.setName("membro").setDescription("Membro recrutado").setRequired(true)),

  new SlashCommandBuilder()
    .setName("farm")
    .setDescription("Registra uma entrega de farm")
    .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade entregue").setRequired(true).setMinValue(1))
    .addUserOption(o => o.setName("membro").setDescription("Membro que fez o farm").setRequired(false)),

  new SlashCommandBuilder()
    .setName("advertencia")
    .setDescription("Aplica uma advertência")
    .addUserOption(o => o.setName("membro").setDescription("Membro").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(true)),

  new SlashCommandBuilder()
    .setName("promover")
    .setDescription("Promove um membro para o próximo cargo")
    .addUserOption(o => o.setName("membro").setDescription("Membro").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rebaixar")
    .setDescription("Rebaixa um membro para o cargo anterior")
    .addUserOption(o => o.setName("membro").setDescription("Membro").setRequired(true)),

  new SlashCommandBuilder()
    .setName("exonerar")
    .setDescription("Remove o membro da facção")
    .addUserOption(o => o.setName("membro").setDescription("Membro").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(true)),

  new SlashCommandBuilder()
    .setName("painel-ticket")
    .setDescription("Envia o painel de criação de tickets"),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Mostra a configuração atual do bot")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`Logado como ${client.user.tag}`);

  try {
    if (process.env.GUILD_ID) {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      await guild.commands.set(commands);
      console.log("Comandos registrados no servidor.");
    } else {
      await client.application.commands.set(commands);
      console.log("Comandos globais registrados.");
    }
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on("guildMemberAdd", async member => {
  database.registerMember(member.guild.id, member.id);

  // Coloca automaticamente o primeiro cargo da hierarquia.
  const first = [...config.hierarchy].sort((a, b) => a.level - b.level)[0];
  if (first && first.roleId && !first.roleId.startsWith("COLOQUE_")) {
    try {
      await member.roles.add(first.roleId, "Registro automático da facção");
    } catch (e) {
      console.error("Não foi possível adicionar o cargo inicial:", e.message);
    }
  }

  await logAction(member.guild, `Novo membro registrado: <@${member.id}>`);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_type") {
      await createTicket(interaction, interaction.values[0]);
      return;
    }

    if (interaction.isButton() && interaction.customId === "ticket_close") {
      await closeTicket(interaction);
      return;
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      const message = "Ocorreu um erro ao executar essa ação.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(message).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
  }
});

async function handleCommand(interaction) {
  const { commandName } = interaction;

  if (["advertencia", "promover", "rebaixar", "exonerar", "painel-ticket", "config"].includes(commandName)) {
    if (!isLeadership(interaction.member)) {
      return interaction.reply({ content: "Você não possui permissão de liderança para usar este comando.", ephemeral: true });
    }
  }

  if (commandName === "recrutar") {
    const target = interaction.options.getMember("membro");
    if (!target) return interaction.reply({ content: "Membro não encontrado.", ephemeral: true });

    database.registerMember(interaction.guild.id, target.id);
    database.addRecruitment(interaction.guild.id, interaction.user.id, target.id);
    await syncHierarchy(target);

    await logAction(interaction.guild, `Recrutamento: <@${interaction.user.id}> recrutou <@${target.id}>.`);
    return interaction.reply(`✅ Recrutamento de ${target} registrado.`);
  }

  if (commandName === "farm") {
    const amount = interaction.options.getInteger("quantidade");
    const target = interaction.options.getMember("membro") || interaction.member;

    database.registerMember(interaction.guild.id, target.id);
    database.addFarm(interaction.guild.id, target.id, amount);

    await logAction(interaction.guild, `Farm registrado: <@${target.id}> entregou **${amount} ${config.currencyName}**.`);
    return interaction.reply(`🌾 Farm de ${amount} ${config.currencyName} registrado para ${target}.`);
  }

  if (commandName === "rank") {
    const type = interaction.options.getSubcommand();
    const period = interaction.options.getString("periodo");

    const rows = type === "recrutamentos"
      ? database.getRecruitmentRanking(interaction.guild.id, period)
      : database.getFarmRanking(interaction.guild.id, period);

    const title = type === "recrutamentos" ? "🏆 Ranking de Recrutamentos" : "🌾 Ranking de Farms";
    const lines = rows.length
      ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.total}**`).join("\n")
      : "Nenhum registro encontrado para esse período.";

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(title)
        .setDescription(lines)
        .setFooter({ text: `Período: ${period}` })]
    });
  }

  if (commandName === "advertencia") {
    const target = interaction.options.getMember("membro");
    const reason = interaction.options.getString("motivo");

    if (!target) return interaction.reply({ content: "Membro não encontrado.", ephemeral: true });

    database.addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
    const total = database.countWarnings(interaction.guild.id, target.id);

    await logAction(interaction.guild, `⚠️ Advertência em <@${target.id}> por <@${interaction.user.id}>. Motivo: ${reason}. Total: ${total}`);
    return interaction.reply(`⚠️ Advertência aplicada a ${target}. Total de advertências: **${total}**.`);
  }

  if (commandName === "promover") {
    return changeRank(interaction, 1);
  }

  if (commandName === "rebaixar") {
    return changeRank(interaction, -1);
  }

  if (commandName === "exonerar") {
    const target = interaction.options.getMember("membro");
    const reason = interaction.options.getString("motivo");

    if (!target) return interaction.reply({ content: "Membro não encontrado.", ephemeral: true });

    const current = getCurrentHierarchy(target);
    if (current) {
      await target.roles.remove(current.roleId).catch(() => {});
    }

    database.addAction(interaction.guild.id, target.id, interaction.user.id, "exonerar",
      current?.roleId || null, null, reason);

    await logAction(interaction.guild, `🚪 Exoneração: <@${target.id}> removido por <@${interaction.user.id}>. Motivo: ${reason}`);
    return interaction.reply(`🚪 ${target} foi removido da hierarquia da facção.`);
  }

  if (commandName === "painel-ticket") {
    const options = config.ticketTypes.map(t => ({
      label: t.label,
      value: t.value,
      description: t.description
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_type")
      .setPlaceholder("Selecione o tipo de atendimento")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🎫 Sistema de Ticket")
        .setDescription("Selecione abaixo o tipo de atendimento que você precisa.")],
      components: [row]
    });
  }

  if (commandName === "config") {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle(`⚙️ ${config.factionName}`)
        .addFields(
          { name: "Hierarquia", value: config.hierarchy.map(x => `${x.level}. ${x.name} — <@&${x.roleId}>`).join("\n") },
          { name: "Tickets", value: config.ticketTypes.map(x => `• ${x.label}`).join("\n") }
        )]
    });
  }
}

function isLeadership(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const roleId = process.env.LEADERSHIP_ROLE_ID;
  return roleId && member.roles.cache.has(roleId);
}

function getCurrentHierarchy(member) {
  const found = config.hierarchy
    .filter(h => h.roleId && !h.roleId.startsWith("COLOQUE_") && member.roles.cache.has(h.roleId))
    .sort((a, b) => b.level - a.level);
  return found[0] || null;
}

async function syncHierarchy(member) {
  const current = getCurrentHierarchy(member);
  if (!current) {
    const first = [...config.hierarchy].sort((a, b) => a.level - b.level)[0];
    if (first) await member.roles.add(first.roleId).catch(() => {});
  }
}

async function changeRank(interaction, direction) {
  const target = interaction.options.getMember("membro");
  if (!target) return interaction.reply({ content: "Membro não encontrado.", ephemeral: true });

  const current = getCurrentHierarchy(target);
  const ordered = [...config.hierarchy].sort((a, b) => a.level - b.level);

  if (!current) {
    return interaction.reply({ content: "Esse membro ainda não possui um cargo configurado na hierarquia.", ephemeral: true });
  }

  const index = ordered.findIndex(x => x.level === current.level);
  const next = ordered[index + direction];

  if (!next) {
    return interaction.reply({ content: direction > 0 ? "O membro já está no maior cargo." : "O membro já está no menor cargo.", ephemeral: true });
  }

  if (next.roleId.startsWith("COLOQUE_")) {
    return interaction.reply({ content: "Configure os IDs dos cargos no config.json.", ephemeral: true });
  }

  await target.roles.remove(current.roleId).catch(() => {});
  await target.roles.add(next.roleId);

  const action = direction > 0 ? "promover" : "rebaixar";
  database.addAction(interaction.guild.id, target.id, interaction.user.id, action, current.roleId, next.roleId, null);

  await logAction(interaction.guild,
    `${direction > 0 ? "⬆️" : "⬇️"} ${action}: <@${target.id}> foi de **${current.name}** para **${next.name}** por <@${interaction.user.id}>.`
  );

  return interaction.reply(`${direction > 0 ? "⬆️" : "⬇️"} ${target} agora é **${next.name}**.`);
}

async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const typeConfig = config.ticketTypes.find(t => t.value === type);
  const safeName = `${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);

  const existing = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    c.topic === `ticket:${interaction.user.id}`
  );

  if (existing) {
    return interaction.reply({ content: `Você já possui um ticket aberto: ${existing}`, ephemeral: true });
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
  ];

  if (process.env.LEADERSHIP_ROLE_ID) {
    overwrites.push({
      id: process.env.LEADERSHIP_ROLE_ID,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: process.env.TICKET_CATEGORY_ID || undefined,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: overwrites
  });

  const ticketId = database.createTicket(guild.id, channel.id, interaction.user.id, type);

  const close = new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("Fechar ticket")
    .setStyle(ButtonStyle.Danger);

  await channel.send({
    content: `${interaction.user} ${process.env.LEADERSHIP_ROLE_ID ? `<@&${process.env.LEADERSHIP_ROLE_ID}>` : ""}`,
    embeds: [new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticketId}`)
      .setDescription(`Tipo: **${typeConfig?.label || type}**\nExplique sua solicitação. A liderança poderá atender aqui.`)],
    components: [new ActionRowBuilder().addComponents(close)]
  });

  await interaction.reply({ content: `🎫 Ticket criado: ${channel}`, ephemeral: true });
}

async function closeTicket(interaction) {
  const ticket = database.getTicketByChannel(interaction.channel.id);
  if (!ticket) return interaction.reply({ content: "Este canal não é um ticket registrado.", ephemeral: true });

  if (ticket.owner_id !== interaction.user.id && !isLeadership(interaction.member)) {
    return interaction.reply({ content: "Apenas o autor ou a liderança pode fechar este ticket.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const messages = [];
  let lastId;

  while (true) {
    const batch = await interaction.channel.messages.fetch({ limit: 100, before: lastId });
    if (!batch.size) break;
    messages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  messages.reverse();

  const html = buildTranscriptHTML(interaction.channel, ticket, messages);
  const filename = `ticket-${ticket.id}-${Date.now()}.html`;
  fs.writeFileSync(path.join(transcriptDir, filename), html, "utf8");
  database.addTranscript(ticket.id, filename);
  database.closeTicket(interaction.channel.id);

  const url = `${TRANSCRIPT_BASE_URL}/transcripts/${encodeURIComponent(filename)}`;

  await logAction(interaction.guild, `🎫 Ticket #${ticket.id} fechado por <@${interaction.user.id}> — ${url}`);

  await interaction.editReply(`Transcript gerado: ${url}`);
  await interaction.channel.delete("Ticket encerrado").catch(() => {});
}

function buildTranscriptHTML(channel, ticket, messages) {
  const escape = s => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const body = messages.map(m => `
    <div class="message">
      <div class="author">${escape(m.author?.tag || "Usuário")} <span>${new Date(m.createdTimestamp).toLocaleString("pt-BR")}</span></div>
      <div class="content">${escape(m.content || "(sem texto)")}</div>
      ${m.attachments.size ? `<div class="attachments">${[...m.attachments.values()].map(a => `<a href="${escape(a.url)}">${escape(a.name || "anexo")}</a>`).join(" · ")}</div>` : ""}
    </div>
  `).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript #${ticket.id}</title>
<style>
body{font-family:Arial,sans-serif;background:#18191c;color:#eee;margin:0;padding:24px}
main{max-width:900px;margin:auto}
.card{background:#2b2d31;border-radius:12px;padding:20px}
.message{padding:12px 0;border-bottom:1px solid #444}
.author{font-weight:700}.author span{font-weight:400;color:#aaa;font-size:12px;margin-left:8px}
.content{white-space:pre-wrap;margin-top:5px}
a{color:#5aa9ff}
</style>
</head>
<body><main><div class="card">
<h1>Transcript — Ticket #${ticket.id}</h1>
<p>Canal: ${escape(channel.name)} · Tipo: ${escape(ticket.type)}</p>
<hr>${body}
</div></main></body></html>`;
}

async function logAction(guild, content) {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [new EmbedBuilder().setDescription(content).setTimestamp()] }).catch(() => {});
  }
}

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

if (!process.env.DISCORD_TOKEN) {
  console.error("Configure DISCORD_TOKEN no arquivo .env antes de iniciar.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
