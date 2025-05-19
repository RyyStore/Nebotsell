const { Telegraf } = require('telegraf');
const GROUP_ID = "-1002397066993"; // Group ID for notifications
const sqlite3 = require('sqlite3').verbose();

// Initialize database
const db = new sqlite3.Database('./sellvpn.db');

// User state tracking
const userState = {};

// Validate VPN link
function isValidLink(link) {
    try {
        return link && (link.startsWith('vmess://') || link.startsWith('trojan://') || link.startsWith('vless://'));
    } catch (error) {
        console.error('Error validating link:', error);
        return false;
    }
}

// Generate link with bug
function generateBugLink(link, bugAddress, bugSubdomain) {
    try {
        if (link.startsWith('vmess://')) {
            const base64Data = link.replace('vmess://', '');
            const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
            const config = JSON.parse(decodedData);

            config.add = bugAddress;

            if (bugSubdomain) {
                const originalHost = config.host || config.add;
                config.host = `${bugSubdomain}.${originalHost}`;
                config.sni = config.host;
            }

            const newConfig = JSON.stringify(config);
            return `vmess://${Buffer.from(newConfig).toString('base64')}`;
        } 
        else if (link.startsWith('trojan://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            
            const originalHost = params.get('host') || url.hostname;
            const newUrl = new URL(link);
            newUrl.hostname = bugAddress;
            
            if (bugSubdomain) {
                const newHost = `${bugSubdomain}.${originalHost}`;
                params.set('host', newHost);
                params.set('sni', newHost);
            }
            
            newUrl.search = params.toString();
            return newUrl.toString();
        }
        else if (link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            
            const newUrl = new URL(link);
            newUrl.hostname = bugAddress;
            
            if (bugSubdomain) {
                const originalHost = params.get('host') || url.hostname;
                const newHost = `${bugSubdomain}.${originalHost}`;
                
                params.set('sni', newHost);
                if (params.get('type') === 'ws') {
                    params.set('host', newHost);
                }
            }
            
            newUrl.search = params.toString();
            return newUrl.toString();
        }
    } catch (error) {
        console.error('Error generating bug link:', error);
        return null;
    }
}

// Get link type
function getLinkType(link) {
    if (link.startsWith('vmess://')) return 'VMESS';
    if (link.startsWith('trojan://')) return 'TROJAN';
    if (link.startsWith('vless://')) return 'VLESS';
    return 'UNKNOWN';
}

// Get host from link
function getHost(link) {
    try {
        if (link.startsWith('vmess://')) {
            const config = JSON.parse(Buffer.from(link.replace('vmess://', ''), 'base64').toString('utf-8'));
            return config.host || config.add || 'UNKNOWN';
        }
        else if (link.startsWith('trojan://') || link.startsWith('vless://')) {
            const url = new URL(link);
            const params = new URLSearchParams(url.search);
            return params.get('host') || url.hostname || 'UNKNOWN';
        }
        return 'UNKNOWN';
    } catch (error) {
        console.error('Error getting host:', error);
        return 'UNKNOWN';
    }
}

// Get UUID from link
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

// Get user role from database
async function getUserRole(userId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row?.role || 'member');
        });
    });
}

