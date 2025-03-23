const { Telegraf } = require('telegraf');
const GROUP_ID = "-1002397066993"; // ID grup tempat notifikasi dikirim
const sqlite3 = require('sqlite3').verbose();

// Inisialisasi database
const db = new sqlite3.Database('./sellvpn.db');
// Impor fungsi sendMainMenu dari file mainMenu.js
const { sendMainMenu } = require('./app');

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

// Helper function untuk convert ke YAML dengan bug
// Helper function untuk convert ke YAML dengan bug
// Helper function untuk convert ke YAML dengan bug
function convertToYAML(link, bugAddress, bugSubdomain, fallbackUsername = 'Unnamed') {
    try {
        let yamlConfig = 'Format tidak didukung untuk konversi YAML.';

        // Ambil username dari bagian setelah # di link (untuk Trojan dan VLESS)
        const usernameFromLink = link.split('#')[1] || fallbackUsername;

        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);

            // Ganti server dengan bugAddress
            config.add = bugAddress;

            // Jika ada bugSubdomain, ganti host
            if (bugSubdomain) {
                const originalHost = config.host || config.add;
                const domainParts = originalHost.split('.');
                const mainDomain = domainParts.slice(-2).join('.');
                config.host = `${bugSubdomain}.${mainDomain}`;
            }

            // Ambil name dari config.ps atau fallbackUsername
            const name = config.ps || fallbackUsername;

            yamlConfig = `proxies:
  - name: ${name}
    server: ${config.add}
    port: ${config.port}
    type: vmess
    uuid: ${config.id}
    alterId: ${config.aid}
    cipher: auto
    tls: ${config.tls ? 'true' : 'false'}
    network: ${config.net}
    ws-opts:
      path: ${config.path || '/'}
      headers:
        Host: ${config.host || config.add}
    udp: true`;
        } else if (link.startsWith('trojan://')) {
            // Parsing link Trojan
            const url = new URL(link);
            const password = url.username; // Password adalah username di URL
            const server = bugAddress; // Gunakan bugAddress sebagai server
            const port = url.port || 443; // Port default 443 jika tidak ada
            const sni = url.searchParams.get('sni') || server; // SNI default ke server
            const path = url.searchParams.get('path') || '/'; // Path default ke /

            // Jika ada bugSubdomain, sesuaikan SNI dan host
            const finalSNI = bugSubdomain ? `${bugSubdomain}.${sni.split('.').slice(-2).join('.')}` : sni;

            yamlConfig = `proxies:
  - name: ${usernameFromLink}
    server: ${server}
    port: ${port}
    type: trojan
    password: ${password}
    skip-cert-verify: true
    sni: ${finalSNI}
    network: ws
    ws-opts:
      path: ${path}
      headers:
        Host: ${finalSNI}
    udp: true`;
        } else if (link.startsWith('vless://')) {
            // Parsing link VLESS
            const url = new URL(link);
            const uuid = url.username; // UUID adalah username di URL
            const server = bugAddress; // Gunakan bugAddress sebagai server
            const port = url.port || 443; // Port default 443 jika tidak ada
            const sni = url.searchParams.get('sni') || server; // SNI default ke server
            const type = url.searchParams.get('type') || 'ws'; // Type default ke ws
            const path = url.searchParams.get('path') || '/'; // Path default ke /

            // Jika ada bugSubdomain, sesuaikan SNI dan host
            const finalSNI = bugSubdomain ? `${bugSubdomain}.${sni.split('.').slice(-2).join('.')}` : sni;

            yamlConfig = `proxies:
  - name: ${usernameFromLink}
    server: ${server}
    port: ${port}
    type: vless
    uuid: ${uuid}
    tls: true
    servername: ${finalSNI}
    network: ${type}
    ws-opts:
      path: ${path}
      headers:
        Host: ${finalSNI}
    udp: true`;
        }

        return yamlConfig;
    } catch (error) {
        console.error('Error converting to YAML:', error);
        return 'Gagal mengonversi ke YAML.';
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
async function sendGroupNotification(bot, username, userId, bugCode, linkType, userRole, date, action = 'Generate Bug') {
    const message = `
──────────────────────
  ${action} Berhasil
──────────────────────
➥ *User  :* [${username}](tg://user?id=${userId})
➥ *Bug   :*  ${bugCode}
➥ *Type  :*  ${linkType}
➥ *Role  :*  ${userRole}
➥ *Date  :*  ${date}
──────────────────────
Notifikasi ${action} payVpn`;

    try {
        await bot.telegram.sendMessage(GROUP_ID, message, { parse_mode: 'Markdown' });
        console.log(`✅ Notifikasi ${action} berhasil dikirim ke grup.`);
    } catch (error) {
        console.error(`🚫 Gagal mengirim notifikasi ${action} ke grup:`, error.message);
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

        // Hapus pesan sebelumnya jika ada
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Gagal menghapus pesan sebelumnya:', error.message);
            }
        }

        // Simpan link ke state
        userState[chatId] = { link, step: 'awaiting_action' };

        // Kirim pilihan menu
        const reply = await ctx.reply('Link valid! Silakan pilih opsi:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Convert YAML', callback_data: 'convert_yaml' }],
                    [{ text: 'Generate Bug', callback_data: 'generate_bug' }]
                ]
            }
        });

        // Simpan message_id pesan terakhir
        userState[chatId].lastMessageId = reply.message_id;
    });

    // Handler untuk convert YAML
    bot.action('convert_yaml', async (ctx) => {
        const chatId = ctx.chat.id;
        const link = userState[chatId]?.link;

        if (!link) {
            return ctx.reply('Silakan kirim ulang link.');
        }

        // Hapus pesan sebelumnya jika ada
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Gagal menghapus pesan sebelumnya:', error.message);
            }
        }

        // Kirim pilihan bug untuk YAML
        const reply = await ctx.reply('Silakan pilih jenis bug untuk YAML:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'XL VIDIO', callback_data: 'yaml_bug_vidio [ quiz ]' }],
                    [{ text: 'XL VIU', callback_data: 'yaml_bug_viu' }],
                    [{ text: 'XL VIP', callback_data: 'yaml_bug_XL VIP [ 81 ]' }],
                    [{ text: 'ILPED WC [bakrie]', callback_data: 'yaml_bug_ILPED WC [ Bakrie ]' }],
                    [{ text: 'BYU OPOK', callback_data: 'yaml_bug_byu OPOK' }]
                ]
            }
        });

        // Simpan message_id pesan terakhir
        userState[chatId].lastMessageId = reply.message_id;
    });

    // Handle callback query untuk memilih bug YAML
    bot.action(/yaml_bug_(.+)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const bugType = ctx.match[1];
        const link = userState[chatId]?.link;

        if (!link) {
            await ctx.reply('Link tidak ditemukan. Silakan kirim link lagi.');
            return;
        }

        let bugAddress, bugSubdomain;
        switch (bugType) {
            case 'vidio [ quiz ]':
                bugAddress = 'quiz.vidio.com';
                bugSubdomain = null;
                break;
            case 'viu':
                bugAddress = 'zaintest.vuclip.com';
                bugSubdomain = null;
                break;
            case 'XL VIP [ 81 ]':
                bugAddress = '104.17.3.81';
                bugSubdomain = null;
                break;
            case 'ILPED WC [ Bakrie ]':
                bugAddress = 'bakrie.ac.id';
                bugSubdomain = 'bakrie.ac.id';
                break;
            case 'byu OPOK':
                bugAddress = 'space.byu.id';
                bugSubdomain = null;
                break;
            default:
                bugAddress = 'unknown.bug.com';
                bugSubdomain = null;
        }

        // Hapus pesan sebelumnya jika ada
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Gagal menghapus pesan sebelumnya:', error.message);
            }
        }

        // Konversi ke YAML dengan bug
        const yamlConfig = convertToYAML(link, bugAddress, bugSubdomain, ctx.from.username);
        const reply = await ctx.reply(`Hasil konversi YAML dengan bug ${bugType}:\n\`\`\`yaml\n${yamlConfig}\n\`\`\``, { parse_mode: 'Markdown' });

        // Simpan message_id pesan terakhir
        userState[chatId].lastMessageId = reply.message_id;

        // Kirim notifikasi ke grup
        const userRole = await getUserRole(ctx.from.id);
        await sendGroupNotification(
            bot,
            ctx.from.username,
            ctx.from.id,
            bugType.toUpperCase(),
            getLinkType(link),
            userRole,
            new Date().toLocaleDateString(),
            'Convert YAML'
        );
    });

    // Handler untuk Generate Bug
    bot.action('generate_bug', async (ctx) => {
        const chatId = ctx.chat.id;
        const link = userState[chatId]?.link;

        if (!link) {
            return ctx.reply('Silakan kirim ulang link.');
        }

        // Hapus pesan sebelumnya jika ada
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Gagal menghapus pesan sebelumnya:', error.message);
            }
        }

        // Kirim pilihan bug
        const reply = await ctx.reply('Silakan pilih jenis bug:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'XL VIDIO', callback_data: 'bug_vidio [ quiz ]' }],
                    [{ text: 'XL VIU', callback_data: 'bug_viu' }],
                    [{ text: 'XL VIP', callback_data: 'bug_XL VIP [ 81 ]' }],
                    [{ text: 'ILPED WC [bakrie]', callback_data: 'bug_ILPED WC [ Bakrie ]' }],
                    [{ text: 'BYU OPOK', callback_data: 'bug_byu OPOK' }]
                ]
            }
        });

        // Simpan message_id pesan terakhir
        userState[chatId].lastMessageId = reply.message_id;
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
            case 'vidio [ quiz ]':
                bugAddress = 'quiz.vidio.com';
                bugSubdomain = null;
                break;
            case 'viu':
                bugAddress = 'zaintest.vuclip.com';
                bugSubdomain = null;
                break;
            case 'XL VIP [ 81 ]':
                bugAddress = '104.17.3.81';
                bugSubdomain = null;
                break;
            case 'ILPED WC [ Bakrie ]':
                bugAddress = 'bakrie.ac.id';
                bugSubdomain = 'bakrie.ac.id';
                break;
            case 'byu OPOK':
                bugAddress = 'space.byu.id';
                bugSubdomain = null;
                break;
            default:
                bugAddress = 'unknown.bug.com';
                bugSubdomain = null;
        }

        // Hapus pesan sebelumnya jika ada
        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Gagal menghapus pesan sebelumnya:', error.message);
            }
        }

        const newLink = generateBugLink(link, bugAddress, bugSubdomain);
        if (newLink) {
            // Ambil role pengguna dari database
            const userRole = await getUserRole(ctx.from.id);

            const reply = await ctx.reply(`──────────────────────
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
──────────────────────`, { parse_mode: 'Markdown'
            });

            // Simpan message_id pesan terakhir
            userState[chatId].lastMessageId = reply.message_id;

            // Kirim notifikasi ke grup
            await sendGroupNotification(
                bot,
                ctx.from.username,
                ctx.from.id,
                bugType.toUpperCase(),
                getLinkType(link),
                userRole,
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