require('dotenv').config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SAFD Assistant System Status: ONLINE 24/7\n');
}).listen(PORT, () => {
    console.log(`[Keep-Alive Server] Listening on port ${PORT}`);
});

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const CATEGORY_ID = '1471130956206309407'; 
const REPORT_CHANNEL_ID = '1403593543045615697'; 
const STATS_FILE = './stats.json';
const TEMP_REPORTS_FILE = './temp_reports.json';
const BANNER_URL = 'https://cdn.discordapp.com/attachments/1352244521840148541/1521525182185996319/file_00000000d93071fa84c5a442d630a1b0.jpg?ex=6a812280&is=6a7fd100&hm=558a19e1cf83bcb3369a0d978218129e05394a1988e70b6e7dc3ecb542d8a0cd&';

const processingChannels = new Set();

const ROLE_COMMISSIONER_ADVISOR = '1341803925027950622';
const ROLE_HCT_OOC = '1342428001005998151';
const ROLE_COMMISSIONER = '1252187489091850323';
const ROLE_CITIZEN = '1252187542086750299';
const ROLE_HANDLE_UNBLACKLIST = '1284889393957437480';
const ROLE_DEPOSIT_HC = '1282485256682995742';

function loadStats() {
    if (fs.existsSync(STATS_FILE)) {
        try { return new Map(JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'))); } 
        catch (e) { return new Map(); }
    }
    return new Map();
}

function saveStats(statsMap) {
    try { fs.writeFileSync(STATS_FILE, JSON.stringify([...statsMap.entries()]), 'utf8'); } 
    catch (e) { console.error('Error save stats:', e); }
}

function loadTempReports() {
    if (fs.existsSync(TEMP_REPORTS_FILE)) {
        try { return new Map(JSON.parse(fs.readFileSync(TEMP_REPORTS_FILE, 'utf8'))); } 
        catch (e) { return new Map(); }
    }
    return new Map();
}

function saveTempReports(tempMap) {
    try { fs.writeFileSync(TEMP_REPORTS_FILE, JSON.stringify([...tempMap.entries()]), 'utf8'); } 
    catch (e) { console.error('Error save temp reports:', e); }
}

const userStats = loadStats();
const tempUserData = loadTempReports();

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function getFooterText() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).replace('.', ':');
    return `SAFD ASSISTANT SYSTEM • ${dateStr} • ${timeStr} WIB`;
}

function formatTimeDiff(lastReportTimestamp) {
    if (!lastReportTimestamp) return 'Belum Pernah Report Duty';
    const totalSec = Math.floor((Date.now() - lastReportTimestamp) / 1000);
    if (totalSec < 60) return 'Baru Saja';

    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);

    let parts = [];
    if (days > 0) parts.push(`${days} Hari`);
    if (hours > 0) parts.push(`${hours} Jam`);
    if (mins > 0) parts.push(`${mins} Menit`);

    return parts.length === 0 ? 'Baru Saja' : parts.join(' ') + ' yang lalu';
}

function formatHoursMins(totalMins) {
    return `${Math.floor(totalMins / 60)} Jam ${totalMins % 60} Menit`;
}

async function safeReply(interaction, content) {
    try {
        const payload = typeof content === 'string' ? { content } : content;
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply({ ...payload, ephemeral: true });
        }
    } catch (e) {
        console.error(`[SafeReply Error]: ${e.message}`);
    }
}

function createReportModal() {
    return new ModalBuilder()
        .setCustomId('modal_report_fd')
        .setTitle('REPORT DUTY FD CPRP')
        .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ic_name').setLabel('Nama IC').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('kegiatan').setLabel('Kegiatan').setStyle(TextInputStyle.Paragraph).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('jam_mulai').setLabel('Jam Mulai (HH:MM)').setStyle(TextInputStyle.Short).setPlaceholder('09:00').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('jam_selesai').setLabel('Jam Selesai (HH:MM)').setStyle(TextInputStyle.Short).setPlaceholder('11:00').setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note (Optional)').setStyle(TextInputStyle.Short).setRequired(false))
        );
}

