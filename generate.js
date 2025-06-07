// File: /root/Nebotsell/modules/generate.js (Versi Gabungan Final dengan Notifikasi)

const yaml = require('js-yaml');

// Variabel Global Modul
let localDBInstance;
let mainVarsInstance;
let mainNotificationGroupId;
const userState = {};

// =================================================================
// BAGIAN 1: SEMUA FUNGSI LAMA ANDA (TERMASUK FUNGSI NOTIFIKASI BARU)
// =================================================================

function isValidLink(link) {
    try {
        return link && (link.startsWith('vmess://') || link.startsWith('trojan://') || link.startsWith('vless://'));
    } catch (error) {
        console.error('Error validating link:', error);
        return false;
    }
}

function generateBugLink(link, bugAddress, bugSubdomain) {
    try {
        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);
            config.add = bugAddress;
            if (bugSubdomain) {
                config.host = bugSubdomain;
                config.sni = bugSubdomain;
            } else {
                if (config.tls === 'tls' || config.security === 'tls' || (config.streamSettings && config.streamSettings.security === 'tls')) {
                    config.sni = config.sni || config.host || bugAddress;
                }
                if (config.streamSettings && config.streamSettings.network === 'ws' && config.streamSettings.wsSettings) {
                    config.host = config.host || bugAddress;
                }
            }
            const newConfig = JSON.stringify(config);
            return `vmess://${Buffer.from(newConfig).toString('base64')}`;
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            const originalHostname = url.hostname;
            url.hostname = bugAddress;
            if (bugSubdomain) {
                params.set('sni', bugSubdomain);
                if (params.get('type') === 'ws') {
                    params.set('host', bugSubdomain);
                }
            } else {
                const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bugAddress);
                if (!params.has('sni') || params.has('peer')) {
                    params.set('sni', isIpAddress ? originalHostname : bugAddress);
                }
                if (params.get('type') === 'ws') {
                    if (!params.has('host')) {
                        params.set('host', bugAddress);
                    }
                }
            }
            if (params.has('peer')) params.delete('peer');
            url.search = params.toString();
            return url.toString();
        }
    } catch (error) {
        console.error('Error generating bug link:', error);
        return null;
    }
    return null;
}

function getLinkType(link) {
    if (link.startsWith('vmess://')) return 'VMESS';
    if (link.startsWith('trojan://')) return 'TROJAN';
    if (link.startsWith('vless://')) return 'VLESS';
    return 'UNKNOWN';
}

function getHost(link) {
    try {
        if (link.startsWith('vmess://')) {
            const config = JSON.parse(Buffer.from(link.replace('vmess://', ''), 'base64').toString('utf-8'));
            return config.host || config.add || 'N/A';
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            return params.get('host') || params.get('sni') || url.hostname || 'N/A';
        }
        return 'N/A';
    } catch (error) {
        console.error('Error getting host:', error);
        return 'ERROR_PARSING_HOST';
    }
}

function getUUID(link) {
    try {
        if (link.startsWith('vmess://')) {
            const config = JSON.parse(Buffer.from(link.replace('vmess://', ''), 'base64').toString('utf-8'));
            return config.id || 'N/A';
        }
        const url = new URL(link);
        return url.username || 'N/A';
    } catch (error) {
        console.error('Error getting UUID:', error);
        return 'ERROR_PARSING_UUID';
    }
}

