// File: ./generate.js

// Telegraf mungkin tidak perlu di-require lagi di sini jika instance bot sudah di-pass
// const { Telegraf } = require('telegraf');

// Variabel ini akan diisi saat initGenerateBug dipanggil dari file utama
let localDBInstance;
let mainVarsInstance; // Untuk mengakses variabel lain dari .vars.json seperti NAMA_STORE
let mainNotificationGroupId; // Variabel untuk menyimpan GROUP_ID utama yang di-pass

// User state tracking (lokal untuk generate.js)
const userState = {};

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
                config.host = bugSubdomain; // Host header untuk WS
                config.sni = bugSubdomain;  // SNI untuk TLS
            } else {
                // Jika tidak ada bugSubdomain, SNI dan host header (jika ws) perlu dipertimbangkan
                // berdasarkan konfigurasi asli dan bugAddress.
                // Jika config asli punya host, gunakan itu untuk SNI jika TLS aktif & tidak ada sni spesifik
                if (config.tls === 'tls' || config.security === 'tls' || (config.streamSettings && config.streamSettings.security === 'tls')) {
                     config.sni = config.sni || config.host || bugAddress; // Prioritaskan SNI asli, lalu host asli, baru bugAddress
                }
                // Untuk WebSocket, host header juga penting
                if (config.streamSettings && config.streamSettings.network === 'ws' && config.streamSettings.wsSettings) {
                    config.host = config.host || bugAddress; // Prioritaskan host asli, baru bugAddress
                }
            }

            const newConfig = JSON.stringify(config);
            return `vmess://${Buffer.from(newConfig).toString('base64')}`;
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            const originalHostname = url.hostname;
            url.hostname = bugAddress; // Alamat utama diganti dengan bugAddress

            if (bugSubdomain) {
                params.set('sni', bugSubdomain);
                if (params.get('type') === 'ws') {
                    params.set('host', bugSubdomain);
                }
            } else {
                // Jika tidak ada bugSubdomain, SNI diisi dengan hostname asli jika bugAddress IP, atau bugAddress jika domain
                // Host header (jika ws) diisi dengan bugAddress
                const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bugAddress);
                // Hanya set SNI jika belum ada, atau override jika ada 'peer'
                if (!params.has('sni') || params.has('peer')) {
                    params.set('sni', isIpAddress ? originalHostname : bugAddress);
                }
                if (params.get('type') === 'ws') {
                     // Hanya set host jika belum ada
                    if (!params.has('host')) {
                        params.set('host', bugAddress);
                    }
                }
            }
            if(params.has('peer')) params.delete('peer'); // Hapus 'peer' karena 'sni' lebih umum

            url.search = params.toString();
            return url.toString();
        }
    } catch (error) {
        console.error('Error generating bug link:', error);
        return null;
    }
    return null; // Fallback jika tipe link tidak cocok
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
        // Untuk Vless dan Trojan, UUID/Password ada di bagian username dari URL
        const url = new URL(link);
        return url.username || 'N/A'; // url.username mengambil bagian sebelum '@'
    } catch (error) {
        console.error('Error getting UUID:', error);
        return 'ERROR_PARSING_UUID';
    }
}