client.once('ready', async () => {
    console.log(`Bot Ready 24/7: ${client.user.tag}`);
    const commands = [
        { name: 'setupreport', description: 'Setup Panel Utama Report Duty' },
        { name: 'timeduty', description: 'Cek total jam duty seluruh anggota SAFD' },
        { name: 'resetduty', description: 'Reset semua data time duty anggota' },
        { name: 'says', description: 'Kirim pesan anonim lewat bot', options: [{ name: 'pesan', description: 'Pesan', type: 3, required: true }] },
        {
            name: 'absensi', description: 'Form Absence Medical Department',
            options: [
                { name: 'nama', description: 'Nama IC', type: 3, required: true },
                { name: 'waktu', description: 'Lama waktu absen', type: 3, required: true },
                { name: 'tanggal_absen', description: 'Tanggal absen', type: 3, required: true },
                { name: 'alasan_ic', description: 'Alasan IC', type: 3, required: true },
                { name: 'alasan_ooc', description: 'Alasan OOC', type: 3, required: true }
            ]
        },
        {
            name: 'open_time', description: 'Informasi Open Time Unblacklist Fine Payment',
            options: [
                { name: 'location', description: 'Lokasi', type: 3, required: true },
                { name: 'status', description: 'Status', type: 3, required: true },
                { name: 'estimated_open', description: 'Estimasi', type: 3, required: true },
                { name: 'date', description: 'Tanggal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false }
            ]
        },
        {
            name: 'opentime_hc', description: 'Informasi Open Time HC Register',
            options: [
                { name: 'location', description: 'Lokasi', type: 3, required: true },
                { name: 'status', description: 'Status', type: 3, required: true },
                { name: 'estimated_open', description: 'Estimasi', type: 3, required: true },
                { name: 'date', description: 'Tanggal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false }
            ]
        },
        {
            name: 'blacklist', description: 'Log Blacklist SAFD',
            options: [
                { name: 'name', description: 'Nama IC', type: 3, required: true },
                { name: 'reason', description: 'Alasan', type: 3, required: true },
                { name: 'date', description: 'Tanggal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false },
                { name: 'picture1', description: 'Gambar 1', type: 11, required: false }
            ]
        },
        {
            name: 'unblacklist', description: 'Log Unblacklist SAFD',
            options: [
                { name: 'name', description: 'Nama IC', type: 3, required: true },
                { name: 'reason', description: 'Alasan', type: 3, required: true },
                { name: 'fine', description: 'Fine', type: 3, required: true },
                { name: 'date', description: 'Tanggal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false },
                { name: 'picture1', description: 'Gambar 1', type: 11, required: false }
            ]
        },
        {
            name: 'deposit_unblacklist', description: 'Log Deposit Unblacklist SAFD',
            options: [
                { name: 'reason', description: 'Alasan', type: 3, required: true },
                { name: 'nominal', description: 'Nominal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false },
                { name: 'picture1', description: 'Gambar 1', type: 11, required: false }
            ]
        },
        {
            name: 'deposit_hc', description: 'Log Deposit HC SAFD',
            options: [
                { name: 'nominal', description: 'Nominal', type: 3, required: true },
                { name: 'date', description: 'Tanggal', type: 3, required: true },
                { name: 'note', description: 'Note', type: 3, required: false },
                { name: 'picture1', description: 'Gambar 1', type: 11, required: false }
            ]
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands synced successfully!');
    } catch (err) {
        console.error('Failed to sync commands:', err);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_isi_report') {
                return await interaction.showModal(createReportModal()).catch(() => {});
            }

            if (interaction.customId === 'btn_selesai_report') {
                if (processingChannels.has(interaction.channel.id)) {
                    return await safeReply(interaction, '⏳ Report sedang diproses...');
                }
                processingChannels.add(interaction.channel.id);

                try {
                    await interaction.deferReply({ ephemeral: true });
                    const info = tempUserData.get(interaction.channel.id);
                    if (!info) {
                        processingChannels.delete(interaction.channel.id);
                        return await interaction.editReply({ content: '❌ Data report tidak ditemukan.' });
                    }

                    let mins = 0;
                    try {
                        const [h1, m1] = info.data.jamMulai.split(':').map(Number);
                        const [h2, m2] = info.data.jamSelesai.split(':').map(Number);
                        if (!isNaN(h1) && !isNaN(m1) && !isNaN(h2) && !isNaN(m2)) {
                            mins = (h2 * 60 + m2) - (h1 * 60 + m1);
                            if (mins < 0) mins += 1440;
                        }
                    } catch (e) { mins = 0; }

                    const existingStats = userStats.get(info.userId);
                    const lastReportText = formatTimeDiff(existingStats ? existingStats.lastReport : null);

                    const newStats = existingStats || { name: info.data.icName, totalMinutes: 0, lastReport: Date.now() };
                    newStats.totalMinutes += mins;
                    newStats.name = info.data.icName;
                    newStats.lastReport = Date.now();
                    userStats.set(info.userId, newStats);
                    saveStats(userStats);

                    const targetChannel = interaction.guild.channels.cache.get(REPORT_CHANNEL_ID);
                    const embed = new EmbedBuilder()
                        .setTitle('🚨 REPORT DUTY MASUK')
                        .setColor(getRandomColor())
                        .addFields(
                            { name: 'Nama', value: String(info.data.icName || '-') },
                            { name: 'Kegiatan', value: String(info.data.kegiatan || '-') },
                            { name: 'Jam', value: `${info.data.jamMulai || '-'} - ${info.data.jamSelesai || '-'}` },
                            { name: 'Total Menit', value: `${mins} Menit` },
                            { name: 'Last Report', value: lastReportText },
                            { name: 'Note', value: String(info.data.note || '-') },
                            { name: 'Reporter', value: `<@${info.userId}> | ${info.userId}` }
                        )
                        .setFooter({ text: getFooterText() });

                    if (targetChannel) {
                        await targetChannel.send({ embeds: [embed] });

                        try {
                            const messages = await interaction.channel.messages.fetch({ limit: 50 }).catch(() => new Map());
                            const fileAttachments = [];
                            messages.forEach(m => {
                                m.attachments.forEach(a => {
                                    if (a.url) fileAttachments.push({ attachment: a.url, name: a.name || 'ss_duty.png' });
                                });
                            });

                            if (fileAttachments.length > 0) {
                                await targetChannel.send({ 
                                    content: `**SSAN DUTY SAFD (${info.data.icName}) :**`, 
                                    files: fileAttachments.slice(0, 10) 
                                });
                            }
                        } catch (attErr) {
                            console.error('Attachment forwarding error:', attErr);
                        }
                    }

                    tempUserData.delete(interaction.channel.id);
                    saveTempReports(tempUserData);

                    await interaction.editReply({ content: '✅ Report Duty selesai! Channel akan dihapus dalam 5 detik.' });

                    setTimeout(async () => {
                        try { if (interaction.channel) await interaction.channel.delete(); } 
                        catch (e) {} 
                        finally { processingChannels.delete(interaction.channel.id); }
                    }, 5000);

                } catch (error) {
                    processingChannels.delete(interaction.channel.id);
                    await safeReply(interaction, '❌ Terjadi kesalahan saat memproses report.');
                }
                return;
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_report_fd') {
            await interaction.deferReply({ ephemeral: true });
            const data = {
                icName: interaction.fields.getTextInputValue('ic_name'),
                kegiatan: interaction.fields.getTextInputValue('kegiatan'),
                jamMulai: interaction.fields.getTextInputValue('jam_mulai'),
                jamSelesai: interaction.fields.getTextInputValue('jam_selesai'),
                note: interaction.fields.getTextInputValue('note') || '-'
            };

            let cleanUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!cleanUser || cleanUser.length < 2) cleanUser = `user-${interaction.user.id.slice(-4)}`;

            try {
                const reportChannel = await interaction.guild.channels.create({
                    name: `report-${cleanUser}`, 
                    type: ChannelType.GuildText, 
                    parent: CATEGORY_ID,
                    permissionOverwrites: [
                        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
                    ]
                });

                tempUserData.set(reportChannel.id, { data, userId: interaction.user.id });
                saveTempReports(tempUserData);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_selesai_report').setLabel('SELESAI REPORT').setStyle(ButtonStyle.Success)
                );

                await reportChannel.send({ 
                    content: `<@${interaction.user.id}>\n📸 **Upload screenshot duty maksimal 10 gambar.** Jika sudah selesai, klik tombol di bawah ini.`, 
                    components: [row] 
                });

                await interaction.editReply({ content: `✅ Channel report berhasil dibuat: ${reportChannel}` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Gagal membuat channel: ${err.message}` });
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const { commandName, options, user } = interaction;

            if (commandName === 'says') {
                await interaction.deferReply({ ephemeral: true });
                await interaction.channel.send({ content: options.getString('pesan') });
                await interaction.editReply({ content: '✅ Pesan anonim terkirim!' });
            }
            else if (commandName === 'setupreport') {
                await interaction.deferReply({ ephemeral: true });
                const embed = new EmbedBuilder()
                    .setTitle('REPORT DUTY FD CPRP')
                    .setColor(getRandomColor())
                    .setDescription(`**INSTRUKSI**\n• Isi form dengan benar\n• Upload gambar max 10\n• Klik tombol SELESAI REPORT\n• Trolling? TO 2 days\n\n*SAFD ASSISTANT SYSTEM*`);
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_isi_report').setLabel('ISI REPORT DUTY').setStyle(ButtonStyle.Danger)
                );
                await interaction.channel.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: 'Panel setup selesai!' });
            }
            else if (commandName === 'timeduty') {
                await interaction.deferReply();
                const sortedStats = [...userStats.entries()].sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
                if (sortedStats.length === 0) return await interaction.editReply({ content: '❌ Belum ada data duty.' });

                let descriptionText = '';
                for (let i = 0; i < sortedStats.length; i++) {
                    const data = sortedStats[i][1];
                    const line = `${i + 1}. **${data.name}**\n   ${formatHoursMins(data.totalMinutes)}\n   Total: ${data.totalMinutes} Menit\n   Last Report: ${formatTimeDiff(data.lastReport)}\n\n`;
                    if ((descriptionText + line).length > 3800) break;
                    descriptionText += line;
                }

                const embed = new EmbedBuilder()
                    .setTitle('TOTAL DUTY TIME SAFD')
                    .setColor(getRandomColor())
                    .setDescription(descriptionText.trim())
                    .setFooter({ text: getFooterText() });

                await interaction.editReply({ embeds: [embed] });
            }
            else if (commandName === 'resetduty') {
                await interaction.deferReply({ ephemeral: true });
                userStats.clear();
                saveStats(userStats);
                await interaction.editReply({ content: '✅ Data time duty di-reset!' });
            }
            else if (commandName === 'absensi') {
                await interaction.deferReply();
                const embed = new EmbedBuilder()
                    .setTitle('ABSENCE MEDICAL DEPARTMENT')
                    .setColor(getRandomColor())
                    .addFields(
                        { name: 'Nama', value: options.getString('nama') },
                        { name: 'Waktu', value: options.getString('waktu') },
                        { name: 'Tanggal Absen', value: options.getString('tanggal_absen') },
                        { name: 'Alasan IC', value: options.getString('alasan_ic') },
                        { name: 'Alasan OOC', value: options.getString('alasan_ooc') }
                    )
                    .setFooter({ text: getFooterText() });

                await interaction.editReply({
                    content: `<@&${ROLE_COMMISSIONER_ADVISOR}> <@&${ROLE_HCT_OOC}> <@&${ROLE_COMMISSIONER}>`,
                    embeds: [embed],
                    allowedMentions: { roles: [ROLE_COMMISSIONER_ADVISOR, ROLE_HCT_OOC, ROLE_COMMISSIONER] }
                });
            }
            else if (commandName === 'open_time' || commandName === 'opentime_hc') {
                await interaction.deferReply();
                const isHc = commandName === 'opentime_hc';
                const embed = new EmbedBuilder()
                    .setTitle(isHc ? 'HC Register' : 'Unblacklist Fine Payment')
                    .setColor(getRandomColor())
                    .addFields(
                        { name: 'Handle By', value: `<@${user.id}>` },
                        { name: 'Location', value: options.getString('location') },
                        { name: 'Status', value: options.getString('status') },
                        { name: 'Estimated Open', value: options.getString('estimated_open') },
                        { name: 'Date', value: options.getString('date') },
                        { name: 'Note', value: options.getString('note') || 'LANGSUNG KE ASGH / RS' }
                    )
                    .setImage(BANNER_URL)
                    .setFooter({ text: getFooterText() });

                await interaction.editReply({ content: `<@&${ROLE_CITIZEN}>`, embeds: [embed], allowedMentions: { roles: [ROLE_CITIZEN] } });
            }
            else if (['blacklist', 'unblacklist', 'deposit_unblacklist', 'deposit_hc'].includes(commandName)) {
                await interaction.deferReply();
                const embed = new EmbedBuilder().setColor(getRandomColor()).setFooter({ text: getFooterText() });
                let mentionRole = null;

                if (commandName === 'blacklist') {
                    embed.setTitle('LOGS BLACKLIST SAFD').addFields(
                        { name: 'Name', value: options.getString('name') },
                        { name: 'Reason', value: options.getString('reason') },
                        { name: 'From', value: `<@${user.id}>` },
                        { name: 'Date', value: options.getString('date') },
                        { name: 'Note', value: options.getString('note') || '-' }
                    );
                } else if (commandName === 'unblacklist') {
                    embed.setTitle('LOGS UNBLACKLIST SAFD').addFields(
                        { name: 'Name', value: options.getString('name') },
                        { name: 'Reason', value: options.getString('reason') },
                        { name: 'Fine', value: options.getString('fine') },
                        { name: 'From', value: `<@${user.id}>` },
                        { name: 'Date', value: options.getString('date') },
                        { name: 'Note', value: options.getString('note') || '-' }
                    );
                    mentionRole = ROLE_HANDLE_UNBLACKLIST;
                } else if (commandName === 'deposit_unblacklist') {
                    embed.setTitle('LOGS DEPOSIT UNBLACKLIST').addFields(
                        { name: 'Name', value: `<@${user.id}>` },
                        { name: 'Reason', value: options.getString('reason') },
                        { name: 'Nominal', value: options.getString('nominal') },
                        { name: 'Note', value: options.getString('note') || '-' }
                    );
                    mentionRole = ROLE_HANDLE_UNBLACKLIST;
                } else if (commandName === 'deposit_hc') {
                    embed.setTitle('LOGS DEPOSIT HC').addFields(
                        { name: 'Name', value: `<@${user.id}>` },
                        { name: 'Date', value: options.getString('date') },
                        { name: 'Nominal', value: options.getString('nominal') },
                        { name: 'Note', value: options.getString('note') || '-' }
                    );
                    mentionRole = ROLE_DEPOSIT_HC;
                }

                const pic1 = options.getAttachment('picture1');
                if (pic1) embed.setImage(pic1.url);

                const payload = { embeds: [embed] };
                if (mentionRole) {
                    payload.content = `<@&${mentionRole}>`;
                    payload.allowedMentions = { roles: [mentionRole] };
                }

                await interaction.editReply(payload);
            }
        }
    } catch (globalErr) {
        console.error('Interaction error:', globalErr);
    }
});

client.login(process.env.DISCORD_TOKEN);
