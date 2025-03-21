const { Telegraf } = require('telegraf');
const GROUP_ID = "-1002397066993"; // ID grup tempat notifikasi dikirim
const sqlite3 = require('sqlite3').verbose();

// Inisialisasi database
const db = new sqlite3.Database('./sellvpn.db');

// Inisialisasi state
const userState = {};

// Helper function untuk validasi link
function isValidLink(link) {
    try {
        return link && (link.startsWith('vmess://') || link.startsWith('trojan://') || link.startsWith('vless://'));
    } catch (error) {
        console.error('Error validating link:', error);
        return false;
    }
}

// Helper function untuk generate link dengan bug
function generateBugLink(link, bugAddress, bugSubdomain) {
    try {
        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);

            config.add = bugAddress;

            if (bugSubdomain) {
                const originalHost = config.host || config.add;
                const domainParts = originalHost.split('.');
                const mainDomain = domainParts.slice(-2).join('.');
                config.host = `${bugSubdomain}.${mainDomain}`;
            }

            const newConfig = JSON.stringify(config);
            const newBase64Data = Buffer.from(newConfig).toString('base64');
            return `vmess://${newBase64Data}`;
        }

        const url = new URL(link);
        url.hostname = bugAddress;
        return url.toString();
    } catch (error) {
        console.error('Error generating bug link:', error);
        return null;
    }
}

// Helper function untuk mendapatkan tipe link
function getLinkType(link) {
    if (link.startsWith('vmess://')) return 'VMESS';
    if (link.startsWith('trojan://')) return 'TROJAN';
    if (link.startsWith('vless://')) return 'VLESS';
    return 'UNKNOWN';
}

// Helper function untuk mendapatkan host dari link
function getHost(link) {
    try {
        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);
            return config.add || 'UNKNOWN';
        }

        const url = new URL(link);
        return url.hostname;
    } catch (error) {
        console.error('Error getting host:', error);
        return 'UNKNOWN';
    }
}

// Helper function untuk mendapatkan UUID dari link
function getUUID(link) {
    try {
        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);
            return config.id || 'UNKNOWN';
        }

        const url = new URL(link);
        const params = new URLSearchParams(url.search);
        return params.get('id') || 'UNKNOWN';
    } catch (error) {
        console.error('Error getting UUID:', error);
        return 'UNKNOWN';
    }
}

// Fungsi untuk mengambil role pengguna dari database
async function getUserRole(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) {
                console.error('Error fetching user role:', err.message);
                reject(err);
            } else {
                resolve(row ? row.role : 'member'); // Default ke 'member' jika role tidak ditemukan
            }
        });
    });
}

// Fungsi untuk mengirim notifikasi ke grup
async function sendGroupNotification(bot, username, bugCode, linkType, userRole, date) {
    const message = `
──────────────────────
  Convert Bug Berhasil
──────────────────────
➥ User  : *@${username}*
➥ Bug   : *${bugCode}*
➥ Type  : *${linkType}*
➥ Role  : *${userRole}*
➥ Date  : *${date}*
──────────────────────`;

    try {
        await bot.telegram.sendMessage(GROUP_ID, message, { parse_mode: 'Markdown' });
        console.log('✅ Notifikasi berhasil dikirim ke grup.');
    } catch (error) {
        console.error('🚫 Gagal mengirim notifikasi ke grup:', error.message);
    }
}

// Fungsi untuk menginisialisasi fitur generatebug
function initGenerateBug(bot) {
    console.log('Menginisialisasi fitur generate bug...');

    // Handler untuk menerima link dari pengguna
    bot.hears(/^(vmess:\/\/|trojan:\/\/|vless:\/\/)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const link = ctx.message.text;

        if (!isValidLink(link)) {
            return ctx.reply('Link tidak valid. Silakan coba lagi.');
        }

        // Simpan link ke state
        userState[chatId] = { link, step: 'awaiting_bug' };

        // Kirim pilihan bug
        await ctx.reply('Link valid! Silakan pilih jenis bug:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'XL VIDIO', callback_data: 'bug_vidio' }],
                    [{ text: 'XL VIU', callback_data: 'bug_viu' }],
                    [{ text: 'ILPED WC [bakrie]', callback_data: 'bug_ilpedWC' }],
                    [{ text: 'XL VIP', callback_data: 'bug_vip' }],
                    [{ text: 'BYU OPOK', callback_data: 'bug_byu' }]
                ]
            }
        });
    });

    // Handle callback query untuk memilih bug
    bot.action(/bug_(.+)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const bugType = ctx.match[1];
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.reply('Link tidak ditemukan. Silakan kirim link lagi.');
            return;
        }

        let bugAddress, bugSubdomain;
        switch (bugType) {
            case 'vidio':
                bugAddress = 'quiz.vidio.com';
                bugSubdomain = null;
                break;
            case 'viu':
                bugAddress = 'zaintest.vuclip.com';
                bugSubdomain = null;
                break;
            case 'vip':
                bugAddress = '104.17.3.81';
                bugSubdomain = null;
                break;
            case 'ilpedWC':
                bugAddress = 'bakrie.ac.id';
                bugSubdomain = 'bakrie.ac.id';
                break;
            case 'byu':
                bugAddress = 'space.byu.id';
                bugSubdomain = null;
                break;
            default:
                bugAddress = 'unknown.bug.com';
                bugSubdomain = null;
        }

        const newLink = generateBugLink(link, bugAddress, bugSubdomain);
        if (newLink) {
            // Ambil role pengguna dari database
            const userRole = await getUserRole(ctx.from.id);

            await ctx.reply(`──────────────────────
 Convert Bug Berhasil
──────────────────────
➥  Code : *${bugType.toUpperCase()}*
➥  Type : *${getLinkType(link)}*
➥  User : *${ctx.from.username}*
➥  Host : *${getHost(link)}*
➥  UUID : *${getUUID(link)}*
➥  Bug  : *${bugAddress}*
──────────────────────
➥  Link : \`${newLink}\`
──────────────────────
➥  Date : *${new Date().toLocaleDateString()}*
──────────────────────
 Convert By PayVpnBot
──────────────────────`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Salin Link', callback_data: 'copy_link' }]
                    ]
                }
            });

            // Kirim notifikasi ke grup
            await sendGroupNotification(
                bot,
                ctx.from.username,
                bugType.toUpperCase(),
                getLinkType(link),
                userRole, // Gunakan role yang diambil dari database
                new Date().toLocaleDateString()
            );

            // Simpan link baru ke state
            userState[chatId].newLink = newLink;
        } else {
            await ctx.reply('Gagal mengenerate link. Silakan coba lagi.');
        }
    });

    // Handle tombol "Salin Link"
    bot.action('copy_link', async (ctx) => {
        const chatId = ctx.chat.id;
        const newLink = userState[chatId]?.newLink;

        if (newLink) {
            await ctx.answerCbQuery(`Link berhasil disalin: ${newLink}`);
            await ctx.reply(`Berikut adalah link yang telah disalin:\n\`${newLink}\``, {
                parse_mode: 'Markdown'
            });
        } else {
            await ctx.answerCbQuery('Tidak ada link yang tersedia untuk disalin.');
        }
    });

    console.log('Fitur generate bug berhasil diinisialisasi.');
}

module.exports = { initGenerateBug };