const { Telegraf } = require('telegraf');

// Variabel ini akan diisi saat initGenerateBug dipanggil dari file utama
let localDBInstance;
let mainVarsInstance;
// const GROUP_ID = "-1002397066993"; // Diambil dari mainVarsInstance.GROUP_ID
// const adminUserIds = []; // Diambil dari parameter saat init

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

            config.add = bugAddress; // Set alamat utama ke bugAddress

            // Jika bugSubdomain ada, gunakan itu untuk host dan SNI
            // Jika tidak, host dan SNI bisa sama dengan bugAddress atau host asli (tergantung implementasi asli V2Ray/XRay client)
            // Untuk konsistensi, jika bugSubdomain ada, kita set host dan sni.
            // Jika tidak, client biasanya akan menggunakan 'add' untuk koneksi dan 'host' (jika ada) untuk SNI.
            // Beberapa client mungkin butuh 'sni' diisi eksplisit.
            if (bugSubdomain) {
                const originalHostForSni = config.host || config.add; // Ambil host asli jika ada, atau alamat lama
                config.host = `${bugSubdomain}.${originalHostForSni}`; // Ini bisa jadi subdomain.hostasli.com atau subdomain.bugaddress.com
                                                                    // Umumnya, bugSubdomain itu sendiri sudah menjadi host yang diinginkan.
                                                                    // Jika bugSubdomain dimaksudkan sebagai prefix: `${bugSubdomain}.${config.add}`
                                                                    // Kita asumsikan bugSubdomain adalah full host jika diberikan, atau prefix ke original host.
                                                                    // Untuk kasus umum: bugSubdomain menjadi Host header dan SNI
                config.host = bugSubdomain; // Host header untuk WS
                config.sni = bugSubdomain;  // SNI untuk TLS
            } else {
                // Jika tidak ada bugSubdomain, pastikan host dan sni (jika ada) juga mengarah ke bugAddress
                // atau biarkan kosong agar client menggunakan 'add'
                if (config.tls === 'tls' || config.security === 'tls' || (config.streamSettings && config.streamSettings.security === 'tls')) {
                     config.sni = config.host || bugAddress; // SNI diisi dengan host header atau bugAddress jika host kosong
                }
                if (config.streamSettings && config.streamSettings.network === 'ws' && config.streamSettings.wsSettings) {
                    config.host = config.host || bugAddress; // Host header untuk WebSocket
                }
            }


            const newConfig = JSON.stringify(config);
            return `vmess://${Buffer.from(newConfig).toString('base64')}`;
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);

            const originalHostname = url.hostname; // Simpan hostname asli dari URL VLESS/Trojan
            url.hostname = bugAddress; // Ganti hostname utama dengan bugAddress

            if (bugSubdomain) { // bugSubdomain akan menjadi SNI dan Host header (jika ws)
                params.set('sni', bugSubdomain);
                if (params.get('type') === 'ws') {
                    params.set('host', bugSubdomain);
                }
            } else {
                // Jika tidak ada bugSubdomain, SNI dan host header (jika ws) bisa diisi dengan bugAddress
                // atau hostname asli dari link VLESS/Trojan (tergantung kebutuhan bug)
                // Umumnya, jika bugAddress adalah IP, SNI diisi dengan hostname asli.
                // Jika bugAddress adalah domain, SNI bisa diisi dengan bugAddress atau hostname asli.
                // Kita akan set SNI ke hostname asli jika bugAddress adalah IP, atau ke bugAddress jika bugAddress domain.
                // Dan host header ke bugAddress jika ws.
                const isIpAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bugAddress);
                if (params.has('sni') || params.has('peer')) { // Jika sudah ada SNI/peer, biarkan, kecuali akan dioverride bugSubdomain
                     params.set('sni', params.get('sni') || params.get('peer') || (isIpAddress ? originalHostname : bugAddress));
                } else {
                     params.set('sni', isIpAddress ? originalHostname : bugAddress);
                }

                if (params.get('type') === 'ws') {
                    if (params.has('host')) { // Jika sudah ada host header, biarkan
                        params.set('host', params.get('host') || bugAddress);
                    } else {
                        params.set('host', bugAddress);
                    }
                }
            }
            // Hapus parameter peer jika ada, karena sni lebih umum
            if(params.has('peer')) params.delete('peer');

            url.search = params.toString();
            return url.toString();
        }
    } catch (error) {
        console.error('Error generating bug link:', error);
        return null;
    }
    return null; // Fallback
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
            return config.host || config.add || 'UNKNOWN';
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            return params.get('host') || params.get('sni') || url.hostname || 'UNKNOWN';
        }
        return 'UNKNOWN';
    } catch (error) {
        console.error('Error getting host:', error);
        return 'UNKNOWN';
    }
}