async function getUserRole(userId) {
    return new Promise((resolve, reject) => {
        if (!localDBInstance) return reject(new Error("Database not initialized"));
        localDBInstance.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row?.role || 'member');
        });
    });
}

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    return text.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function sendGroupNotification(bot, username, userId, bugCode, linkType, userRole, date) {
    if (!mainNotificationGroupId) return;
    let displayName = bugCode;
    try {
        if (localDBInstance) {
            const bugInfo = await new Promise((resolve) => {
                localDBInstance.get('SELECT display_name FROM Bugs WHERE bug_code = ?', [bugCode], (err, row) => resolve(row));
            });
            if (bugInfo && bugInfo.display_name) displayName = bugInfo.display_name;
        }
    } catch (dbError) { }
    const userDisplay = username ? `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>` : `User <code>${userId}</code>`;
    const botName = mainVarsInstance?.NAMA_STORE || 'RyyStore Bot';
    const message = `<b>🛠️ Generate Bug Success</b>\n──────────────────────\n<b>➥ User:</b> ${userDisplay}\n<b>➥ Bug:</b> <code>${escapeHtml(displayName)}</code>\n<b>➥ Type:</b> <code>${escapeHtml(linkType)}</code>\n<b>➥ Role:</b> <code>${escapeHtml(userRole)}</code>\n<b>➥ Date:</b> <code>${escapeHtml(date)}</code>\n──────────────────────\n<i>Notification by ${botName}</i>`;
    try {
        await bot.telegram.sendMessage(mainNotificationGroupId, message, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (error) {
        console.error(`Gagal mengirim notifikasi ke grup ${mainNotificationGroupId}:`, error.message);
    }
}

// ---- [BARU] FUNGSI NOTIFIKASI KHUSUS UNTUK YAML ----
async function sendYamlNotification(ctx, count, mode) {
    if (!mainNotificationGroupId) return;

    const { id: userId, username } = ctx.from;
    const userRole = await getUserRole(userId).catch(() => 'member');
    const userDisplay = username ? `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>` : `User <code>${userId}</code>`;
    const botName = mainVarsInstance?.NAMA_STORE || 'RyyStore Bot';
    const date = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const message = `<b>📄 Convert YAML Success</b>\n──────────────────────\n` +
        `<b>➥ User:</b> ${userDisplay}\n` +
        `<b>➥ Role:</b> <code>${escapeHtml(userRole)}</code>\n` +
        `<b>➥ Jumlah Link:</b> <code>${count}</code>\n` +
        `<b>➥ Mode:</b> <code>${escapeHtml(mode)}</code>\n` +
        `<b>➥ Waktu:</b> <code>${escapeHtml(date)}</code>\n` +
        `──────────────────────\n` +
        `<i>Notifikasi oleh ${botName}</i>`;

    try {
        await ctx.telegram.sendMessage(mainNotificationGroupId, message, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (error) {
        console.error(`Gagal mengirim notifikasi YAML ke grup ${mainNotificationGroupId}:`, error.message);
    }
}


// =================================================================
// BAGIAN 2: FUNGSI-FUNGSI BARU UNTUK YAML
// =================================================================

function parseVpnLink(link) {
    try {
        if (link.startsWith('vmess://')) {
            const decoded = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf-8'));
            return {
                type: 'vmess', name: decoded.ps || 'Vmess-Config', server: decoded.add, port: decoded.port,
                uuid: decoded.id, alterId: decoded.aid || 0, cipher: 'auto', tls: (decoded.tls === 'tls'),
                network: decoded.net || 'ws', 'ws-opts': { path: decoded.path || '/', headers: { Host: decoded.host || decoded.add } },
                servername: decoded.host || decoded.add
            };
        } else {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            const type = url.protocol.slice(0, -1);
            return {
                type: type, name: decodeURIComponent(url.hash.substring(1)) || `${type}-config`, server: url.hostname,
                port: url.port, uuid: (type === 'vless') ? url.username : undefined,
                password: (type === 'trojan') ? url.username : undefined, network: params.get('type'),
                tls: params.get('security') === 'tls', sni: params.get('sni') || params.get('host') || url.hostname,
                'ws-opts': { path: params.get('path'), headers: { Host: params.get('host') || params.get('sni') || url.hostname } }
            };
        }
    } catch (e) { return null; }
}

function generateClashYaml(proxies) {
    proxies.forEach(p => {
        if (p['ws-opts']?.headers?.Host === undefined) {
            if (p['ws-opts']?.headers) delete p['ws-opts'].headers;
        }
    });
    const config = {
        'port': 7890, 'socks-port': 7891, 'allow-lan': false, 'mode': 'rule', 'log-level': 'info',
        'proxies': proxies,
        'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: proxies.map(p => p.name) }],
        'rules': ['MATCH,PROXY']
    };
    return yaml.dump(config, { indent: 2, noRefs: true, skipInvalid: true });
}

function applyBugToProxy(proxyObject, bugDetails) {
    if (!proxyObject || !bugDetails) return proxyObject;
    const newProxy = { ...proxyObject };
    newProxy.server = bugDetails.bug_address;
    if (bugDetails.bug_subdomain) {
        newProxy.servername = bugDetails.bug_subdomain;
        if (newProxy.network === 'ws' && newProxy['ws-opts']) {
            newProxy['ws-opts'].headers.Host = bugDetails.bug_subdomain;
        }
    }
    return newProxy;
}

// =================================================================
// BAGIAN 3: INISIALISASI DAN HANDLER BOT (GABUNGAN)
// =================================================================

function initGenerateBug(bot, dbInstance, adminUserIdsArray, varsObj, passedGroupId) {
    localDBInstance = dbInstance;
    mainVarsInstance = varsObj;
    mainNotificationGroupId = passedGroupId;
    console.log('[GENERATE.JS] Fitur Generate & Convert YAML (Gabungan) diinisialisasi.');

    const tutorialText = `
📄 <b>Tutorial Menggabungkan Link:</b>
1. Kirim link config pertama Anda.
2. Bot akan membalas. Kirim link kedua, ketiga, dst.
3. Jika semua link sudah dikirim, tekan tombol "✅ Selesai & Lanjutkan".
`;

    // Handler utama saat pengguna mengirim link
    bot.hears(/^(vmess:\/\/|trojan:\/\/|vless:\/\/)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const link = ctx.message.text;
        const state = userState[chatId];

        try { await ctx.deleteMessage(); } catch (e) { }

        if (state && state.step === 'collecting_links') {
            state.links.push(link);
            const count = state.links.length;
            try {
                await ctx.telegram.editMessageText(
                    chatId, state.lastMessageId, undefined,
                    `✅ Link ke-${count} diterima. Total: <b>${count} link</b>.\n\nKirim link berikutnya, atau tekan 'Selesai'.`,
                    {
                        parse_mode: 'HTML', reply_markup: {
                            inline_keyboard: [
                                [{ text: `✅ Selesai (${count} Link) & Lanjutkan`, callback_data: 'finish_collecting_links' }],
                                [{ text: '❌ Batalkan Semua', callback_data: 'cancel_generation' }]
                            ]
                        }
                    }
                );
            } catch (e) { /* ignore */ }
        } else {
            if (state?.lastMessageId) {
                try { await ctx.telegram.deleteMessage(chatId, state.lastMessageId); } catch (e) { }
            }
            userState[chatId] = { links: [link], step: 'collecting_links' };
            const reply = await ctx.replyWithHTML(
                "✅ Link pertama diterima.\n" + tutorialText, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Selesai (1 Link) & Lanjutkan', callback_data: 'finish_collecting_links' }],
                        [{ text: '❌ Batalkan', callback_data: 'cancel_generation' }]
                    ]
                }
            });
            userState[chatId].lastMessageId = reply.message_id;
        }
    });

    // Handler saat selesai kumpul link, menampilkan pilihan aksi
    bot.action('finish_collecting_links', async (ctx) => {
        const chatId = ctx.chat.id;
        const state = userState[chatId];
        if (!state || !state.links || state.links.length === 0) return ctx.answerCbQuery('Sesi tidak valid.', { show_alert: true });

        await ctx.answerCbQuery();

        const count = state.links.length;
        let message = `Total <b>${count} link</b> diterima. Silakan pilih aksi:`;

        // Pesan info jika link lebih dari 1 untuk fitur generate bug lama
        if (count > 1) {
            message += "\n\n<i>(Info: Fitur 'Generate Bug' hanya akan memproses link pertama dari ${count} link yang Anda kirim)</i>";
        }

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔩 Generate Bug (Link Pertama)', callback_data: 'generate_bug_dynamic' }],
                    [{ text: `📄 Convert ${count} Link ke YAML`, callback_data: 'convert_yaml_start' }]
                ]
            }
        });
    });

    // ------ ALUR LAMA: GENERATE BUG (TIDAK DIUBAH) ------
    bot.action('generate_bug_dynamic', async (ctx) => {
        const chatId = ctx.chat.id;
        // Ambil link PERTAMA dari state
        const link = userState[chatId]?.links[0];
        if (!link) {
            await ctx.answerCbQuery('Link tidak ditemukan. Mohon kirim ulang.', { show_alert: true });
            return ctx.editMessageText('⚠️ Sesi berakhir. Silakan kirim ulang link config Anda.');
        }
        userState[chatId].link = link; // Simpan link pertama untuk diproses

        try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }

        try {
            const activeBugs = await new Promise((resolve, reject) => {
                localDBInstance.all('SELECT bug_code, display_name FROM Bugs WHERE is_active = 1 ORDER BY display_name ASC', [], (err, rows) => err ? reject(err) : resolve(rows));
            });
            if (!activeBugs || activeBugs.length === 0) {
                return await ctx.reply('ℹ️ Tidak ada bug yang dikonfigurasi oleh admin.');
            }
            const bugButtons = activeBugs.map(bug => ({ text: bug.display_name, callback_data: `dynamicbugcode_${bug.bug_code}` }));
            const inline_keyboard = [];
            for (let i = 0; i < bugButtons.length; i += 2) {
                inline_keyboard.push(bugButtons.slice(i, i + 2));
            }
            inline_keyboard.push([{ text: '❌ Batal', callback_data: 'cancel_generation' }]);
            const reply = await ctx.reply('⚙️ Silakan pilih jenis bug yang akan digunakan:', { reply_markup: { inline_keyboard } });
            userState[chatId].lastMessageId = reply.message_id;
        } catch (dbError) {
            await ctx.reply('⚠️ Gagal mengambil daftar bug.');
        }
    });

   // Ganti blok fungsi ini di kode Anda