// Escape HTML special characters
function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Send clean notification to group
// Send clean notification to group
async function sendGroupNotification(bot, username, userId, bugCode, linkType, userRole, date) {
    // Mapping callback_data to display text
    const bugDisplayMap = {
        'vidio': 'XL VIDIO [quiz]',
        'viu': 'XL VIU',
        'vip': 'XL VIP [81]',
        'xcv_wc': 'XL XCV WC [Zoom]',
        'xcl_ava': 'XL UTS [AVA]',
        'xcl_ava_wc': 'XL UTS WC [AVA]',
        'xcl_graph': 'XL UTS [Graph]',
        'xcl_graph_wc': 'XL UTS WC [Graph]',
        'ilped_untar': 'ILPED WC [untar]',
        'ilped_chat': 'ILPED WC [chat]',
        'ilped_unnes': 'ILPED WC [unnes]',
        'byu': 'BYU OPOK'
    };

    // Get display name (convert to lowercase for case-insensitive matching)
    const displayName = bugDisplayMap[bugCode.toLowerCase()] || bugCode;

    const userDisplay = username 
        ? `<a href="tg://user?id=${userId}">${escapeHtml(username)}</a>` 
        : `User <code>${userId}</code>`;

    const message = `
<b>🛠️ Generate Bug Success</b>
──────────────────────
<b>➥User:</b> ${userDisplay}
<b>➥ Bug:</b> <code>${escapeHtml(displayName)}</code>
<b>➥ Type:</b> <code>${escapeHtml(linkType)}</code>
<b>➥ Role:</b> <code>${escapeHtml(userRole)}</code>
<b>➥ Date:</b> <code>${escapeHtml(date)}</code>
──────────────────────
<i>Notification by PayVpnBot</i>`;

    try {
        await bot.telegram.sendMessage(GROUP_ID, message, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error('Failed to send notification:', error.message);
    }
}

// Initialize generate bug feature
function initGenerateBug(bot) {
    console.log('Initializing generate bug feature...');

    // Handle VPN links
    bot.hears(/^(vmess:\/\/|trojan:\/\/|vless:\/\/)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const link = ctx.message.text;

        if (!isValidLink(link)) {
            return ctx.reply('Invalid link. Please try again.');
        }

        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Failed to delete previous message:', error.message);
            }
        }

        userState[chatId] = { link, step: 'awaiting_action' };

        const reply = await ctx.reply('✅ Valid link! Choose an option:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Generate Bug', callback_data: 'generate_bug' }]
                ]
            }
        });

        userState[chatId].lastMessageId = reply.message_id;
    });

    // Handler for Generate Bug
    bot.action('generate_bug', async (ctx) => {
        const chatId = ctx.chat.id;
        const link = userState[chatId]?.link;

        if (!link) return ctx.reply('Please resend the link.');

        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Failed to delete message:', error.message);
            }
        }

        const reply = await ctx.reply('Choose bug type:', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'XL VIDIO [quiz]', callback_data: 'bug_vidio' },
                        { text: 'XL VIU', callback_data: 'bug_viu' }
                    ],
                    [
                        { text: 'XL VIP [81]', callback_data: 'bug_vip' },
                        { text: 'XL XCV WC [Zoom]', callback_data: 'bug_xcv_wc' }
                    ],
                    [
                        { text: 'XL UTS [AVA]', callback_data: 'bug_xcl_ava' },
                        { text: 'XL UTS WC [AVA]', callback_data: 'bug_xcl_ava_wc' }
                    ],
                    [
                        { text: 'XL UTS [Graph]', callback_data: 'bug_xcl_graph' },
                        { text: 'XL UTS WC [Graph]', callback_data: 'bug_xcl_graph_wc' }
                    ],
                    [
                        { text: 'ILPED WC [untar]', callback_data: 'bug_ilped_untar' },
                        { text: 'ILPED WC [chat]', callback_data: 'bug_ilped_chat' }
                    ],
                    [
                        { text: 'ILPED WC [unnes]', callback_data: 'bug_ilped_unnes' },
                        { text: 'BYU OPOK', callback_data: 'bug_byu' }
                    ]
                ]
            }
        });

        userState[chatId].lastMessageId = reply.message_id;
    });

    // Handle bug selection
    bot.action(/bug_(.+)/, async (ctx) => {
        const chatId = ctx.chat.id;
        const bugType = ctx.match[1];
        const link = userState[chatId]?.link;

        if (!link) return ctx.reply('Link not found. Please resend.');

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
            case 'xcv_wc':
                bugAddress = 'support.zoom.us';
                bugSubdomain = 'zoomgov';
                break;
            case 'xcl_ava':
                bugAddress = 'ava.game.naver.com';
                bugSubdomain = null;
                break;
            case 'xcl_ava_wc':
                bugAddress = 'ava.game.naver.com';
                bugSubdomain = 'ava.game.naver.com';
                break;
            case 'xcl_graph':
                bugAddress = 'graph.instagram.com';
                bugSubdomain = null;
                break;
            case 'xcl_graph_wc':
                bugAddress = 'graph.instagram.com';
                bugSubdomain = 'graph.instagram.com';
                break;
            case 'ilped_untar':
                bugAddress = 'untar.ac.id';
                bugSubdomain = 'untar.ac.id';
                break;
            case 'ilped_chat':
                bugAddress = 'chat.sociomile.com';
                bugSubdomain = 'chat.sociomile.com';
                break;
            case 'ilped_unnes':
                bugAddress = 'unnes.ac.id';
                bugSubdomain = 'unnes.ac.id';
                break;
            case 'byu':
                bugAddress = 'space.byu.id';
                bugSubdomain = null;
                break;
            default:
                bugAddress = 'unknown.bug.com';
                bugSubdomain = null;
        }

        if (userState[chatId]?.lastMessageId) {
            try {
                await ctx.deleteMessage(userState[chatId].lastMessageId);
            } catch (error) {
                console.error('Failed to delete message:', error.message);
            }
        }

        const newLink = generateBugLink(link, bugAddress, bugSubdomain);
        if (newLink) {
            const userRole = await getUserRole(ctx.from.id);

            const reply = await ctx.replyWithHTML(`
<b>🔧 Bug Generated Successfully</b>
──────────────────────
<b>➥ Code:</b> <code>${escapeHtml(bugType.toUpperCase())}</code>
<b>➥ Type:</b> <code>${escapeHtml(getLinkType(link))}</code>
<b>➥ User:</b> ${ctx.from.username ? escapeHtml(ctx.from.username) : `User <code>${ctx.from.id}</code>`}
<b>➥ Original Host:</b> <code>${escapeHtml(getHost(link))}</code>
<b>➥ UUID:</b> <code>${escapeHtml(getUUID(link))}</code>
<b>➥ Bug Server:</b> <code>${escapeHtml(bugAddress)}${bugSubdomain ? ` (${escapeHtml(bugSubdomain)})` : ''}</code>
──────────────────────
<b>🔗 Generated Link:</b>
<code>${escapeHtml(newLink)}</code>
──────────────────────
<b>📅 Date:</b> <code>${escapeHtml(new Date().toLocaleDateString())}</code>
──────────────────────
<i>Generated by PayVpnBot</i>
`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 Copy Link', callback_data: 'copy_link' }]
                    ]
                }
            });

            userState[chatId] = { 
                lastMessageId: reply.message_id,
                newLink 
            };

            await sendGroupNotification(
                bot,
                ctx.from.username,
                ctx.from.id,
                bugType.toUpperCase(),
                getLinkType(link),
                userRole,
                new Date().toLocaleDateString()
            );
        } else {
            await ctx.reply('Failed to generate link. Please try again.');
        }
    });

    // Handle copy link
    bot.action('copy_link', async (ctx) => {
        const chatId = ctx.chat.id;
        const newLink = userState[chatId]?.newLink;

        if (newLink) {
            await ctx.answerCbQuery('Link copied to clipboard!');
            await ctx.reply(`Here's your generated link:\n<code>${escapeHtml(newLink)}</code>`, {
                parse_mode: 'HTML'
            });
        } else {
            await ctx.answerCbQuery('No link available to copy.');
        }
    });

    console.log('Bug generation feature initialized.');
}

module.exports = { initGenerateBug };