function getUUID(link) {
    try {
        if (link.startsWith('vmess://')) {
            const config = JSON.parse(Buffer.from(link.replace('vmess://', ''), 'base64').toString('utf-8'));
            return config.id || 'UNKNOWN';
        }
        const url = new URL(link);
        return url.username || new URLSearchParams(url.search).get('id') || 'UNKNOWN';
    } catch (error) {
        console.error('Error getting UUID:', error);
        return 'UNKNOWN';
    }
}

async function getUserRole(userId) {
    return new Promise((resolve, reject) => {
        if (!localDBInstance) return reject(new Error("Database (localDBInstance) not initialized in generate.js"));
        localDBInstance.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row?.role || 'member');
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
    let displayName = bugCode;
    try {
        if (!localDBInstance) throw new Error("DB not init for sendGroupNotification");
        const bugInfo = await new Promise((resolve, reject) => {
            localDBInstance.get('SELECT display_name FROM Bugs WHERE bug_code = ?', [bugCode], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        if (bugInfo && bugInfo.display_name) {
            displayName = bugInfo.display_name;
        }
    } catch (dbError) {
        console.error("Error fetching display_name for bug_code:", bugCode, dbError);
    }

    const userDisplay = username
        ? `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>`
        : `User <code>${userId}</code>`;

    const botName = mainVarsInstance.NAMA_STORE || 'PayVpnBot';
    const groupIdForNotif = mainVarsInstance.GROUP_ID; // GROUP_ID dari file utama

    if (!groupIdForNotif) {
        console.warn("GROUP_ID for notification is not set in mainVarsInstance.");
        return;
    }

    const message = `
<b>🛠️ Generate Bug Success</b>
──────────────────────
<b>➥User:</b> ${userDisplay}
<b>➥ Bug:</b> <code>${escapeHtml(displayName)}</code>
<b>➥ Type:</b> <code>${escapeHtml(linkType)}</code>
<b>➥ Role:</b> <code>${escapeHtml(userRole)}</code>
<b>➥ Date:</b> <code>${escapeHtml(date)}</code>
──────────────────────
<i>Notification by ${botName}</i>`;

    try {
        await bot.telegram.sendMessage(groupIdForNotif, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error('Failed to send notification:', error.message);
    }
}

function initGenerateBug(bot, dbInstance, adminUserIdsArray, varsObj) {
    console.log('Initializing generate bug feature (dynamic)...');
    localDBInstance = dbInstance;
    mainVarsInstance = varsObj;
    // adminUserIds = adminUserIdsArray; // Jika perlu cek admin di dalam generate.js

    bot.hears(/^(vmess:\/\/|trojan:\/\/|vless:\/\/)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const link = ctx.message.text;

        if (!isValidLink(link)) {
            return ctx.reply('Invalid link. Please try again.');
        }

        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) { /* ignore if delete fails */ }
        }

        userState[chatId] = { link, step: 'awaiting_action' };

        const reply = await ctx.reply('✅ Valid link! Choose an option:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Generate Bug', callback_data: 'generate_bug_dynamic' }]
                ]
            }
        });
        userState[chatId].lastMessageId = reply.message_id;
    });

    bot.action('generate_bug_dynamic', async (ctx) => {
        const chatId = ctx.chat.id;
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.answerCbQuery('Please resend the link.', { show_alert: true });
            // Attempt to delete the current message (which is the button panel)
             try { await ctx.deleteMessage(); } catch(e) {}
            const newReply = await ctx.reply('Please resend the link.');
            userState[chatId] = { lastMessageId: newReply.message_id }; // Update last message ID
            return;
        }
        
        try {
            // Try to delete the previous message (which said "Valid link! Choose an option:")
            if (userState[chatId]?.lastMessageId) {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } else if (ctx.callbackQuery?.message?.message_id) { // Fallback if lastMessageId wasn't set
                await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
            }
        } catch (error) { /* ignore */ }


        try {
            const activeBugs = await new Promise((resolve, reject) => {
                localDBInstance.all('SELECT bug_code, display_name FROM Bugs WHERE is_active = 1 ORDER BY display_name ASC', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            if (!activeBugs || activeBugs.length === 0) {
                await ctx.answerCbQuery('No active bugs available.', { show_alert: true });
                const reply = await ctx.reply('No active bugs configured by admin.');
                userState[chatId].lastMessageId = reply.message_id;
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
            inline_keyboard.push([{ text: '❌ Cancel & Back to Menu', callback_data: 'cancel_bug_generation_local_and_menu' }]);

            const reply = await ctx.reply('Choose bug type:', {
                reply_markup: { inline_keyboard }
            });
            userState[chatId].lastMessageId = reply.message_id;

        } catch (dbError) {
            console.error("Error fetching active bugs:", dbError);
            await ctx.answerCbQuery('Error fetching bug list.', { show_alert: true });
            const reply = await ctx.reply('Could not retrieve bug list. Please try again later.');
            userState[chatId].lastMessageId = reply.message_id;
        }
    });

    bot.action('cancel_bug_generation_local_and_menu', async (ctx) => {
        const chatId = ctx.chat.id;
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) { /* ignore */ }
        }
        delete userState[chatId];
        await ctx.answerCbQuery('Bug generation cancelled.');
        // Trigger main menu from main bot file
        // This assumes 'main_menu_refresh' is a global callback handled by your main bot file
        // which then calls sendMainMenu(ctx)
        return ctx.telegram.sendMessage(chatId, "Returning to main menu...", {
            reply_markup: {
                inline_keyboard: [[{ text: '🔄 Main Menu', callback_data: 'main_menu_refresh' }]]
            }
        }).catch(e => console.error("Error sending menu refresh trigger:", e));
    });


    bot.action(/dynamicbugcode_(.+)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const selectedBugCode = ctx.match[1];
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.answerCbQuery('Link not found. Please resend.', { show_alert: true });
            try { await ctx.deleteMessage(); } catch(e) {}
            const newReply = await ctx.reply('Link not found. Please resend.');
            userState[chatId] = { lastMessageId: newReply.message_id };
            return;
        }
        
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) { /* ignore */ }
        }


        try {
            const bugDetails = await new Promise((resolve, reject) => {
                localDBInstance.get('SELECT bug_address, bug_subdomain, display_name FROM Bugs WHERE bug_code = ? AND is_active = 1', [selectedBugCode], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!bugDetails) {
                await ctx.answerCbQuery('Selected bug is not available.', { show_alert: true });
                const reply = await ctx.reply('The selected bug could not be found or is inactive.');
                userState[chatId].lastMessageId = reply.message_id;
                return;
            }

            const { bug_address, bug_subdomain, display_name } = bugDetails;
            const newLink = generateBugLink(link, bug_address, bug_subdomain);

            if (newLink) {
                const userRole = await getUserRole(ctx.from.id);
                const botName = mainVarsInstance.NAMA_STORE || 'PayVpnBot';

                const reply = await ctx.replyWithHTML(`
<b>🔧 Bug Generated Successfully</b>
──────────────────────
<b>➥ Bug:</b> <code>${escapeHtml(display_name)}</code>
<b>➥ Type:</b> <code>${escapeHtml(getLinkType(link))}</code>
<b>➥ User:</b> ${ctx.from.username ? `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.username)}</a>` : `User <code>${ctx.from.id}</code>`}
<b>➥ Original Host:</b> <code>${escapeHtml(getHost(link))}</code>
<b>➥ UUID:</b> <code>${escapeHtml(getUUID(link))}</code>
<b>➥ Bug Server:</b> <code>${escapeHtml(bug_address)}${bug_subdomain ? ` (${escapeHtml(bug_subdomain)})` : ''}</code>
──────────────────────
<b>🔗 Generated Link:</b>
<code>${escapeHtml(newLink)}</code>
──────────────────────
<b>📅 Date:</b> <code>${escapeHtml(new Date().toLocaleDateString())}</code>
──────────────────────
<i>Generated by ${botName}</i>
`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📋 Copy Link', callback_data: 'copy_generated_link_local' }],
                            [{ text: '↩️ Generate Another Bug with Same Link', callback_data: 'generate_bug_dynamic'}],
                            [{ text: '🏠 Main Menu', callback_data: 'main_menu_refresh' }]
                        ]
                    }
                });
                userState[chatId] = {
                    ...userState[chatId],
                    lastMessageId: reply.message_id,
                    generatedLink: newLink
                };
                await sendGroupNotification(bot, ctx.from.username, ctx.from.id, selectedBugCode, getLinkType(link), userRole, new Date().toLocaleDateString());
            } else {
                await ctx.reply('Failed to generate link. Please try again.');
            }
        } catch (dbError) {
            console.error("Error processing dynamic bug selection:", dbError);
            await ctx.reply('An error occurred while processing the bug.');
        }
    });

    bot.action('copy_generated_link_local', async (ctx) => {
        const chatId = ctx.chat.id;
        const generatedLink = userState[chatId]?.generatedLink;

        if (generatedLink) {
            await ctx.answerCbQuery('Link details below. Tap to copy.', { show_alert: true });
            // Kirim ulang link agar mudah di-copy, karena Telegram tidak bisa copy dari notifikasi CbQuery
            await ctx.reply(`Tap to copy:\n<code>${escapeHtml(generatedLink)}</code>`, {
                parse_mode: 'HTML'
            });
        } else {
            await ctx.answerCbQuery('No link available to copy.');
        }
    });

    console.log('Dynamic bug generation feature initialized.');
}

module.exports = { initGenerateBug };