bot.action(/dynamicbugcode_(.+)/, async (ctx) => {
    const chatId = ctx.chat.id;
    const selectedBugCode = ctx.match[1];
    const link = userState[chatId]?.link; // Ambil link tunggal yang sudah disimpan
    if (!link) return ctx.answerCbQuery('Sesi berakhir, silakan ulangi.', { show_alert: true });

    try { await ctx.deleteMessage(); } catch (e) { }

    const bugDetails = await new Promise((resolve) => {
        localDBInstance.get('SELECT bug_address, bug_subdomain, display_name FROM Bugs WHERE bug_code = ? AND is_active = 1', [selectedBugCode], (_, row) => resolve(row));
    });
    if (!bugDetails) return await ctx.reply('⚠️ Bug yang Anda pilih tidak dapat ditemukan.');

    const newLink = generateBugLink(link, bugDetails.bug_address, bugDetails.bug_subdomain);
    if (newLink) {
        const userRole = await getUserRole(ctx.from.id).catch(() => 'member');
        const botName = mainVarsInstance?.NAMA_STORE || 'RyyStore Bot';
        
        // Kode balasan ke pengguna (tidak diubah)
        const reply = await ctx.replyWithHTML(`<b>🔧 Bug Berhasil Digenerate</b>\n──────────────────────\n<b>➥ Bug:</b> <code>${escapeHtml(bugDetails.display_name)}</code>\n<b>➥ Tipe Config:</b> <code>${escapeHtml(getLinkType(link))}</code>\n<b>➥ Pengguna:</b> ${ctx.from.username ? `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.username)}</a>` : `User <code>${ctx.from.id}</code>`}\n<b>➥ Host Asli:</b> <code>${escapeHtml(getHost(link))}</code>\n<b>➥ UUID/Password:</b> <code>${escapeHtml(getUUID(link))}</code>\n<b>➥ Server Bug:</b> <code>${escapeHtml(bugDetails.bug_address)}${bugDetails.bug_subdomain ? ` (SNI/Host: ${escapeHtml(bugDetails.bug_subdomain)})` : ''}</code>\n──────────────────────\n<b>🔗 Link Config Baru:</b>\n<code>${escapeHtml(newLink)}</code>\n──────────────────────\n<b>📅 Tanggal:</b> <code>${escapeHtml(new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }))}</code>\n──────────────────────\n<i>Generated by ${botName}</i>`, {
            reply_markup: { inline_keyboard: [[{ text: '📋 Salin Link', callback_data: 'copy_generated_link_local' }], [{ text: '🏠 Menu Utama', callback_data: 'main_menu_refresh' }]] },
            disable_web_page_preview: true
        });
        
        // Simpan link untuk fitur 'copy'
        userState[chatId].generatedLink = newLink;

        // Mengirim notifikasi ke grup
        await sendGroupNotification(
            bot,
            ctx.from.username,
            ctx.from.id,
            selectedBugCode,
            getLinkType(link),
            userRole,
            new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        );
        
        // ---- [PERBAIKAN] HAPUS SESI PENGGUNA SETELAH SELESAI ----
        delete userState[chatId];

    } else {
        await ctx.reply('⚠️ Gagal menggenerate link config dengan bug.');
        // Hapus juga sesi jika gagal
        delete userState[chatId];
    }
});

    bot.action('copy_generated_link_local', async (ctx) => {
        const generatedLink = userState[ctx.chat.id]?.generatedLink;
        if (generatedLink) {
            await ctx.reply(`Tap link di bawah untuk menyalin:\n<code>${escapeHtml(generatedLink)}</code>`, { parse_mode: 'HTML' });
        } else {
            await ctx.answerCbQuery('Tidak ada link untuk disalin.', { show_alert: true });
        }
    });

    // ------ ALUR BARU: CONVERT YAML ------
    bot.action('convert_yaml_start', async (ctx) => {
        const chatId = ctx.chat.id;
        if (!userState[chatId]) return;
        await ctx.answerCbQuery();
        await ctx.editMessageText(`Pilih tipe file YAML yang ingin dibuat untuk <b>${userState[chatId].links.length} link</b>:`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📄 Buat YAML Standar', callback_data: 'yaml_generate_standart' }],
                    [{ text: '🐞 Buat YAML dengan Bug', callback_data: 'yaml_select_bug' }],
                    [{ text: '🔙 Kembali', callback_data: 'finish_collecting_links' }]
                ]
            }
        });
    });

    bot.action('yaml_select_bug', async (ctx) => {
        try {
            const activeBugs = await new Promise((resolve, reject) => {
                localDBInstance.all('SELECT bug_code, display_name FROM Bugs WHERE is_active = 1 ORDER BY display_name ASC', [], (err, rows) => err ? reject(err) : resolve(rows || []));
            });
            if (activeBugs.length === 0) return await ctx.editMessageText('Tidak ada bug aktif yang bisa dipilih.');
            const bugButtons = activeBugs.map(bug => ({ text: bug.display_name, callback_data: `yaml_apply_bug_${bug.bug_code}` }));
            const inline_keyboard = [];
            for (let i = 0; i < bugButtons.length; i += 2) {
                inline_keyboard.push(bugButtons.slice(i, i + 2));
            }
            inline_keyboard.push([{ text: '🔙 Kembali', callback_data: 'convert_yaml_start' }]);
            await ctx.editMessageText('Silakan pilih bug yang akan diterapkan pada semua akun:', { reply_markup: { inline_keyboard } });
        } catch (e) {
            await ctx.editMessageText('Gagal mengambil daftar bug.');
        }
    });

    // ---- [DIUBAH] FUNGSI INI SEKARANG JUGA MEMANGGIL NOTIFIKASI ----
    const generateAndSendYaml = async (ctx, mode, bugDetails = null) => {
        const chatId = ctx.chat.id;
        const state = userState[chatId];
        if (!state || !state.links) return ctx.answerCbQuery('Sesi tidak valid.', { show_alert: true });
        await ctx.editMessageText('⏳ Sedang membuat file YAML, mohon tunggu...');

        let proxies = state.links.map(link => parseVpnLink(link)).filter(p => p !== null);
        let finalMode = "Standar";

        if (mode === 'bug' && bugDetails) {
            proxies = proxies.map(p => applyBugToProxy(p, bugDetails));
            finalMode = `Bug (${bugDetails.display_name})`;
        }

        if (proxies.length === 0) return ctx.editMessageText("Gagal memproses semua link yang Anda berikan.");

        const yamlContent = generateClashYaml(proxies);
        const fileName = `RyyStore_${mode}.yaml`;
        await ctx.deleteMessage();

        await ctx.replyWithDocument({ source: Buffer.from(yamlContent), filename: fileName }, {
            caption: `✅ File YAML berisi <b>${proxies.length} akun</b> berhasil dibuat dengan mode <b>${finalMode}</b>.`,
            parse_mode: 'HTML'
        });

        // ---- [BARU] MENGIRIM NOTIFIKASI KE GRUP ----
        await sendYamlNotification(ctx, proxies.length, finalMode);

        delete userState[chatId];
    };

    bot.action(/yaml_apply_bug_(.+)/, async (ctx) => {
        const bugCode = ctx.match[1];
        const bugDetails = await new Promise((resolve) => localDBInstance.get('SELECT * FROM Bugs WHERE bug_code = ?', [bugCode], (_, row) => resolve(row)));
        if (!bugDetails) return ctx.answerCbQuery("Bug tidak ditemukan.", { show_alert: true });
        await generateAndSendYaml(ctx, 'bug', bugDetails);
    });

    bot.action('yaml_generate_standart', (ctx) => generateAndSendYaml(ctx, 'standart'));

    bot.action('cancel_generation', async (ctx) => {
        const chatId = ctx.chat.id;
        delete userState[chatId];
        await ctx.answerCbQuery('Dibatalkan.', { show_alert: false });
        await ctx.editMessageText("Proses dibatalkan. Anda bisa mengirim link baru kapan saja.");
    });
}

module.exports = { initGenerateBug };