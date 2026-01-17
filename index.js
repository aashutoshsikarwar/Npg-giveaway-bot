const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const ms = require("ms");

// ================== CONFIG ==================
const GUILD_ID = process.env.GUILD_ID; // main server id
const WHITELIST_ROLES = process.env.WHITELIST_ROLES?.split(",") || [];
// ===========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Store giveaways in memory
const giveaways = new Map();

// ================== READY + COMMANDS ==================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔥 Clear old commands
  await client.application.commands.set([]);

  const commands = [
    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("🎉 Start a role-specific giveaway")
      .addStringOption(o =>
        o.setName("prize")
          .setDescription("Giveaway prize")
          .setRequired(true))
      .addStringOption(o =>
        o.setName("time")
          .setDescription("1m, 1h, 1d")
          .setRequired(true))
      .addIntegerOption(o =>
        o.setName("winners")
          .setDescription("Number of winners")
          .setRequired(true))
      .addRoleOption(o =>
        o.setName("role")
          .setDescription("Only this role can join")
          .setRequired(true))
      .addAttachmentOption(o =>
        o.setName("image")
          .setDescription("Upload image / GIF (optional)"))
      .addStringOption(o =>
        o.setName("imagelink")
          .setDescription("Image / GIF link (optional)")),

    new SlashCommandBuilder()
      .setName("reroll")
      .setDescription("🔁 Reroll a giveaway")
      .addStringOption(o =>
        o.setName("messageid")
          .setDescription("Giveaway message ID")
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName("end")
      .setDescription("⏹ End a giveaway")
      .addStringOption(o =>
        o.setName("messageid")
          .setDescription("Giveaway message ID")
          .setRequired(true))
  ];

  await client.application.commands.set(commands, GUILD_ID);
});

// ================== INTERACTIONS ==================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ---------- HOST PERMISSION CHECK ----------
  if (!interaction.member.roles.cache.some(r => WHITELIST_ROLES.includes(r.id))) {
    return interaction.reply({
      content: "❌ You are not allowed to host giveaways.",
      ephemeral: true
    });
  }

  // ---------- START GIVEAWAY ----------
  if (interaction.commandName === "giveaway") {
    const prize = interaction.options.getString("prize");
    const time = interaction.options.getString("time");
    const winners = interaction.options.getInteger("winners");
    const role = interaction.options.getRole("role");
    const attachment = interaction.options.getAttachment("image");
    const imageLink = interaction.options.getString("imagelink");

    const endTime = Date.now() + ms(time);

    const embed = new EmbedBuilder()
      .setTitle("🎉 GIVEAWAY 🎉")
      .setDescription(
        `🎁 **Prize:** ${prize}\n` +
        `👥 **Winners:** ${winners}\n` +
        `🎭 **Role:** ${role}\n` +
        `⏰ **Ends:** <t:${Math.floor(endTime / 1000)}:R>`
      )
      .setColor("Random")
      .setFooter({ text: "Click the button to participate!" });

    if (attachment) embed.setImage(attachment.url);
    else if (imageLink) embed.setImage(imageLink);

    const button = new ButtonBuilder()
      .setCustomId("join_giveaway")
      .setLabel("🎉 Join Giveaway")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      fetchReply: true
    });

    giveaways.set(msg.id, {
      prize,
      winners,
      roleId: role.id,
      participants: [],
      endTime,
      channelId: msg.channel.id
    });

    setTimeout(() => endGiveaway(msg.id), ms(time));
  }

  // ---------- REROLL ----------
  if (interaction.commandName === "reroll") {
    const id = interaction.options.getString("messageid");
    endGiveaway(id, true, interaction);
  }

  // ---------- END ----------
  if (interaction.commandName === "end") {
    const id = interaction.options.getString("messageid");
    endGiveaway(id, false, interaction, true);
  }
});

// ================== BUTTON HANDLER ==================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "join_giveaway") return;

  const giveaway = giveaways.get(interaction.message.id);
  if (!giveaway) return interaction.reply({ content: "❌ Giveaway not found.", ephemeral: true });

  if (!interaction.member.roles.cache.has(giveaway.roleId)) {
    return interaction.reply({
      content: "❌ You don’t have the required role.",
      ephemeral: true
    });
  }

  if (giveaway.participants.includes(interaction.user.id)) {
    return interaction.reply({
      content: "⚠️ You already joined.",
      ephemeral: true
    });
  }

  giveaway.participants.push(interaction.user.id);
  interaction.reply({ content: "✅ You joined the giveaway!", ephemeral: true });
});

// ================== END GIVEAWAY FUNCTION ==================
async function endGiveaway(messageId, reroll = false, interaction = null, manual = false) {
  const giveaway = giveaways.get(messageId);
  if (!giveaway) return;

  const channel = await client.channels.fetch(giveaway.channelId);
  const winners = giveaway.participants
    .sort(() => 0.5 - Math.random())
    .slice(0, giveaway.winners);

  const result =
    winners.length > 0
      ? winners.map(id => `<@${id}>`).join(", ")
      : "No valid participants 😢";

  await channel.send(
    `🎉 **Giveaway ${reroll ? "Rerolled" : "Ended"}!**\n` +
    `🎁 **Prize:** ${giveaway.prize}\n` +
    `🏆 **Winner(s):** ${result}`
  );

  giveaways.delete(messageId);

  if (interaction && manual) {
    interaction.reply({ content: "✅ Giveaway ended.", ephemeral: true });
  }
}

// ================== LOGIN ==================
client.login(process.env.BOT_TOKEN);