async function getUserRole(userId) {
    return new Promise((resolve, reject) => {
        if (!localDBInstance) {
            console.error("[DB_ERROR] localDBInstance not initialized in getUserRole (generate.js)");
            return reject(new Error("Database (localDBInstance) not initialized in generate.js"));
        }
        localDBInstance.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) {
                console.error(`[DB_ERROR] Failed to get role for user ${userId}:`, err.message);
                reject(err);
            } else {
                resolve(row?.role || 'member');
            }
        });
    });
}

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function sendGroupNotification(bot, username, userId, bugCode, linkType, userRole, date) {
    console.log(`[SEND_GROUP_NOTIF_ENTRY] Fungsi sendGroupNotification dipanggil. Nilai mainNotificationGroupId: '${mainNotificationGroupId}', Tipe: ${typeof mainNotificationGroupId}`); // LOG A

    if (!mainNotificationGroupId) {
        console.warn("[BUG_GEN_NOTIF] GROUP_ID for notification is not set (mainNotificationGroupId is falsy). NOTIFIKASI TIDAK DIKIRIM."); // LOG B
        return;
    }

    let displayName = bugCode; // Default ke bug_code
    try {
        if (!localDBInstance) {
            console.warn("[DB_WARN] localDBInstance not initialized in sendGroupNotification, cannot fetch display_name for bug.");
        } else {
            const bugInfo = await new Promise((resolve, reject) => {
                localDBInstance.get('SELECT display_name FROM Bugs WHERE bug_code = ?', [bugCode], (err, row) => {
                    if (err) {
                         console.error(`[DB_ERROR] Failed to fetch display_name for bug_code ${bugCode}:`, err.message);
                         resolve(null); // Resolve null agar tidak menghentikan notif, fallback ke bug_code
                    } else {
                        resolve(row);
                    }
                });
            });
            if (bugInfo && bugInfo.display_name) {
                displayName = bugInfo.display_name;
            }
        }
    } catch (dbError) { // Seharusnya error sudah ditangani di promise di atas
        console.error("[DB_UNEXPECTED_ERROR] Unexpected error fetching display_name for bug_code:", bugCode, dbError.message);
    }

    const userDisplay = username
        ? `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>`
        : `User <code>${userId}</code>`;

    const botName = (mainVarsInstance && mainVarsInstance.NAMA_STORE) ? mainVarsInstance.NAMA_STORE : 'RyyStore Bot';

    const message = `
<b>🛠️ Generate Bug Success</b>
──────────────────────
<b>➥ User:</b> ${userDisplay}
<b>➥ Bug:</b> <code>${escapeHtml(displayName)}</code>
<b>➥ Type:</b> <code>${escapeHtml(linkType)}</code>
<b>➥ Role:</b> <code>${escapeHtml(userRole)}</code>
<b>➥ Date:</b> <code>${escapeHtml(date)}</code>
──────────────────────
<i>Notification by ${botName}</i>`;

    try {
        await bot.telegram.sendMessage(mainNotificationGroupId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        console.log(`[BUG_GEN_NOTIF_SUCCESS] Notifikasi berhasil dikirim ke grup ${mainNotificationGroupId} untuk bug ${displayName} (kode: ${bugCode})`); // LOG C
    } catch (error) {
        console.error(`[BUG_GEN_NOTIF_ERROR] Gagal mengirim notifikasi ke grup ${mainNotificationGroupId}:`, error.message, error); // LOG D (Sertakan objek error utuh untuk detail)
    }
}

/**
 * Menginisialisasi fungsionalitas generate bug.
 * @param {Telegraf} bot Instance Telegraf.
 * @param {sqlite3.Database} dbInstance Koneksi database.
 * @param {Array<number>|number} adminUserIdsArray ID admin atau array ID admin (saat ini tidak digunakan di sini, tapi parameter ada).
 * @param {object} varsObj Variabel konfigurasi dari .vars.json.
 * @param {string} passedGroupId ID grup utama untuk notifikasi yang di-pass dari file utama.
 */
function initGenerateBug(bot, dbInstance, adminUserIdsArray, varsObj, passedGroupId) {
    console.log('----------------------------------------------------------');
    console.log('[INIT_GENERATE_BUG_ENTRY] Fungsi initGenerateBug dipanggil.'); // LOG 1
    localDBInstance = dbInstance;
    mainVarsInstance = varsObj;

    console.log(`[INIT_GENERATE_BUG_ARGS] Nilai passedGroupId yang diterima: '${passedGroupId}', Tipe: ${typeof passedGroupId}`); // LOG 2

    mainNotificationGroupId = passedGroupId; // Simpan GROUP_ID yang di-pass

    if (mainNotificationGroupId && typeof mainNotificationGroupId === 'string' && mainNotificationGroupId.trim() !== '') {
        console.log(`[INIT_GENERATE_BUG_SUCCESS] mainNotificationGroupId berhasil di-set menjadi: '${mainNotificationGroupId}'`); // LOG 3
    } else {
        console.warn(`[INIT_GENERATE_BUG_WARN] GAGAL: mainNotificationGroupId adalah '${mainNotificationGroupId}' (tipe: ${typeof mainNotificationGroupId}). Notifikasi grup mungkin tidak berfungsi.`); // LOG 4 (lebih detail)
    }
    console.log('----------------------------------------------------------');

    bot.hears(/^(vmess:\/\/|trojan:\/\/|vless:\/\/)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const link = ctx.message.text;

        if (!isValidLink(link)) {
            try { await ctx.deleteMessage(); } catch(e) { /* ignore */ }
            const reply = await ctx.reply('❌ Link tidak valid. Mohon kirim link vmess://, trojan://, atau vless:// yang benar.');
            userState[chatId] = { ...userState[chatId], lastBotMessageIdForInvalidLink: reply.message_id };
            return;
        }

        if (userState[chatId]?.lastBotMessageIdForInvalidLink) {
            try { await ctx.telegram.deleteMessage(chatId, userState[chatId].lastBotMessageIdForInvalidLink); } catch (e) { /* ignore */ }
            delete userState[chatId].lastBotMessageIdForInvalidLink;
        }

        try { await ctx.deleteMessage(); } catch(e) { /* ignore */ }

        if (userState[chatId]?.lastMessageId) {
            try { await ctx.telegram.deleteMessage(chatId, userState[chatId].lastMessageId); } catch (error) { /* ignore */ }
        }

        userState[chatId] = { link, step: 'awaiting_action' };

        const reply = await ctx.reply('✅ Link valid! Silakan pilih aksi:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔩 Generate Bug', callback_data: 'generate_bug_dynamic' }]
                ]
            }
        });
        userState[chatId].lastMessageId = reply.message_id;
    });

    bot.action('generate_bug_dynamic', async (ctx) => {
        const chatId = ctx.chat.id;
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.answerCbQuery('Link tidak ditemukan. Mohon kirim ulang link config Anda.', { show_alert: true });
            try { await ctx.deleteMessage(); } catch(e) {}
            const newReply = await ctx.reply('⚠️ Sesi berakhir atau link tidak ditemukan. Silakan kirim ulang link config Anda.');
            userState[chatId] = { lastMessageId: newReply.message_id };
            return;
        }
        
        if (userState[chatId]?.lastMessageId) {
            try { await ctx.telegram.deleteMessage(chatId, userState[chatId].lastMessageId); } catch (error) { /* ignore */ }
        } else if (ctx.callbackQuery?.message?.message_id) {
            try { await ctx.deleteMessage(); } catch(e) { /* ignore */ }
        }

        try {
            if (!localDBInstance) {
                console.error("[DB_ERROR] localDBInstance not initialized in generate_bug_dynamic action.");
                await ctx.answerCbQuery('Error: Database tidak terinisialisasi.', { show_alert: true });
                const reply = await ctx.reply('⚠️ Terjadi masalah dengan database. Silakan hubungi admin.');
                userState[chatId] = { ...userState[chatId], lastMessageId: reply.message_id };
                return;
            }
            const activeBugs = await new Promise((resolve, reject) => {
                localDBInstance.all('SELECT bug_code, display_name FROM Bugs WHERE is_active = 1 ORDER BY display_name ASC', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (!activeBugs || activeBugs.length === 0) {
                await ctx.answerCbQuery('Tidak ada bug aktif yang tersedia saat ini.', { show_alert: true });
                const reply = await ctx.reply('ℹ️ Tidak ada bug yang dikonfigurasi oleh admin atau semua bug sedang tidak aktif.');
                userState[chatId] = { ...userState[chatId], lastMessageId: reply.message_id, step: 'awaiting_action' };
                return;
            }

            const bugButtons = activeBugs.map(bug => ({
                text: bug.display_name,
                callback_data: `dynamicbugcode_${bug.bug_code}`
            }));

            const inline_keyboard = [];
            for (let i = 0; i < bugButtons.length; i += 2) {
                inline_keyboard.push(bugButtons.slice(i, i + 2));
            }
            inline_keyboard.push([{ text: '❌ Batal & Kembali ke Menu', callback_data: 'cancel_bug_generation_local_and_menu' }]);

            const reply = await ctx.reply('⚙️ Silakan pilih jenis bug yang akan digunakan:', {
                reply_markup: { inline_keyboard }
            });
            userState[chatId].lastMessageId = reply.message_id;

        } catch (dbError) {
            console.error("Error fetching active bugs:", dbError.message);
            await ctx.answerCbQuery('Terjadi error saat mengambil daftar bug.', { show_alert: true });
            const reply = await ctx.reply('⚠️ Gagal mengambil daftar bug. Silakan coba beberapa saat lagi.');
            userState[chatId] = { ...userState[chatId], lastMessageId: reply.message_id, step: 'awaiting_action' };
        }
    });

    bot.action('cancel_bug_generation_local_and_menu', async (ctx) => {
        const chatId = ctx.chat.id;
        if (userState[chatId]?.lastMessageId) {
            try { await ctx.telegram.deleteMessage(chatId, userState[chatId].lastMessageId); } catch (error) { /* ignore */ }
        }
        delete userState[chatId];
        await ctx.answerCbQuery('Pembuatan bug dibatalkan.');
        
        try {
            // Kirim pesan baru dengan tombol kembali ke menu utama
            // karena pesan sebelumnya (jika ada) sudah dihapus
            await ctx.reply("Dibatalkan. Kembali ke menu utama.", {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔄 Menu Utama', callback_data: 'main_menu_refresh' }]]
                }
            });
        } catch (e) {
            console.error("Error sending cancel message with menu refresh trigger:", e.message);
            // Fallback jika reply gagal
            await ctx.telegram.sendMessage(chatId, "Proses dibatalkan. Silakan ketik /menu untuk kembali.").catch(err => console.error("Fallback cancel message failed:", err));
        }
    });

    bot.action(/dynamicbugcode_(.+)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const selectedBugCode = ctx.match[1];
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.answerCbQuery('Link config tidak ditemukan. Mohon kirim ulang link config Anda.', { show_alert: true });
            try { await ctx.deleteMessage(); } catch(e) {}
            const newReply = await ctx.reply('⚠️ Sesi berakhir atau link config tidak ditemukan. Silakan kirim ulang link config Anda.');
            userState[chatId] = { lastMessageId: newReply.message_id };
            return;
        }
        
        if (userState[chatId]?.lastMessageId) {
            try { await ctx.telegram.deleteMessage(chatId, userState[chatId].lastMessageId); } catch (error) { /* ignore */ }
        } else if (ctx.callbackQuery?.message?.message_id) {
            try { await ctx.deleteMessage(); } catch(e) { /* ignore */ }
        }

        try {
            if (!localDBInstance) {
                console.error("[DB_ERROR] localDBInstance not initialized in dynamicbugcode_ action.");
                await ctx.answerCbQuery('Error: Database tidak terinisialisasi.', { show_alert: true });
                const reply = await ctx.reply('⚠️ Terjadi masalah dengan database. Silakan hubungi admin.');
                userState[chatId] = { ...userState[chatId], lastMessageId: reply.message_id };
                return;
            }
            const bugDetails = await new Promise((resolve, reject) => {
                localDBInstance.get('SELECT bug_address, bug_subdomain, display_name FROM Bugs WHERE bug_code = ? AND is_active = 1', [selectedBugCode], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!bugDetails) {
                await ctx.answerCbQuery('Bug yang dipilih tidak tersedia atau tidak aktif.', { show_alert: true });
                const reply = await ctx.reply('⚠️ Bug yang Anda pilih tidak dapat ditemukan atau sedang tidak aktif.');
                userState[chatId] = { ...userState[chatId], lastMessageId: reply.message_id, step: 'awaiting_action' };
                return;
            }

            const { bug_address, bug_subdomain, display_name } = bugDetails;
            const newLink = generateBugLink(link, bug_address, bug_subdomain);

            if (newLink) {
                const userRole = await getUserRole(ctx.from.id).catch(err => 'member'); // Default ke member jika role gagal diambil
                const botName = (mainVarsInstance && mainVarsInstance.NAMA_STORE) ? mainVarsInstance.NAMA_STORE : 'RyyStore Bot';

                const reply = await ctx.replyWithHTML(`
<b>🔧 Bug Berhasil Digenerate</b>
──────────────────────
<b>➥ Bug:</b> <code>${escapeHtml(display_name)}</code>
<b>➥ Tipe Config:</b> <code>${escapeHtml(getLinkType(link))}</code>
<b>➥ Pengguna:</b> ${ctx.from.username ? `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.username)}</a>` : `User <code>${ctx.from.id}</code>`}
<b>➥ Host Asli:</b> <code>${escapeHtml(getHost(link))}</code>
<b>➥ UUID/Password:</b> <code>${escapeHtml(getUUID(link))}</code>
<b>➥ Server Bug:</b> <code>${escapeHtml(bug_address)}${bug_subdomain ? ` (SNI/Host: ${escapeHtml(bug_subdomain)})` : ''}</code>
──────────────────────
<b>🔗 Link Config Baru:</b>
<code>${escapeHtml(newLink)}</code>
──────────────────────
<b>📅 Tanggal:</b> <code>${escapeHtml(new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }))}</code>
──────────────────────
<i>Generated by ${botName}</i>
`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Salin Link', callback_data: 'copy_generated_link_local' }],
                            [{ text: '↩️ Generate Lagi (Link Sama)', callback_data: 'generate_bug_dynamic'}],
                            [{ text: '🏠 Menu Utama', callback_data: 'main_menu_refresh' }]
                        ]
                    },
                    disable_web_page_preview: true
                });
                userState[chatId] = {
                    ...userState[chatId],
                    lastMessageId: reply.message_id,
                    generatedLink: newLink,
                    step: 'bug_generated'
                };
                
                // Log sebelum memanggil sendGroupNotification
                console.log(`[ACTION_DYNAMICBUGCODE] Memanggil sendGroupNotification. Nilai mainNotificationGroupId saat ini: '${mainNotificationGroupId}'`); // LOG 5
                await sendGroupNotification(bot, ctx.from.username, ctx.from.id, selectedBugCode, getLinkType(link), userRole, new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }));
            } else {
                await ctx.reply('⚠️ Gagal menggenerate link config dengan bug. Kemungkinan format link config awal tidak sepenuhnya standar atau ada error internal.');
            }
        } catch (dbError) {
            console.error("Error processing dynamic bug selection:", dbError.message, dbError.stack); // Tambahkan stack trace
            await ctx.reply('⚠️ Terjadi kesalahan saat memproses bug yang Anda pilih.');
        }
    });

    bot.action('copy_generated_link_local', async (ctx) => {
        const chatId = ctx.chat.id;
        const generatedLink = userState[chatId]?.generatedLink;

        if (generatedLink) {
            await ctx.answerCbQuery('Link ada di pesan di bawah. Tap untuk menyalin.', { show_alert: false });
            await ctx.reply(`Tap link di bawah untuk menyalin:\n<code>${escapeHtml(generatedLink)}</code>`, {
                parse_mode: 'HTML'
            });
        } else {
            await ctx.answerCbQuery('Tidak ada link yang tersedia untuk disalin. Silakan generate bug terlebih dahulu.', { show_alert: true });
        }
    });

    console.log('[INIT_GENERATE_BUG_FINAL] Dynamic bug generation feature initialization sequence complete.');
}

module.exports = { initGenerateBug };