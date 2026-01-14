// BAGIAN 1: SEMUA REQUIRE DI ATAS
const qrcode = require('qrcode');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const { Mutex } = require('async-mutex'); // <-- TAMBAHKAN INI
const dbMutex = new Mutex(); // <-- TAMBAHKAN INI
const session = require('express-session');
const bcrypt = require('bcrypt');
const cors = require('cors');
const https = require('https'); // <-- Tambahkan baris ini

// Buat instance https.Agent untuk mengabaikan validasi sertifikat
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});


// Require file lokal Anda
const topUpQueue = require('./queue');
const { initGenerateBug, injectBugToLink } = require('./generate');

// BAGIAN 2: INISIALISASI EXPRESS DAN MIDDLEWARE (URUTAN INI PENTING)
const app = express();

// 1. Aktifkan CORS untuk semua rute
app.use(cors());

// 2. Aktifkan body-parser untuk membaca data dari form
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Aktifkan sesi untuk mengingat login
app.use(session({
    secret: 'hanyaadminyangbisa123', // GANTI INI
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Nanti diubah ke true jika sudah HTTPS
        maxAge: 24 * 60 * 60 * 1000 // Sesi berlaku 1 hari
    }
}));

// 4. Sajikan file statis (HTML, CSS) dari folder 'public'
app.use(express.static('public'));

// BAGIAN 3: KONSTANTA DAN KODE ANDA SELANJUTNYA
const saltRounds = 10;



const { createssh, createvmess, createvless, createtrojan, createhysteria } = require('./modules/create');
const { trialssh, trialvmess, trialvless, trialtrojan, trialhysteria } = require('./modules/trial');
const { renewssh, renewvmess, renewvless, renewtrojan, renewhysteria } = require('./modules/renew');
const { callDeleteAPI } = require('./modules/delete');

const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const DEFAULT_MIN_GENERAL_TOPUP = 10000;
const DEFAULT_MIN_RESELLER_UPGRADE_TOPUP = 25000;
const PAYDISINI_KEY = vars.PAYDISINI_KEY;
const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN = vars.USER_ID;
const NAMA_STORE = vars.NAMA_STORE || '@RyyStore';
const QRIS_STATIS_STRING = "00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214550177920473550303UMI51440014ID.CO.QRIS.WWW0215ID20253782970190303UMI5204541153033605802ID5918RYYSTORE OK22859056009SURAKARTA61055712462070703A016304774D";

if (!QRIS_STATIS_STRING) {
    console.error("FATAL ERROR: QRIS_STATIS_STRING tidak terdefinisi dalam kode. Harap periksa.");
    process.exit(1);
}
const GROUP_ID = "-1002397066993";
const REQUIRED_GROUPS_TO_JOIN = [
    { id: '@RyyStoreevpn', link: 'https://t.me/RyyStoreevpn', name: 'RyyStore VPN' },
    { id: '@internetgratisin', link: 'https://t.me/internetgratisin', name: 'Internet Gratis IN' }
];
const bot = new Telegraf(BOT_TOKEN, {
    handlerTimeout: 180_000 
});




const adminIds = ADMIN;
console.log('Bot initialized');

const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) {
    console.error('Kesalahan koneksi SQLite3:', err.message);
  } else {
    console.log('Terhubung ke SQLite3');
  }
});

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function calculatePrice(hargaPerHari, expDays) {
  if (expDays === 30) {
    return Math.floor((hargaPerHari * 30) / 100) * 100;
  }
  return hargaPerHari * expDays;
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Server (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT,
      auth TEXT,
      harga INTEGER,
      harga_reseller INTEGER,
      nama_server TEXT,
      quota INTEGER,
      iplimit INTEGER,
      batas_create_akun INTEGER,
      total_create_akun INTEGER DEFAULT 0,
      hidden BOOLEAN DEFAULT 0
    )`, (err) => {
      if (err) {
        console.error('Kesalahan membuat tabel Server:', err.message);
      } else {
        console.log('Tabel Server berhasil dibuat atau sudah ada');
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      username TEXT,
      saldo INTEGER DEFAULT 0,
      role TEXT DEFAULT 'member',
      last_topup_date TEXT,
      transaction_count INTEGER DEFAULT 0,
      total_accounts_created INTEGER DEFAULT 0,
      last_account_creation_date TEXT,
      last_transaction_date TEXT,
      accounts_created_30days INTEGER DEFAULT 0,
      trial_count INTEGER DEFAULT 0, 
      last_trial_date TEXT DEFAULT NULL,
      became_reseller_on TEXT DEFAULT NULL,
      reseller_quota_last_checked_on TEXT DEFAULT NULL,
      CONSTRAINT unique_user_id UNIQUE (user_id)
    )`, (err) => {
      if (err) {
        console.error('Kesalahan membuat/alter tabel users:', err.message);
      } else {
        console.log('Tabel Users siap (dengan kolom reseller).');
        db.run("ALTER TABLE users ADD COLUMN became_reseller_on TEXT DEFAULT NULL", () => {});
        db.run("ALTER TABLE users ADD COLUMN reseller_quota_last_checked_on TEXT DEFAULT NULL", () => {});
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // MODIFIKASI TABEL CREATED_ACCOUNTS
    db.run(`CREATE TABLE IF NOT EXISTS created_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER NOT NULL,
        account_username TEXT NOT NULL,
        protocol TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL,
        expiry_date TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        creation_date TEXT DEFAULT NULL,
        duration_days INTEGER DEFAULT 0,
        FOREIGN KEY (server_id) REFERENCES Server(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Kesalahan membuat/alter tabel created_accounts:', err.message);
        } else {
            console.log('Tabel created_accounts siap (dengan kolom durasi & tanggal buat).');
            db.run("ALTER TABLE created_accounts ADD COLUMN creation_date TEXT DEFAULT NULL", () => {});
            db.run("ALTER TABLE created_accounts ADD COLUMN duration_days INTEGER DEFAULT 0", () => {});
        }
    });

 db.run("ALTER TABLE created_accounts ADD COLUMN days_left_notified INTEGER DEFAULT 0", () => {
        // Abaikan error jika kolom sudah ada, ini hanya untuk memastikan.
        console.log('Kolom days_left_notified untuk notifikasi expired sudah diperiksa/ditambahkan.');
    });

db.run(`CREATE TABLE IF NOT EXISTS Bugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bug_code TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        bug_address TEXT NOT NULL,
        bug_subdomain TEXT,
        is_active BOOLEAN DEFAULT 1
    )`, (err) => {
        if (err) {
            console.error('Kesalahan membuat tabel Bugs:', err.message);
        } else {
            console.log('Tabel Bugs berhasil dibuat atau sudah ada.');
        }
    });
}); 

db.run(`CREATE TABLE IF NOT EXISTS payg_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    server_id INTEGER NOT NULL,
    account_username TEXT NOT NULL,
    protocol TEXT NOT NULL,
    hourly_rate INTEGER NOT NULL,
    last_billed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
  is_paused BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES Server(id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Kesalahan membuat tabel payg_sessions:', err.message);
    } else {
        console.log('Tabel payg_sessions berhasil dibuat atau sudah ada.');
    }
});

db.run("ALTER TABLE users ADD COLUMN password TEXT", (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Gagal menambahkan kolom password:', err.message);
        } else {
            console.log('Kolom "password" untuk login web sudah diperiksa/ditambahkan.');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS processed_orkut_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_api_id TEXT UNIQUE NOT NULL, -- Kolom ini akan mengunci transaksi
    user_id_credited INTEGER,
    amount_credited INTEGER,
    processed_at TEXT NOT NULL
)`, (err) => {
    if (err) {
        console.error('Kesalahan membuat tabel processed_orkut_transactions:', err.message);
    } else {
        console.log('Tabel processed_orkut_transactions (pengunci) berhasil dibuat atau sudah ada.');
    }
});


const userState = {};
console.log('User state initialized');

const userSessions = {}; // Simpan message_id terakhir untuk setiap user

const userMessages = {}; // Menyimpan message_id terakhir untuk setiap user
bot.command(['start', 'menu'], async (ctx) => {
  const userId = ctx.from.id;
  console.log(`User ${userId} mengirim /start atau /menu.`);

  // Hapus pesan perintah /start atau /menu dari user
  if (ctx.message && ctx.message.message_id) {
      try { await ctx.deleteMessage(); } catch(e) {/* abaikan */}
  }
  // Hapus pesan lama bot untuk user ini (jika ada)
  if (userMessages[userId]) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]);
      delete userMessages[userId];
    } catch (error) {
      // console.warn(`Gagal menghapus pesan lama sebelum menu/join: ${error.message}`);
    }
  }

  const isMemberOfAllGroups = await checkUserMembershipInAllGroups(ctx, userId);

  if (!isMemberOfAllGroups) {
    console.log(`User ${userId} belum memenuhi syarat keanggotaan grup.`);
    
    let joinMessageText = `🛡️ <b>Akses Bot Terbatas</b> 🛡️\n\n` +
                          `Halo! Untuk menggunakan semua fitur bot ${NAMA_STORE || "kami"}, Anda perlu bergabung dengan grup komunitas kami terlebih dahulu.\n\n` +
                          `👇 Silakan klik tombol di bawah untuk bergabung:`;
    
    const joinKeyboard = [];
    REQUIRED_GROUPS_TO_JOIN.forEach(group => {
      joinKeyboard.push([{ text: ` Gabung ${group.name}`, url: group.link }]);
    });
    joinKeyboard.push([{ text: '🔄 Periksa Ulang Keanggotaan Saya', callback_data: 'force_join_check' }]);

    try {
        const sentJoinMessage = await ctx.replyWithHTML(joinMessageText, {
            reply_markup: {
                inline_keyboard: joinKeyboard
            },
            disable_web_page_preview: true // Penting agar link grup tidak memakan banyak tempat
        });
        userMessages[userId] = sentJoinMessage.message_id;
    } catch (error) {
        console.error("Error mengirim pesan permintaan bergabung grup:", error);
    }
    return; 
  }

  // Jika sudah jadi anggota, panggil fungsi untuk menampilkan dashboard tutorial
  console.log(`User ${userId} sudah menjadi anggota. Menampilkan menu tutorial.`);
  await displayTutorialDashboard(ctx);
});

async function checkAndNotifyExpiringAccounts() {
    console.log('[EXPIRY_NOTIF] Memulai pengecekan akun yang akan kedaluwarsa...');
    const notificationWindows = [3, 1]; // Kirim notif saat sisa 3 hari dan 1 hari

    for (const days of notificationWindows) {
        try {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + days);
            const targetDateString = targetDate.toISOString().split('T')[0];

            // Query untuk akun yang akan expired pada tanggal target & BELUM dinotifikasi untuk periode ini
            const query = `
                SELECT ca.id, ca.created_by_user_id, ca.account_username, ca.protocol, ca.server_id, s.nama_server
                FROM created_accounts ca
                JOIN Server s ON ca.server_id = s.id
                WHERE date(ca.expiry_date) = date(?) AND ca.is_active = 1 AND ca.days_left_notified != ?
            `;

            const accounts = await new Promise((resolve, reject) => {
                db.all(query, [targetDateString, days], (err, rows) => err ? reject(err) : resolve(rows || []));
            });

            if (accounts.length > 0) {
                console.log(`[EXPIRY_NOTIF] Ditemukan ${accounts.length} akun yang akan kedaluwarsa dalam ${days} hari.`);
            }

            for (const acc of accounts) {
                const message = `
⚠️ *Peringatan Kedaluwarsa* ⚠️

Halo! Akun Anda akan segera kedaluwarsa.
──────────────────────
🔹 Akun: *${escapeHtml(acc.account_username)}* (${acc.protocol.toUpperCase()})
🔹 Server: *${escapeHtml(acc.nama_server)}*
🔹 Kedaluwarsa dalam: *${days} hari lagi*
──────────────────────
Jangan sampai koneksi terputus! Silakan perpanjang masa aktif akun Anda dengan menekan tombol di bawah ini.
                `;

                // Tombol yang langsung mengarahkan ke alur perpanjangan
                const keyboard = [[{
                    text: `♻️ Perpanjang Akun ${escapeHtml(acc.account_username)}`,
                    callback_data: `start_renew_${acc.server_id}_${acc.protocol}_${acc.account_username}`
                }]];

                try {
                    // Kirim notifikasi ke pengguna
                    await callTelegramApiWithRetry(() => 
                        bot.telegram.sendMessage(acc.created_by_user_id, message, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard: keyboard }
                        })
                    );

                    // Tandai bahwa notifikasi sudah terkirim
                    await new Promise((resolve, reject) => {
                        db.run('UPDATE created_accounts SET days_left_notified = ? WHERE id = ?', [days, acc.id], (err) => err ? reject(err) : resolve());
                    });

                    console.log(`[EXPIRY_NOTIF] Notifikasi ${days} hari terkirim ke user ${acc.created_by_user_id} untuk akun ${acc.account_username}.`);

                } catch (e) {
                    console.error(`[EXPIRY_NOTIF] Gagal mengirim notifikasi ke user ${acc.created_by_user_id}: ${e.message}`);
                }
            }
        } catch (error) {
            console.error(`[EXPIRY_NOTIF] Error saat memproses notifikasi untuk ${days} hari:`, error);
        }
    }
}

// Jalankan pengecekan setiap hari jam 8 pagi Waktu Jakarta
cron.schedule('0 8 * * *', checkAndNotifyExpiringAccounts, {
    scheduled: true,
    timezone: "Asia/Jakarta"
});


console.log(`[CRON] Tugas notifikasi kedaluwarsa dijadwalkan berjalan setiap jam 8:00 pagi (WIB).`);
// Jalankan juga 20 detik setelah bot start untuk jaga-jaga jika bot mati saat jadwal cron
setTimeout(checkAndNotifyExpiringAccounts, 20000); 

// Menjalankan reset statistik pada jam 00:01 tanggal 1 setiap bulan.
cron.schedule('1 0 1 * *', () => {
    resetMonthlyStatsCounter();
}, {
    scheduled: true,
    timezone: "Asia/Jakarta"
});
console.log(`[CRON] Tugas reset statistik bulanan telah dijadwalkan.`);

// Handler untuk tombol "Perpanjang Akun" dari notifikasi
bot.action(/start_renew_(.+?)_(.+?)_(.+)/, async (ctx) => {
    const [serverId, protocol, username] = ctx.match.slice(1);
    const userId = ctx.from.id;

    await ctx.answerCbQuery(`Memulai alur perpanjangan untuk ${username}...`);
    try { await ctx.deleteMessage(); } catch(e) {}

    // Set state pengguna agar langsung masuk ke alur input masa aktif
    userState[userId] = {
        step: `exp_renew_${protocol}`,
        action: 'renew',
        type: protocol,
        serverId: serverId,
        username: username
    };

    const promptMsg = await ctx.reply(
        `⏳ Anda akan memperpanjang akun: <b>${escapeHtml(username)}</b>\n\nMasukkan masa aktif perpanjangan (dalam hari, contoh: 7, 30):`,
        { parse_mode: 'HTML' }
    );
    if(userState[userId]) userState[userId].lastBotMessageId = promptMsg.message_id;
});

async function isUsernameAvailable(username, serverId, protocol) {
    return new Promise(async (resolve, reject) => { // Tambahkan async di sini
        try {
            // Dapatkan domain dari serverId yang diberikan
            const serverInfo = await new Promise((res, rej) => {
                db.get('SELECT domain FROM Server WHERE id = ?', [serverId], (err, row) => {
                    if (err) rej(err);
                    else if (!row) rej(new Error(`Server ID ${serverId} not found.`));
                    else res(row);
                });
            });
            const serverDomain = serverInfo.domain;

            // Sekarang, cari akun yang aktif di server MANAPUN yang memiliki domain yang sama
            const query = `
                SELECT ca.id FROM created_accounts ca
                JOIN Server s ON ca.server_id = s.id
                WHERE ca.account_username = ? AND s.domain = ? AND ca.protocol = ? AND ca.is_active = 1 AND ca.expiry_date > datetime('now', 'localtime')
                UNION ALL
                SELECT ps.id FROM payg_sessions ps
                JOIN Server s ON ps.server_id = s.id
                WHERE ps.account_username = ? AND s.domain = ? AND ps.protocol = ? AND ps.is_active = 1;
            `;
            db.all(query, [username, serverDomain, protocol, username, serverDomain, protocol], (err, rows) => {
                if (err) {
                    console.error("Error checking username availability by domain in DB:", err.message);
                    reject(new Error("Gagal memeriksa ketersediaan username di database."));
                } else {
                    resolve(rows.length === 0); // true jika tersedia, false jika tidak tersedia
                }
            });
        } catch (error) {
            reject(error); // Tangani error dari pengambilan domain server
        }
    });
}



// Tambahkan blok ini setelah: const db = new sqlite3.Database(...)

// ===================================================================
// =================== LOGIKA INTI PAY-AS-YOU-GO =====================
// ===================================================================

const PAYG_MINIMUM_BALANCE_THRESHOLD = 200; // Layanan berhenti jika saldo di bawah ini
// GANTI SELURUH FUNGSI stopPaygSession ANDA DENGAN VERSI INI

/**
 * Menghentikan sesi Pay-As-You-Go, menghapus akun di server, dan menonaktifkan di DB.
 * @param {number} sessionId ID dari tabel payg_sessions.
 * @param {string} reason Alasan penghentian.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
async function stopPaygSession(sessionId, reason) {
    console.log(`[PAYG] Memulai penghentian sesi ID: ${sessionId} karena: ${reason}`);
    try {
        const session = await new Promise((resolve, reject) => {
            db.get(`SELECT ps.*, s.nama_server
                    FROM payg_sessions ps
                    JOIN Server s ON ps.server_id = s.id
                    WHERE ps.id = ? AND ps.is_active = 1`, [sessionId], (err, row) => {
                if (err) return reject(new Error(`DB error saat ambil sesi PAYG ${sessionId}: ${err.message}`));
                resolve(row);
            });
        });

        if (!session) {
            console.warn(`[PAYG] Sesi ${sessionId} tidak ditemukan atau sudah tidak aktif saat akan dihentikan.`);
            return false;
        }

        const { user_id, account_username, protocol, server_id, nama_server } = session;

        await callDeleteAPI(protocol, account_username, server_id);
        console.log(`[PAYG] Permintaan hapus akun ${account_username} (${protocol}) di server fisik telah dikirim.`);

        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION;");
                db.run("UPDATE payg_sessions SET is_active = 0 WHERE id = ?", [sessionId], (err) => {
                    if (err) return db.run("ROLLBACK;", () => reject(err));
                });
                db.run("UPDATE Server SET total_create_akun = CASE WHEN total_create_akun > 0 THEN total_create_akun - 1 ELSE 0 END WHERE id = ?", [server_id], (err) => {
                    if (err) return db.run("ROLLBACK;", () => reject(err));
                });
                db.run("COMMIT;", (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
        console.log(`[PAYG] Sesi ${sessionId} telah dinonaktifkan di DB dan slot server dikembalikan.`);

        // Kirim notifikasi ke pengguna
        await callTelegramApiWithRetry(() => bot.telegram.sendMessage(user_id,
            `❗️ *Layanan Pay-As-You-Go Dihentikan* ❗️\n\n` +
            `Layanan untuk akun *${escapeHtml(account_username)}* (${protocol.toUpperCase()}) di server *${escapeHtml(nama_server)}* telah dihentikan.\n\n` +
            `*Alasan:* ${reason}.`,
            { parse_mode: 'Markdown' }
        ));

        // =======================================================
        // ==> BLOK NOTIFIKASI PENGHENTIAN KE GRUP (BARU) <==
        // =======================================================
        let userDisplayName = `User ID ${user_id}`;
        try {
            const userInfo = await bot.telegram.getChat(user_id);
            userDisplayName = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || `User ID ${user_id}`);
        } catch (e) {
            console.warn(`[PAYG_STOP_NOTIF] Gagal mendapatkan info chat untuk user ${user_id}: ${e.message}`);
        }

        const groupMessage = `
──────────────────────
⟨ Layanan PAYG Dihentikan ⟩
──────────────────────
Pengguna: <a href="tg://user?id=${user_id}">${escapeHtml(userDisplayName)}</a>
──────────────────────
  Detail Akun:
  ➥ Layanan: ${protocol.toUpperCase()}
  ➥ Server: ${escapeHtml(nama_server)}
  ➥ Akun: <code>${escapeHtml(account_username)}</code>
──────────────────────
Alasan: <b>${escapeHtml(reason)}</b>
Tanggal: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
`;

        if (GROUP_ID) {
            try {
                await callTelegramApiWithRetry(() => 
                    bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'HTML', disable_web_page_preview: true })
                );
                console.log(`[PAYG_STOP_NOTIF] Notifikasi penghentian PAYG untuk ${account_username} berhasil dikirim ke grup.`);
            } catch (error) {
                console.error(`[PAYG_STOP_NOTIF] Gagal mengirim notifikasi penghentian PAYG ke grup:`, error.message);
            }
        }
        // =======================================================
        // ==> AKHIR BLOK NOTIFIKASI BARU <==
        // =======================================================

        return true;

    } catch (error) {
        console.error(`[PAYG] Error fatal saat menghentikan sesi ${sessionId}:`, error);
        await bot.telegram.sendMessage(ADMIN, `🚨 PAYG STOP SESSION ERROR 🚨\nSesi ID: ${sessionId}\nError: ${error.message}`).catch(() => {});
        return false;
    }
}

/**
 * Mesin penagihan yang berjalan secara periodik untuk model Pay-As-You-Go.
 */
async function processPaygBilling() {
    console.log('[PAYG_ENGINE] Memulai siklus pemeriksaan penagihan...');
    try {
    // Ambil sesi aktif yang tidak dijeda (is_paused != 1) - sesi yang dijeda tidak ditagih
    const activeSessions = await new Promise((resolve, reject) => {
      db.all(`SELECT ps.* FROM payg_sessions ps WHERE ps.is_active = 1 AND (ps.is_paused IS NULL OR ps.is_paused = 0)`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

        if (activeSessions.length === 0) return;
        
        console.log(`[PAYG_ENGINE] Ditemukan ${activeSessions.length} sesi PAYG aktif.`);

        for (const session of activeSessions) {
            const now = new Date();
            const lastBilled = new Date(session.last_billed_at);
            const hoursPassed = (now.getTime() - lastBilled.getTime()) / (1000 * 60 * 60);

            if (hoursPassed >= 1) {
                console.log(`[PAYG_ENGINE] Sesi ${session.id} (user: ${session.user_id}) perlu ditagih.`);
                const user = await new Promise((resolve) => db.get("SELECT saldo FROM users WHERE user_id = ?", [session.user_id], (_, r) => resolve(r)));

                if (!user) {
                    await stopPaygSession(session.id, 'Data pengguna tidak ditemukan di sistem.');
                    continue;
                }
                
                if (user.saldo >= session.hourly_rate + PAYG_MINIMUM_BALANCE_THRESHOLD) {
                    await new Promise((resolve, reject) => {
                       db.run("UPDATE users SET saldo = saldo - ? WHERE user_id = ?", [session.hourly_rate, session.user_id], (err) => {
                           if(err) return reject(err);
                           db.run("UPDATE payg_sessions SET last_billed_at = ? WHERE id = ?", [now.toISOString(), session.id], (err) => err ? reject(err) : resolve());
                       });
                    });
                    console.log(`[PAYG_ENGINE] Berhasil menagih sesi ${session.id}. Saldo dipotong Rp${session.hourly_rate}.`);
                } else {
                    console.log(`[PAYG_ENGINE] Saldo tidak cukup untuk sesi ${session.id}. Menghentikan layanan...`);
                    await stopPaygSession(session.id, `Saldo tidak mencukupi (tersisa Rp${user.saldo.toLocaleString('id-ID')})`);
                }
            }
        }
    } catch (error) {
        console.error('[PAYG_ENGINE] Terjadi kesalahan pada mesin penagihan:', error);
    }
}

// Menjalankan mesin penagihan setiap 5 menit
cron.schedule('*/5 * * * *', processPaygBilling, {
    scheduled: true,
    timezone: "Asia/Jakarta"
});
console.log(`[PAYG_ENGINE] Mesin penagihan Pay-As-You-Go dijadwalkan berjalan setiap 5 menit.`);
setTimeout(processPaygBilling, 15000); // Panggil sekali 15 detik setelah start

// ===================================================================
// ================= AKHIR LOGIKA PAY-AS-YOU-GO ======================
// ===================================================================

// Helper function for retrying Telegram API calls
async function callTelegramApiWithRetry(apiCallFunction, maxRetries = 3, initialDelayMs = 1000) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            return await apiCallFunction(); // Execute the provided API call function
        } catch (error) {
            attempts++;
            // Check if the error is ETIMEDOUT or other common network errors
            const isTimeout = (error.code === 'ETIMEDOUT' || (error.type === 'system' && error.errno === 'ETIMEDOUT'));
            const isNetworkError = error.message && (
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ESOCKETTIMEDOUT') ||
                error.message.includes('EAI_AGAIN') // Another common DNS/network issue
            );
            const isTooManyRequests = error.response && error.response.error_code === 429; // Telegram Flood Control

            if ((isTimeout || isNetworkError || isTooManyRequests) && attempts < maxRetries) {
                let delay = initialDelayMs * Math.pow(2, attempts - 1); // Exponential backoff
                if (isTooManyRequests && error.response.parameters && error.response.parameters.retry_after) {
                    // Use retry_after value from Telegram API if available, add a small buffer
                    delay = (error.response.parameters.retry_after * 1000) + 500;
                    console.warn(`Telegram API: Too Many Requests. Retrying after ${delay / 1000}s (attempt ${attempts}/${maxRetries}).`);
                } else {
                    console.warn(`Telegram API call failed (attempt ${attempts}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // For other errors or if max retries reached, rethrow
                console.error(`Telegram API call failed definitively after ${attempts} attempts or due to unrecoverable error: ${error.message}`);
                throw error;
            }
        }
    }
}

async function checkUserMembershipInAllGroups(ctx, userId) {
    if (!REQUIRED_GROUPS_TO_JOIN || REQUIRED_GROUPS_TO_JOIN.length === 0) {
        return true; 
    }
    for (const group of REQUIRED_GROUPS_TO_JOIN) {
        try {
            // Tambahkan log untuk debugging ETIMEDOUT
            console.log(`[MEMBERSHIP_CHECK] User: ${userId}, Group: ${group.id}, Caller: ${ctx.callbackQuery ? ctx.callbackQuery.data : (ctx.message ? ctx.message.text : 'Unknown')}`);
            const member = await ctx.telegram.getChatMember(group.id, userId);
            console.log(`[MEMBERSHIP_CHECK_STATUS] User: ${userId}, Group: ${group.id}, Status: ${member.status}`);
            if (!['creator', 'administrator', 'member', 'restricted'].includes(member.status)) {
                return false; 
            }
        } catch (error) {
            console.warn(`[MEMBERSHIP_CHECK_ERROR] User: ${userId}, Group: ${group.id}, Error: ${error.message}`);
            return false;
        }
    }
    return true; 
}

async function displayTutorialDashboard(ctx) {
    const userId = ctx.from.id;

    if (ctx.callbackQuery) {
        // Jika dipanggil dari tombol "Kembali", tidak perlu hapus pesan, cukup edit
    } else {
        if (userMessages[userId]) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); delete userMessages[userId]; } catch (e) {}
        }
        if (ctx.message) {
            try { await ctx.deleteMessage(); } catch(e) {}
        }
    }

    const rawUsername = ctx.from.username || ctx.from.first_name || `Pengguna`;
    const username = `<a href="tg://user?id=${userId}">${escapeHtml(rawUsername)}</a>`;

    db.serialize(() => {
        db.run('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)', [userId, username]);
        db.run(`UPDATE users SET username = ? WHERE user_id = ? AND (username IS NULL OR username != ?)`, [username, userId, username]);
    });

    const minResellerUpgradeTopUp = await getMinResellerUpgradeTopUp();

    // ==> PERUBAHAN DIMULAI DI SINI: Ambil data ranking <==
    const ranking = await getAccountCreationRanking();
    let rankingText = '<code>⚠️ Tidak ada data ranking.</code>';
    if (ranking && ranking.length > 0) {
      rankingText = "<code>" + ranking.map((user, index) => {
        const medals = ["🥇", "🥈", "🥉"];
        return `${medals[index] || '➥'} ${escapeHtml(cleanUsername(user.username) || `ID:${user.user_id}`)}: ${user.accounts_created_30days} akun`;
      }).join('\n') + "</code>";
    }
    // ==> AKHIR PERUBAHAN <==

    const messageTextForTutorial = `
<code><b>═════════════════════════════════</b></code>
                  ≡ <b>🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​</b> ≡
<code><b>═════════════════════════════════</b></code>
                     <b>⟨ DASHBOARD AWAL ⟩</b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
  <b><code>Selamat Datang</code></b> <i>${username}</i>
  <b><code>ID Anda:</code></b> <code>${userId}</code>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b><code>Jika ingin menjadi reseller:</code></b>
<b><code>Minimal Topup:</code></b><b><code>Rp ${minResellerUpgradeTopUp.toLocaleString('id-ID')}</code></b>
<b><code>Diskon 50% dari harga normal!</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<blockquote><code>🏆</code> <code><b>TOP 3 CREATE AKUN (30 HARI)</b></code></blockquote>${rankingText}
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b>Jika Sudah Paham Lanjut Ke Main Menu</b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
📞 <b><code>KESULITAN?</code></b>
👤 <b><code>Chat Owner:</code></b> <a href="tg://user?id=7251232303">RyyStore</a>
☏ <a href="https://wa.me/6287767287284">WhatsApp</a>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
Silakan pilih opsi di bawah:
`;

    const simplifiedKeyboard = [
        [
          { text: 'Panduan & Tutorial Bot', callback_data: 'tutorial_menu_show' },
          { text: 'Gabung Grup WhatsApp', url: 'https://chat.whatsapp.com/J8xxgw6eVJ23wY5JbluDfJ' }
        ],
        [{ text: 'Lanjut ke Menu Utama', callback_data: 'main_menu_refresh' }]
    ];
    
    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: simplifiedKeyboard },
        disable_web_page_preview: true
    };

    try {
        let sentMessage;
        if (ctx.callbackQuery) {
            sentMessage = await callTelegramApiWithRetry(() => ctx.editMessageText(messageTextForTutorial, messageOptions));
        } else {
            sentMessage = await callTelegramApiWithRetry(() => ctx.replyWithHTML(messageTextForTutorial, messageOptions));
        }
        const messageId = ctx.callbackQuery ? ctx.callbackQuery.message.message_id : sentMessage.message_id;
        if (messageId) userMessages[userId] = messageId;
    } catch (error) {
        console.error('Error di displayTutorialDashboard:', error);
    }
}
// TAMBAHKAN FUNGSI BARU INI
async function sendAdminStats(ctx) {
    try {
        await ctx.reply('📊 Mengambil data statistik, mohon tunggu...');

        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();

        // Jalankan semua query database secara paralel untuk efisiensi
        const [
            userStats,
            serverStats,
            activeAccountsCount,
            newAccountsCount,
            totalBalance
        ] = await Promise.all([
            // Query untuk statistik pengguna
            new Promise((resolve) => db.get("SELECT COUNT(*) as total, SUM(CASE WHEN role = 'reseller' THEN 1 ELSE 0 END) as resellers FROM users", (_, r) => resolve(r))),
            // Query untuk statistik slot server
            new Promise((resolve) => db.get("SELECT SUM(total_create_akun) as used, SUM(batas_create_akun) as total FROM Server", (_, r) => resolve(r))),
            // Query untuk total akun aktif
            new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM created_accounts WHERE is_active = 1 AND expiry_date > ?", [now.toISOString()], (_, r) => resolve(r))),
            // Query untuk akun baru dalam 24 jam
            new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM created_accounts WHERE creation_date >= ?", [twentyFourHoursAgo], (_, r) => resolve(r))),
            // Query untuk total saldo semua pengguna
            new Promise((resolve) => db.get("SELECT SUM(saldo) as total FROM users", (_, r) => resolve(r)))
        ]);

        const memberCount = (userStats.total || 0) - (userStats.resellers || 0);
        const slotPercentage = (serverStats.total > 0) ? ((serverStats.used / serverStats.total) * 100).toFixed(1) : 0;

        // Susun pesan statistik
        let message = `📊 *DASHBOARD STATISTIK ADMIN*\n`;
        message += `_(Diperbarui: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })})_\n\n`;

        message += `📈 *PENGGUNA*\n`;
        message += `   - Total Pengguna: *${userStats.total || 0}*\n`;
        message += `   - Reseller Aktif: *${userStats.resellers || 0}*\n`;
        message += `   - Member Aktif: *${memberCount || 0}*\n\n`;

        message += `🛰️ *AKUN & SERVER*\n`;
        message += `   - Total Akun Aktif: *${activeAccountsCount.count || 0}*\n`;
        message += `   - Slot Terpakai: *${serverStats.used || 0} / ${serverStats.total || 0} (${slotPercentage}%)*\n`;
        message += `   - Akun Dibuat (24 Jam): *${newAccountsCount.count || 0}*\n\n`;
        
        message += `💰 *FINANSIAL*\n`;
        message += `   - Total Saldo Pengguna: *Rp ${(totalBalance.total || 0).toLocaleString('id-ID')}*\n`;

        await ctx.reply(message, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error("Gagal mengambil statistik admin:", error);
        await ctx.reply("⚠️ Terjadi kesalahan saat memuat data statistik.");
    }
}
// GANTI FUNGSI LAMA DENGAN VERSI FINAL INI
async function checkResellerAccountQuota() {
    console.log('🔄 [SISTEM OTOMATIS] Memulai pengecekan kuota reseller...');
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const nowISO = now.toISOString();

    try {
        const resellers = await new Promise((resolve, reject) => {
            db.all("SELECT user_id, username, became_reseller_on, reseller_quota_last_checked_on FROM users WHERE role = 'reseller'", [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });

        if (resellers.length === 0) return;

        for (const reseller of resellers) {
            const { user_id, username: resellerUsername, became_reseller_on, reseller_quota_last_checked_on } = reseller;
            
            if (!became_reseller_on) {
                console.warn(`[OTOMATIS] ⏭️ Melewati ${resellerUsername || user_id} karena tidak punya tanggal pengangkatan.`);
                continue;
            }

            // Gunakan tanggal cek terakhir, jika tidak ada, gunakan tanggal pengangkatan
            const checkStartDateISO = reseller_quota_last_checked_on || became_reseller_on;
            const checkStartDate = new Date(checkStartDateISO);

            // Cek apakah sudah 30 hari sejak pengecekan terakhir
            if (now.getTime() >= checkStartDate.getTime() + thirtyDaysInMs) {
                const queryWindowStartISO = checkStartDateISO;
                const queryWindowEndISO = nowISO;

                console.log(`[OTOMATIS] ⏳ Mengevaluasi ${resellerUsername || user_id} | Periode: ${queryWindowStartISO.split('T')[0]} -> ${queryWindowEndISO.split('T')[0]}`);

                const accountsCreated = await new Promise((resolve, reject) => {
                    db.get(`
                        SELECT COUNT(*) as count FROM created_accounts
                        WHERE created_by_user_id = ? AND duration_days >= 30 AND creation_date >= ? AND creation_date < ?
                    `, [user_id, queryWindowStartISO, queryWindowEndISO], (err, row) => {
                        if (err) return reject(err);
                        resolve(row ? row.count : 0);
                    });
                });

                if (accountsCreated < 5) {
                    await new Promise((resolve, reject) => {
                        db.run("UPDATE users SET role = 'member', became_reseller_on = NULL, reseller_quota_last_checked_on = NULL WHERE user_id = ? AND role = 'reseller'", [user_id], (err) => {
                            if (err) return reject(err);
                            console.log(`[OTOMATIS] ✅ BERHASIL diturunkan: ${resellerUsername || user_id} (hanya ${accountsCreated} akun).`);
                            resolve();
                        });
                    });
                    
                    const userNotif = `⚠️ Peran reseller Anda telah diturunkan karena tidak membuat min. 5 akun bulanan dalam 30 hari terakhir (Anda hanya membuat ${accountsCreated} akun).`;
                    const groupNotif = `📉 *Penurunan Role Otomatis*\n\n`+
                                       `👤 User: ${resellerUsername ? escapeHtml(resellerUsername) : ''} (<a href="tg://user?id=${user_id}">${user_id}</a>)\n`+
                                       `📉 Diturunkan ke: Member\n`+
                                       `📝 Alasan: Hanya membuat ${accountsCreated} akun (dari min. 5).\n`+
                                       `🤖 Oleh: Sistem Otomatis Harian`;
                    
                    try { await bot.telegram.sendMessage(user_id, userNotif); } catch (e) { /* abaikan */ }
                    try { if (GROUP_ID) await bot.telegram.sendMessage(GROUP_ID, groupNotif, { parse_mode: 'HTML', disable_web_page_preview: true }); } catch (e) { /* abaikan */ }
                
                } else {
                     console.log(`[OTOMATIS] ✅ LULUS: ${resellerUsername || user_id} (${accountsCreated} akun).`);
                }

                // Perbarui tanggal cek terakhir agar siklus 30 hari berikutnya dimulai dari sekarang
                await new Promise((resolve, reject) => {
                    db.run("UPDATE users SET reseller_quota_last_checked_on = ? WHERE user_id = ?", [nowISO, user_id], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            }
        }
    } catch (error) {
        console.error('❌ [SISTEM OTOMATIS] Terjadi kesalahan fatal:', error);
    }
}

// Fungsi ini HANYA untuk mereset statistik bulanan
const resetMonthlyStatsCounter = async (forceRun = false) => {
    try {
        const trigger = forceRun ? "MANUAL" : "CRON";
        console.log(`[STATS_RESET] Menjalankan reset statistik bulanan (Trigger: ${trigger})...`);
        
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET accounts_created_30days = 0', (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        
        console.log('[STATS_RESET] ✅ Counter "accounts_created_30days" untuk statistik berhasil direset.');

        const notifMessage = forceRun 
            ? '📊 Reset statistik manual oleh admin berhasil.' 
            : '📊 Statistik peringkat bulanan telah direset untuk memulai bulan yang baru!';
            
        await bot.telegram.sendMessage(GROUP_ID, notifMessage);

    } catch (error) {
        console.error(`[STATS_RESET] Gagal mereset statistik bulanan (Trigger: ${trigger}):`, error);
    }
};

// Fungsi untuk update data pembuatan akun
async function updateUserAccountCreation(userId) {
  try {
    const currentDate = new Date();
    const today = currentDate.toISOString().split('T')[0];

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         accounts_created_30days = accounts_created_30days + 1,
         total_accounts_created = total_accounts_created + 1,
         last_account_creation_date = ? 
         WHERE user_id = ?`,
        [today, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } catch (error) {
    console.error('🚫 Gagal update akun:', error);
  }
}

async function checkAndUpdateUserRole(userId, toppedUpAmount = 0) {
  let dbRoleUpdatedSuccessfully = false; // Flag untuk melacak apakah operasi DB berhasil

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          // Error saat mengambil data dari DB, ini kritis
          return reject(new Error(`Database error saat mengambil data user ${userId}: ${err.message}`));
        }
        if (!row) {
          // Pengguna tidak ditemukan, bukan error untuk dilempar, tapi proses update tidak bisa lanjut
          console.error(`🚫 Pengguna ${userId} tidak ditemukan di database saat checkAndUpdateUserRole.`);
          return resolve(null);
        }
        resolve(row);
      });
    });

    if (!user) {
      return; // Keluar jika pengguna tidak ditemukan
    }

    const { role } = user;
    const minResellerUpgradeTopUp = await getMinResellerUpgradeTopUp(); // Pastikan fungsi ini ada

    if (role === 'member' && toppedUpAmount >= minResellerUpgradeTopUp) {
      const nowISO = new Date().toISOString();
      const todayDateOnly = nowISO.split('T')[0];

      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET role = ?, last_topup_date = ?, became_reseller_on = ?, reseller_quota_last_checked_on = ? WHERE user_id = ?',
          ['reseller', todayDateOnly, nowISO, nowISO, userId],
          function(err) {
            if (err) {
              // Error saat update DB, ini kritis
              console.error(`Error upgrading user ${userId} to reseller in DB:`, err.message);
              return reject(new Error(`Gagal update role user ${userId} di DB: ${err.message}`));
            }
            if (this.changes > 0) {
              console.log(`✅ Role pengguna ${userId} diubah menjadi reseller di DB. became_reseller_on dan reseller_quota_last_checked_on di-set ke ${nowISO}.`);
              dbRoleUpdatedSuccessfully = true; // Tandai operasi DB berhasil
            } else {
              // Tidak ada perubahan, mungkin user sudah reseller atau ID tidak cocok.
              console.warn(`Pembaruan role untuk user ${userId} tidak menghasilkan perubahan (this.changes = 0).`);
            }
            resolve();
          }
        );
      });

      // Lanjutkan dengan notifikasi Telegram HANYA jika operasi DB berhasil mengubah role
      if (dbRoleUpdatedSuccessfully) {
        let chat;
        try {
          // Panggil getChat dengan retry
          chat = await callTelegramApiWithRetry(() => bot.telegram.getChat(userId));
        } catch (getChatError) {
          console.warn(`[checkAndUpdateUserRole] Gagal mendapatkan info chat untuk user ${userId} setelah retry: ${getChatError.message}. Menggunakan fallback.`);
          chat = { username: null, first_name: `User ID ${userId}` }; // Data fallback
        }
        
        const usernameForNotif = chat.username ? `@${chat.username}` : (chat.first_name || `User ID ${userId}`);

        // Persiapan pesan notifikasi
        const userMessageText = `🎉 *Selamat! Anda sekarang menjadi reseller.*\n\n` +
                              `──────────────────────\n` +
                              `➥ *Penyebab:* Top-up sebesar Rp${toppedUpAmount.toLocaleString('id-ID')}\n` +
                              `➥ *Role Baru:* Reseller\n` +
                              `➥ *Tanggal Mulai:* ${new Date(nowISO).toLocaleDateString('id-ID')}\n` +
                              `➥ *Syarat Tambahan:* Buat minimal 5 akun (masing-masing 30 hari) setiap 30 hari untuk mempertahankan status reseller.\n` +
                              `──────────────────────`;
        
        const adminAndGroupMessageText = `🎉 *Notifikasi Upgrade Reseller*\n\n` +
                                        `──────────────────────\n` +
                                        `➥ *Username:* [${usernameForNotif}](tg://user?id=${userId})\n` +
                                        `➥ *User ID:* ${userId}\n` +
                                        `➥ *Penyebab:* Top-up sebesar Rp${toppedUpAmount.toLocaleString('id-ID')}\n` +
                                        `➥ *Role Baru:* Reseller\n` +
                                        `➥ *Tanggal Mulai:* ${new Date(nowISO).toLocaleDateString('id-ID')}\n` +
                                        `──────────────────────`;

        // Kirim notifikasi ke pengguna dengan retry
        try {
          await callTelegramApiWithRetry(() => bot.telegram.sendMessage(userId, userMessageText, { parse_mode: 'Markdown' }));
        } catch (e) {
          console.error(`[checkAndUpdateUserRole] Gagal mengirim notifikasi upgrade ke USER ${userId} setelah retry: ${e.message}`);
        }

        // Kirim notifikasi ke ADMIN dengan retry
        if (ADMIN) { 
            try {
              await callTelegramApiWithRetry(() => bot.telegram.sendMessage(ADMIN, adminAndGroupMessageText, { parse_mode: 'Markdown' }));
            } catch (e) {
              console.error(`[checkAndUpdateUserRole] Gagal mengirim notifikasi upgrade ke ADMIN untuk user ${userId} setelah retry: ${e.message}`);
            }
        }

        // Kirim notifikasi ke GROUP_ID dengan retry
        if (GROUP_ID && GROUP_ID !== ADMIN) { 
          try {
            await callTelegramApiWithRetry(() => bot.telegram.sendMessage(GROUP_ID, adminAndGroupMessageText, { parse_mode: 'Markdown' }));
          } catch (e) {
            console.error(`[checkAndUpdateUserRole] Gagal mengirim notifikasi upgrade ke GROUP untuk user ${userId} setelah retry: ${e.message}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`🚫 Gagal memeriksa dan/atau mengupdate role pengguna ${userId} (Kesalahan utama atau DB):`, error.message, error.stack);
    if (!dbRoleUpdatedSuccessfully) { // Jika error terjadi pada atau sebelum operasi DB kritis
        throw error; // Lemparkan error ini agar ditangkap oleh pemanggil (misal topUpQueue.process)
    }
    // Jika operasi DB berhasil, tapi error lain terjadi (yang seharusnya tidak mungkin jika notifikasi sudah di-handle),
    // maka kita tidak melempar error agar proses top-up tidak dianggap gagal total.
  }
}

// TAMBAHKAN FUNGSI BARU INI
async function sendDeleteRefundNotification(deleterUserId, deletedAccount, refundAmount) {
    let deleterDisplayName = `User ID ${deleterUserId}`;
    try {
        const userInfo = await bot.telegram.getChat(deleterUserId);
        deleterDisplayName = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || `User ID ${deleterUserId}`);
    } catch (e) {
        console.warn(`Gagal mendapatkan info chat untuk notifikasi delete user ${deleterUserId}: ${e.message}`);
    }

    const message = `
──────────────────────  
⟨ Notifikasi Hapus Akun ⟩
──────────────────────
👤 Aksi oleh: <a href="tg://user?id=${deleterUserId}">${escapeHtml(deleterDisplayName)}</a>
──────────────────────
 Detail Akun yang Dihapus:
  ➥ Layanan: ${deletedAccount.protocol.toUpperCase()}
  ➥ Server: ${escapeHtml(deletedAccount.nama_server)}
  ➥ Username: <code>${escapeHtml(deletedAccount.account_username)}</code>
──────────────────────
 Saldo Dikembalikan: <b>Rp ${refundAmount.toLocaleString('id-ID')}</b>
`;

    // Kirim ke Grup
    if (GROUP_ID) {
        try {
            await bot.telegram.sendMessage(GROUP_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (error) {
            console.error(`Gagal kirim notif delete ke grup untuk user ${deleterUserId}:`, error.message);
        }
    }
}

// TAMBAHKAN FUNGSI BARU INI
async function adjustResellerQuotaOnDelete(accountObject) {
    // Hanya kurangi kuota jika akun yang dihapus adalah akun bulanan (>= 30 hari)
    if (accountObject.duration_days >= 30) {
        const creatorUserId = accountObject.created_by_user_id;
        console.log(`[ADJUST_QUOTA] Akun bulanan (${accountObject.account_username}) dihapus. Mengurangi kuota untuk user ID: ${creatorUserId}`);
        
        try {
            await new Promise((resolve, reject) => {
                const sql = `
                    UPDATE users 
                    SET 
                        accounts_created_30days = CASE WHEN accounts_created_30days > 0 THEN accounts_created_30days - 1 ELSE 0 END,
                        total_accounts_created = CASE WHEN total_accounts_created > 0 THEN total_accounts_created - 1 ELSE 0 END
                    WHERE user_id = ?
                `;
                db.run(sql, [creatorUserId], function(err) {
                    if (err) reject(err);
                    else {
                        if (this.changes > 0) {
                            console.log(`[ADJUST_QUOTA] Kuota untuk user ${creatorUserId} berhasil dikurangi.`);
                        }
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.error(`[ADJUST_QUOTA] Gagal mengurangi kuota untuk user ${creatorUserId}:`, error);
            // Tidak menghentikan proses refund, hanya catat error
        }
    }
}

async function sendUserNotificationTopup(userId, amount, uniqueAmount, bonusAmount = 0) {
  const userOriginalTopup = amount;
  const totalSaldoMasuk = userOriginalTopup + bonusAmount;
  let bonusText = "";

  if (bonusAmount > 0) {
    bonusText = `\n🎉 *Bonus Spesial Diterima:* Rp${bonusAmount.toLocaleString('id-ID')}`;
  }

  const userMessage = `
──────────────────────
⟨ STATUS TOPUP SUCCESS ⟩
──────────────────────
➥ *Nominal Topup Anda:* Rp${userOriginalTopup.toLocaleString('id-ID')}${bonusText}
➥ *Total Saldo Masuk:* Rp${totalSaldoMasuk.toLocaleString('id-ID')}
➥ *Kode Transaksi:* TRX-${Math.floor(100000 + Math.random() * 900000)}
➥ *Total Pembayaran:* Rp${uniqueAmount.toLocaleString('id-ID')}
➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}
──────────────────────
Terima kasih telah melakukan top-up di ${NAMA_STORE}!
`;

  try {
    // Menggunakan helper untuk mengirim pesan
    await callTelegramApiWithRetry(() => bot.telegram.sendMessage(userId, userMessage, { parse_mode: 'Markdown' }));
    console.log(`✅ Notifikasi top-up berhasil dikirim ke pengguna ${userId}`);
  } catch (error) {
    // Error sudah di-log oleh callTelegramApiWithRetry jika gagal setelah semua percobaan
    console.error(`🚫 Gagal mengirim notifikasi top-up ke pengguna ${userId} setelah semua percobaan:`, error.message);
    // Tidak perlu throw error lagi, cukup log
  }
}

// TAMBAHKAN FUNGSI BARU INI DI KODE ANDA
async function sendRenewNotification(userId, userRole, protocol, serverName, accountUsername, duration, cost, newExpiryDate) {
    let userDisplayName = `User ID ${userId}`;
    try {
        const userInfo = await bot.telegram.getChat(userId);
        userDisplayName = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || `User ID ${userId}`);
    } catch (e) {
        console.warn(`Gagal mendapatkan info chat untuk notifikasi renew user ${userId}: ${e.message}`);
    }

    const roleText = userRole === 'reseller' ? 'Reseller 🛒' : 'Member 👤';
    const newExpiryString = newExpiryDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const message = `
──────────────────────
⟨ Perpanjangan Akun Sukses ⟩
──────────────────────
👤 Pengguna: <a href="tg://user?id=${userId}">${escapeHtml(userDisplayName)}</a>
🎖️ Role: ${roleText}
──────────────────────
 Detail Perpanjangan:
  ➥ Layanan: ${protocol.toUpperCase()}
  ➥ Server: ${escapeHtml(serverName)}
  ➥ Username: <code>${escapeHtml(accountUsername)}</code>
  ➥ Durasi: ${duration} hari
  ➥ Biaya: Rp${cost.toLocaleString('id-ID')}
  ➥ Aktif Hingga: ${newExpiryString}
──────────────────────
`;

    // Kirim ke Grup
    if (GROUP_ID) {
        try {
            await bot.telegram.sendMessage(GROUP_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (error) {
            console.error(`Gagal kirim notif perpanjangan ke grup untuk user ${userId}:`, error.message);
        }
    }

}

async function sendAdminNotificationTopup(username, userId, amount, uniqueAmount, bonusAmount = 0) {
  const userOriginalTopup = amount;
  const totalSaldoMasuk = userOriginalTopup + bonusAmount;
  let bonusText = "";
  if (bonusAmount > 0) {
    bonusText = ` (Termasuk Bonus: Rp${bonusAmount.toLocaleString('id-ID')})`;
  }

  const adminMessage = `
──────────────────────
⟨ NOTIFIKASI TOPUP ⟩
──────────────────────
➥ *Username:* [${username}](tg://user?id=${userId})
➥ *User ID:* ${userId}
➥ *Jumlah Top-up:* Rp${userOriginalTopup.toLocaleString('id-ID')}
➥ *Bonus Diberikan:* Rp${bonusAmount.toLocaleString('id-ID')}
➥ *Total Masuk Saldo:* Rp${totalSaldoMasuk.toLocaleString('id-ID')}${bonusText}
➥ *Kode Transaksi:* TRX-${Math.floor(100000 + Math.random() * 900000)}
➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}
──────────────────────
`;

  try {
    await bot.telegram.sendMessage(ADMIN, adminMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi top-up berhasil dikirim ke admin`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi top-up ke admin:', error.message);
  }
}

// Tambahkan fungsi baru ini di kode Anda

/**
 * Mengirim notifikasi ke grup ketika ada pembelian akun Pay-As-You-Go.
 * @param {number} userId ID pengguna yang membeli.
 * @param {string} accountUsername Username akun yang dibuat.
 * @param {string} protocol Protokol yang dibeli (ssh, vmess, dll).
 * @param {string} serverName Nama server tempat akun dibuat.
 * @param {number} hourlyRate Biaya per jam untuk layanan tersebut.
 */
async function sendPaygPurchaseNotification(userId, accountUsername, protocol, serverName, hourlyRate) {
    let userDisplayName = `User ID ${userId}`;
    let userRoleText = 'Member 👤';

    try {
        // Ambil info user dari DB untuk mendapatkan role dan nama tampilan
        const user = await new Promise((resolve, reject) => {
            db.get("SELECT username, role FROM users WHERE user_id = ?", [userId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (user) {
            userDisplayName = cleanUsername(user.username) || `User ID ${userId}`;
            userRoleText = user.role === 'reseller' ? 'Reseller 🛒' : 'Member 👤';
        }
    } catch (e) {
        console.warn(`[PAYG_NOTIF] Gagal mendapatkan info user ${userId} dari DB: ${e.message}`);
    }

    // Susun pesan notifikasi
    const message = `
──────────────────────
⟨ ⏱️ TRX PAY AS YOU GO ⟩
──────────────────────
THANKS TO
➥ User  : <a href="tg://user?id=${userId}">${escapeHtml(userDisplayName)}</a>
➥ Role  : ${userRoleText}
──────────────────────
➥ Layanan : ${protocol.toUpperCase()}
<blockquote>➥ Server : ${escapeHtml(serverName)}</blockquote>
➥ Akun    : <code>${escapeHtml(accountUsername)}</code>
➥ Model   : <b>Pay As You Go</b>
➥ Biaya   : <b>Rp ${hourlyRate.toLocaleString('id-ID')} / Jam</b>
➥ Tanggal : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
──────────────────────
`;

    // Kirim pesan ke grup jika GROUP_ID sudah di-set
    if (GROUP_ID) {
        try {
            await callTelegramApiWithRetry(() => 
                bot.telegram.sendMessage(GROUP_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true })
            );
            console.log(`[PAYG_NOTIF] Notifikasi pembelian PAYG untuk ${accountUsername} berhasil dikirim ke grup.`);
        } catch (error) {
            console.error(`[PAYG_NOTIF] Gagal mengirim notifikasi pembelian PAYG ke grup:`, error.message);
        }
    }
}

async function sendGroupNotificationTopup(username, userId, amount, uniqueAmount, bonusAmount = 0) {
  const userOriginalTopup = amount;
  const totalSaldoMasuk = userOriginalTopup + bonusAmount;
  let bonusText = "";
  if (bonusAmount > 0) {
    bonusText = `\n➥ *Bonus Didapat:* Rp${bonusAmount.toLocaleString('id-ID')}`;
  }
  const groupMessage = `
──────────────────────
⟨ NOTIFIKASI TOPUP ⟩
──────────────────────
➥ *Username:* [${username}](tg://user?id=${userId})
➥ *User ID:* ${userId}
➥ *Jumlah Top-up:* Rp${userOriginalTopup.toLocaleString('id-ID')}${bonusText}
➥ *Total Saldo Bertambah:* Rp${totalSaldoMasuk.toLocaleString('id-ID')}
➥ *Kode Transaksi:* TRX-${Math.floor(100000 + Math.random() * 900000)}
➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}
──────────────────────
`;
// ... (sisa fungsi)
  try {
    await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi top-up berhasil dikirim ke grup`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi top-up ke grup:', error.message);
  }
}

// Fungsi untuk mencatat transaksi pengguna
async function recordUserTransaction(userId) {
  const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET last_transaction_date = ?, transaction_count = transaction_count + 1 WHERE user_id = ?',
      [currentDate, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });

  // 
}

async function checkAndDowngradeReseller(userId) {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT role, last_transaction_date, transaction_count FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (!user || user.role !== 'reseller') {
      return; // Hanya proses untuk reseller
    }

    const { last_transaction_date, transaction_count } = user;

    // Hitung selisih hari sejak transaksi terakhir
    const currentDate = new Date();
    const lastTransactionDate = new Date(last_transaction_date);
    const diffTime = currentDate - lastTransactionDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Selisih dalam hari

    // Jika lebih dari 30 hari dan transaksi kurang dari 5, downgrade ke member
    if (diffDays > 30 && transaction_count < 5) {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET role = ? WHERE user_id = ?', ['member', userId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      console.log(`✅ Role pengguna ${userId} diturunkan ke member.`);

      // Kirim notifikasi ke pengguna
      await bot.telegram.sendMessage(userId, 'ℹ️ Role Anda telah diturunkan menjadi member karena tidak memenuhi syarat transaksi.', { parse_mode: 'Markdown' });

      // Kirim notifikasi ke admin
      await bot.telegram.sendMessage(ADMIN, `ℹ️ Pengguna dengan ID ${userId} telah diturunkan ke member.`, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('🚫 Gagal memeriksa dan menurunkan role reseller:', error);
  }
}



async function getResellerList() {
  console.log('🔄 Mengambil data reseller terbaru dari database...');
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT user_id, username, saldo, accounts_created_30days 
       FROM users 
       WHERE role = 'reseller' 
       ORDER BY accounts_created_30days DESC`,
      [],
      (err, rows) => {
        if (err) {
          console.error('❌ Error query database:', err);
          reject(err);
        } else {
          console.log(`✅ Ditemukan ${rows.length} reseller`);
          const cleanedRows = rows.map(row => ({
            ...row,
            username: cleanUsername(row.username) || `ID:${row.user_id}`,
            user_id: row.user_id // Pastikan ID Telegram termasuk
          }));
          resolve(cleanedRows);
        }
      }
    );
  });
}

function cleanUsername(username) {
  if (!username) return null;
  // Hapus tag HTML jika ada
  return username.replace(/<[^>]*>/g, '').trim();
}


// Tambahkan di bagian inisialisasi
setInterval(async () => {
  console.log('♻️ Memeriksa update data reseller...');
  try {
    // Lakukan sesuatu jika perlu
  } catch (error) {
    console.error('Error dalam background check:', error);
  }
}, 300000); // Setiap 5 menit

async function getServerList(userId) {
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });

  const role = user ? user.role : 'member';
  const isAdmin = adminIds.includes(userId);

  const servers = await new Promise((resolve, reject) => {
    // Hanya admin yang bisa melihat server yang hidden
    const query = isAdmin ? 'SELECT * FROM Server' : 'SELECT * FROM Server WHERE hidden = 0';
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  // Sesuaikan harga berdasarkan role
  return servers.map(server => ({
    ...server,
    harga: role === 'reseller' ? server.harga_reseller : server.harga
  }));
}

bot.command('stats', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('🚫 Anda tidak memiliki izin.');
    }
    await sendAdminStats(ctx);
});

bot.command('resetslotserver', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('⚠️ Format salah. Gunakan: `/resetslotserver <server_id>`');
    }
    const serverIdToReset = parseInt(args[1]);
    if (isNaN(serverIdToReset)) {
        return ctx.reply('⚠️ Server ID harus berupa angka.');
    }

    await adminResetTotalCreatedAccounts(ctx, serverIdToReset);
});
bot.command('hideserver', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }

    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('⚠️ Format salah. Gunakan: `/hideserver <server_id>`', { parse_mode: 'Markdown' });
    }

    const serverId = parseInt(args[1], 10); // <-- PERBAIKAN: Konversi ke Angka

    // Validasi apakah input adalah angka yang valid
    if (isNaN(serverId)) {
        return ctx.reply('⚠️ Server ID harus berupa angka.', { parse_mode: 'Markdown' });
    }

  db.run("UPDATE Server SET hidden = 1 WHERE id = ?", [serverId], function(err) {
        if (err) {
            console.error('⚠️ Kesalahan saat menyembunyikan server:', err.message);
            return ctx.reply('⚠️ Kesalahan saat menyembunyikan server.', { parse_mode: 'Markdown' });
        }

        if (this.changes === 0) {
            return ctx.reply(`⚠️ Server dengan ID \`${serverId}\` tidak ditemukan.`, { parse_mode: 'Markdown' });
        }
    ctx.reply(`✅ Server dengan ID \`${serverId}\` berhasil disembunyikan.`, { parse_mode: 'Markdown' });

    // Notify all affected users (both PAYG sessions and fixed accounts) and pause PAYG sessions
    try {
      notifyUsersServerHidden(serverId).catch(e => console.error('notifyUsersServerHidden failed:', e));
    } catch (e) {
      console.error('Error while notifying users after hideserver:', e.message);
    }
    });
});

/**
 * Notify users who have accounts (fixed or PAYG) on a server that was hidden.
 * This function will also pause active PAYG sessions for the server.
 */
async function notifyUsersServerHidden(serverId) {
  try {
    const serverRow = await new Promise((resolve, reject) => {
      db.get('SELECT id, nama_server FROM Server WHERE id = ?', [serverId], (err, row) => err ? reject(err) : resolve(row));
    });
    const serverName = (serverRow && serverRow.nama_server) ? serverRow.nama_server : `Server ${serverId}`;

    // Fetch active PAYG sessions on this server
    const paygRows = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id, account_username, protocol FROM payg_sessions WHERE server_id = ? AND is_active = 1', [serverId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    // Pause payg sessions if any
    if (paygRows && paygRows.length > 0) {
      const ids = paygRows.map(r => r.id);
      await new Promise((resolve, reject) => {
        db.run(`UPDATE payg_sessions SET is_paused = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids, (err) => err ? reject(err) : resolve());
      });
    }

    // Fetch fixed accounts on this server
    const fixedRows = await new Promise((resolve, reject) => {
      db.all('SELECT id, created_by_user_id as user_id, account_username, protocol FROM created_accounts WHERE server_id = ? AND is_active = 1', [serverId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    // Aggregate by user_id
    const userMap = new Map();
    for (const r of paygRows) {
      if (!userMap.has(r.user_id)) userMap.set(r.user_id, []);
      userMap.get(r.user_id).push({ type: 'PAYG', id: r.id, username: r.account_username, protocol: r.protocol });
    }
    for (const r of fixedRows) {
      if (!userMap.has(r.user_id)) userMap.set(r.user_id, []);
      userMap.get(r.user_id).push({ type: 'Langganan', id: r.id, username: r.account_username, protocol: r.protocol });
    }

    // Send message per user
    for (const [userId, accounts] of userMap.entries()) {
      try {
        let text = `⚠️ Pemberitahuan: Server *${escapeHtml(serverName)}* sedang ditutup sementara oleh admin.\n\n`;
        text += `Akun Anda yang terpengaruh pada server ini:\n`;
        for (const acc of accounts) {
          const proto = acc.protocol ? acc.protocol.toUpperCase() : '-';
          text += `• <code>${escapeHtml(acc.username)}</code> — ${proto} (${acc.type})\n`;
        }
        text += `\nCatatan:\n- Akun langganan tetap terlihat, tetapi beberapa tindakan (mis. penghapusan via web) mungkin dibatasi.\n- Sesi PAYG telah dijeda dan tidak akan menagih sampai server ditampilkan kembali.\n- Jika Anda butuh tindakan khusus, silakan hubungi support.`;

        await callTelegramApiWithRetry(() => bot.telegram.sendMessage(userId, text, { parse_mode: 'HTML', disable_web_page_preview: true }));
      } catch (e) {
        console.warn('Gagal mengirim notifikasi server-hidden ke user', userId, e.message);
      }
    }

  } catch (err) {
    console.error('notifyUsersServerHidden error:', err);
  }
}

/**
 * Notify owners when a hidden server is shown again.
 * Will inform both PAYG and fixed account owners that normal actions are restored.
 */
async function notifyUsersServerShown(serverId) {
  try {
    const serverRow = await new Promise((resolve, reject) => {
      db.get('SELECT id, nama_server FROM Server WHERE id = ?', [serverId], (err, row) => err ? reject(err) : resolve(row));
    });
    const serverName = (serverRow && serverRow.nama_server) ? serverRow.nama_server : `Server ${serverId}`;

    // Get active PAYG sessions (previously paused ones) and notify (if any)
    const paygRows = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id, account_username, protocol FROM payg_sessions WHERE server_id = ? AND is_active = 1', [serverId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    // Get active fixed accounts on this server
    const fixedRows = await new Promise((resolve, reject) => {
      db.all('SELECT id, created_by_user_id as user_id, account_username, protocol FROM created_accounts WHERE server_id = ? AND is_active = 1', [serverId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    // Aggregate per user
    const userMap = new Map();
    for (const r of paygRows) {
      if (!userMap.has(r.user_id)) userMap.set(r.user_id, []);
      userMap.get(r.user_id).push({ type: 'PAYG', username: r.account_username, protocol: r.protocol });
    }
    for (const r of fixedRows) {
      if (!userMap.has(r.user_id)) userMap.set(r.user_id, []);
      userMap.get(r.user_id).push({ type: 'Langganan', username: r.account_username, protocol: r.protocol });
    }

    for (const [userId, accounts] of userMap.entries()) {
      try {
        let text = `✅ Pemberitahuan: Server *${escapeHtml(serverName)}* sekarang sudah <b>ditampilkan kembali</b> oleh admin.\n\n`;
        text += `Akun Anda di server ini:\n`;
        for (const acc of accounts) {
          const proto = acc.protocol ? acc.protocol.toUpperCase() : '-';
          text += `• <code>${escapeHtml(acc.username)}</code> — ${proto} (${acc.type})\n`;
        }
        text += `\nCatatan:\n- Aksi seperti penghapusan via web/bot sekarang sudah dapat dilakukan kembali.\n- Jika Anda ingin menghapus akun, silakan gunakan menu 'Hapus Akun' di bot atau UI.`;

        await callTelegramApiWithRetry(() => bot.telegram.sendMessage(userId, text, { parse_mode: 'HTML', disable_web_page_preview: true }));
      } catch (e) {
        console.warn('Gagal mengirim notifikasi server-shown ke user', userId, e.message);
      }
    }

  } catch (err) {
    console.error('notifyUsersServerShown error:', err);
  }
}

bot.command('showserver', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }

    const args = ctx.message.text.split(' ');
    if (args.length !== 2) {
        return ctx.reply('⚠️ Format salah. Gunakan: `/showserver <server_id>`', { parse_mode: 'Markdown' });
    }

    const serverId = parseInt(args[1], 10); // <-- PERBAIKAN: Konversi ke Angka

    // Validasi apakah input adalah angka yang valid
    if (isNaN(serverId)) {
        return ctx.reply('⚠️ Server ID harus berupa angka.', { parse_mode: 'Markdown' });
    }

    db.run("UPDATE Server SET hidden = 0 WHERE id = ?", [serverId], function(err) {
        if (err) {
            console.error('⚠️ Kesalahan saat menampilkan server:', err.message);
            return ctx.reply('⚠️ Kesalahan saat menampilkan server.', { parse_mode: 'Markdown' });
        }

        if (this.changes === 0) {
            return ctx.reply(`⚠️ Server dengan ID \`${serverId}\` tidak ditemukan.`, { parse_mode: 'Markdown' });
        }

    ctx.reply(`✅ Server dengan ID \`${serverId}\` berhasil ditampilkan kembali.`, { parse_mode: 'Markdown' });

    // Resume payg sessions on this server (unpause) and reset last_billed_at to now to avoid immediate billing
    try {
      db.all('SELECT id, user_id, account_username FROM payg_sessions WHERE server_id = ? AND is_active = 1 AND is_paused = 1', [serverId], async (err, rows) => {
        if (err) return console.error('Error fetching payg sessions to resume:', err.message);
        if (rows && rows.length > 0) {
          const nowISO = new Date().toISOString();
          const ids = rows.map(r => r.id);
          db.run(`UPDATE payg_sessions SET is_paused = 0, last_billed_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [nowISO, ...ids], (err2) => {
            if (err2) return console.error('Error resuming payg sessions:', err2.message);
          });

          for (const s of rows) {
            try {
              await callTelegramApiWithRetry(() => bot.telegram.sendMessage(s.user_id, `✅ Layanan Pay-As-You-Go untuk akun <code>${escapeHtml(s.account_username)}</code> telah *dilanjutkan* karena server sekarang sudah ditampilkan kembali. Anda akan dikenai biaya mulai sekarang sesuai aturan.` , { parse_mode: 'HTML' }));
            } catch (e) {
              console.warn('Gagal mengirim notifikasi resume PAYG ke user', s.user_id, e.message);
            }
          }
        }
        // Setelah resume PAYG selesai (atau jika tidak ada), kirim notifikasi kepada pemilik akun fixed bahwa server sudah ditampilkan kembali
        try {
          await notifyUsersServerShown(serverId);
        } catch (e) {
          console.error('notifyUsersServerShown failed:', e.message || e);
        }
      });
    } catch (e) {
      console.error('Error while resuming payg sessions after showserver:', e.message);
    }
    });
});

bot.command('listreseller', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ *Akses Ditolak*', { parse_mode: 'Markdown' });
  }

  try {
    const resellers = await getResellerList();
    await showResellerList(ctx, resellers);
  } catch (error) {
    console.error('Error:', error);
    await ctx.reply('⚠️ *Gagal memuat data*', { parse_mode: 'Markdown' });
  }
});

bot.command('fixresetcycle', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('⚠️ Hanya admin yang bisa melakukan perbaikan siklus reset');
  }

  try {
    // Buat tanggal reset bulan ini (1 April 2025)
    const fakeResetDate = new Date();
    fakeResetDate.setDate(1); // Set ke tanggal 1
    fakeResetDate.setHours(0, 5, 0, 0); // Set jam 00:05

    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`, 
        ['last_reset_date', fakeResetDate.toISOString()], 
        function(err) {
          if (err) {
            console.error('❌ Gagal menyimpan reset date:', err);
            return reject(err);
          }
          console.log('✅ Reset cycle diperbaiki. Last reset:', fakeResetDate);
          resolve();
        });
    });

    // Hitung tanggal reset berikutnya
    const nextReset = new Date(fakeResetDate);
    nextReset.setMonth(nextReset.getMonth() + 1);

    await ctx.reply(
      `✅ Siklus reset diperbaiki!\n\n` +
      `♻️ Reset terakhir: ${fakeResetDate.toLocaleDateString('id-ID')}\n` +
      `🔄 Reset berikutnya: ${nextReset.toLocaleDateString('id-ID')}`
    );

  } catch (error) {
    console.error('❌ Error di fixresetcycle:', error);
    await ctx.reply(
      `❌ Gagal memperbaiki siklus:\n` +
      `Error: ${error.message}\n\n` +
      `Silakan coba lagi atau cek log server.`
    );
  }
});
bot.command('admin', async (ctx) => {
  console.log('Admin menu requested');
  
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

// Handler untuk menampilkan menu tutorial yang detail
bot.action('tutorial_menu_show', async (ctx) => {
    await ctx.answerCbQuery();

    const messageText = "Berikut adalah panduan lengkap penggunaan bot:";

    // --- KEYBOARD DIPERBARUI DENGAN TOMBOL BARU ---
    const detailedKeyboard = [
        [
            { text: 'TOPUP', url: 'https://t.me/internetgratisin/21' },
            { text: 'GENERATE BUG', url: 'https://t.me/internetgratisin/22' }
        ],
        [
            { text: 'ORDER (Langganan)', url: 'https://t.me/internetgratisin/23' },
            // ==> TOMBOL BARU DITAMBAHKAN DI SINI <==
            { text: 'ORDER (PAYG)', url: 'https://t.me/internetgratisin/139' }
        ],
        [
            { text: 'TRIAL', url: 'https://t.me/internetgratisin/24' },
            { text: 'RENEW', url: 'https://t.me/internetgratisin/132' }
        ],
        [
            { text: 'DELETE', url: 'https://t.me/internetgratisin/13' }
        ],
        [{ text: '🔙 Kembali', callback_data: 'tutorial_menu_hide' }]
    ];

    try {
        // Edit pesan yang ada untuk menampilkan keyboard baru
        await ctx.editMessageText(messageText, {
            reply_markup: {
                inline_keyboard: detailedKeyboard
            },
            disable_web_page_preview: true // Ditambahkan agar tidak menampilkan preview link
        });
    } catch (error) {
        console.error('Gagal menampilkan menu tutorial detail:', error);
    }
});

bot.action('tutorial_menu_hide', async (ctx) => {
    await ctx.answerCbQuery();
    await displayTutorialDashboard(ctx);
});

bot.action('force_join_check', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`User ${userId} menekan tombol 'Periksa Ulang Keanggotaan Saya'.`);

    try {
        // Jawab callback query agar tombol tidak loading terus
        await ctx.answerCbQuery('Sedang memeriksa ulang status keanggotaan Anda...');
    } catch (e) { /* abaikan jika gagal */ }

    // Hapus pesan "harap bergabung" yang lama (yang berisi tombol ini)
    // PENTING: ctx.deleteMessage() akan menghapus pesan tempat tombol ini berada.
    try {
        await ctx.deleteMessage(); 
        if (userMessages[userId] && userMessages[userId] === ctx.callbackQuery.message.message_id) {
            delete userMessages[userId];
        }
    } catch (e) {
        // console.warn(`Gagal menghapus pesan force_join_check: ${e.message}`);
    }
    
    const isMemberNow = await checkUserMembershipInAllGroups(ctx, userId);

    if (isMemberNow) {
        console.log(`User ${userId} terverifikasi sebagai anggota setelah pemeriksaan ulang.`);
        await displayTutorialDashboard(ctx); // Panggil fungsi yang menampilkan menu tutorial
    } else {
        console.log(`User ${userId} masih belum menjadi anggota setelah pemeriksaan ulang.`);
        let joinMessageText = `🛡️ <b>Akses Masih Terbatas</b> 🛡️\n\n` +
                              `Maaf, sepertinya Anda masih belum bergabung dengan semua grup yang diwajibkan.\n\n` +
                              `Pastikan Anda telah bergabung dengan:\n`;
        const joinKeyboard = [];
        REQUIRED_GROUPS_TO_JOIN.forEach(group => {
          joinMessageText += `  • <b>${group.name}</b>\n`;
          joinKeyboard.push([{ text: `Gabung Lagi ${group.name}`, url: group.link }]);
        });
        joinMessageText += "\nSilakan coba periksa ulang setelah bergabung.";
        joinKeyboard.push([{ text: '🔄Periksa Ulang Sekali Lagi', callback_data: 'force_join_check' }]);
        
        try {
            const sentJoinMessageAgain = await ctx.replyWithHTML(joinMessageText, {
                reply_markup: {
                    inline_keyboard: joinKeyboard
                },
                disable_web_page_preview: true
            });
            userMessages[userId] = sentJoinMessageAgain.message_id;
        } catch (error) {
            console.error("Error mengirim ulang pesan permintaan bergabung grup:", error);
        }
    }
});
bot.action('main_menu_refresh', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`User ${userId} menekan tombol MAIN MENU REFRESH.`);

    // Hapus pesan tutorial/panduan lama atau pesan "join grup"
    if (userMessages[userId]) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); delete userMessages[userId]; }
        catch(e) { /* console.warn("main_menu_refresh: Gagal hapus pesan lama dari userMessages"); */ }
    } else {
        // Jika tidak ada di userMessages, coba hapus pesan callback itu sendiri (tempat tombol refresh berada)
        try { await ctx.deleteMessage(); } catch(e) { /* console.warn("main_menu_refresh: Gagal hapus pesan callback"); */ }
    }
    
    const isMemberOfAllGroups = await checkUserMembershipInAllGroups(ctx, userId);

    if (!isMemberOfAllGroups) {
        console.log(`User ${userId} tidak lagi menjadi anggota saat refresh ke main menu.`);
        let joinMessageText = `🛡️ <b>Sesi Berakhir / Akses Dibatasi</b> 🛡️\n\n` +
                              `Untuk melanjutkan ke Main Menu, Anda harus menjadi anggota grup kami.\n\n` +
                              `Silakan bergabung atau periksa ulang keanggotaan Anda:`;
        const joinKeyboard = [];
        REQUIRED_GROUPS_TO_JOIN.forEach(group => {
            joinKeyboard.push([{ text: ` ${group.name}`, url: group.link }]);
        });
        joinKeyboard.push([{ text: 'Periksa Ulang & Lanjutkan ke Menu', callback_data: 'force_join_check_then_main_menu' }]); // Callback baru
        
        try {
            const sentJoinMessage = await ctx.replyWithHTML(joinMessageText, {
                reply_markup: { inline_keyboard: joinKeyboard },
                disable_web_page_preview: true
            });
            userMessages[userId] = sentJoinMessage.message_id;
        } catch (error) { console.error("Error kirim pesan join dari main_menu_refresh:", error); }
        return;
    }

    // Jika anggota, lanjutkan ke sendMainMenu
    console.log(`User ${userId} adalah anggota, menampilkan Main Menu.`);
    try {
        await sendMainMenu(ctx); // sendMainMenu akan menampilkan menu utama
    } catch (menuError) {
        console.error('Gagal menampilkan menu utama dari main_menu_refresh:', menuError);
        await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba /menu lagi.', { parse_mode: 'Markdown' });
    }
});

// Tambahkan handler baru untuk callback 'force_join_check_then_main_menu'
bot.action('force_join_check_then_main_menu', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`User ${userId} menekan 'Periksa Ulang & Lanjutkan ke Menu'.`);
    try {
        await ctx.answerCbQuery('Memeriksa status keanggotaan...');
    } catch(e){}

    try { await ctx.deleteMessage(); } catch(e){} // Hapus pesan "Sesi Berakhir..."

    const isMemberNow = await checkUserMembershipInAllGroups(ctx, userId);
    if (isMemberNow) {
        console.log(`User ${userId} terverifikasi, melanjutkan ke Main Menu.`);
        await sendMainMenu(ctx); // Langsung ke Main Menu
    } else {
        console.log(`User ${userId} masih belum anggota, kembali ke pesan /start.`);
        // Panggil ulang logika /start untuk menampilkan pesan join group yang standar
        // Atau bisa langsung kirim pesan join group lagi
        const cmdStartHandler = bot.listeners('message').find(listener => {
             // Ini cara kasar untuk menemukan handler /start, mungkin perlu disesuaikan
             // atau lebih baik panggil fungsi yang mengirim pesan join grup secara langsung.
            if (listener.name === "execute" && listener.command === "start") return true; // Jika menggunakan commandParts
            return false; // Default
        });
        // Untuk amannya, kita panggil ulang /start seolah-olah diketik user
        // Ini akan memicu seluruh alur /start lagi termasuk pengecekan dan pesan yang sesuai
        ctx.message = { ...ctx.message, text: '/start' }; // Simulasikan pesan /start
                                                          // Ini mungkin tidak selalu berhasil tergantung bagaimana Telegraf menangani update internal.
                                                          // Cara paling aman adalah mereplikasi pesan "join group" di sini.

        // Replikasi pesan "join group" (lebih aman)
        let joinMessageText = `🛡️ <b>Akses Bot Terbatas</b> 🛡️\n\n` +
                              `Anda masih harus bergabung dengan grup komunitas kami untuk melanjutkan.\n\n` +
                              `👇 Silakan klik tombol di bawah untuk bergabung:`;
        const joinKeyboard = [];
        REQUIRED_GROUPS_TO_JOIN.forEach(group => {
          joinKeyboard.push([{ text: `Gabung ${group.name}`, url: group.link }]);
        });
        joinKeyboard.push([{ text: 'Periksa Ulang Keanggotaan Saya', callback_data: 'force_join_check' }]);
        const sentMsg = await ctx.replyWithHTML(joinMessageText, { reply_markup: { inline_keyboard: joinKeyboard }, disable_web_page_preview: true });
        userMessages[userId] = sentMsg.message_id;
    }
});


bot.action('refresh_menu', async (ctx) => {
  try {
    // Hapus pesan menu saat ini
    await ctx.deleteMessage();
    console.log('Menu dihapus dan akan ditampilkan ulang.');

    // Tampilkan ulang menu utama
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Gagal menghapus pesan atau menampilkan ulang menu:', error);
    await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.', { parse_mode: 'Markdown' });
  }
});

async function getAccountCreationRanking() {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT username, accounts_created_30days FROM users WHERE accounts_created_30days > 0 ORDER BY accounts_created_30days DESC LIMIT 3',
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}
// ASUMSI: Fungsi escapeHtml dan cleanUsername sudah terdefinisi di kode Anda
// function escapeHtml(text) { /* ... implementasi Anda ... */ }
// function cleanUsername(username) { /* ... implementasi Anda ... */ }
// ASUMSI: Variabel adminIds, db, userMessages, bot, getAccountCreationRanking, NAMA_STORE, dll., sudah terdefinisi

async function sendMainMenu(ctx) {
  try {
    const userId = ctx.from.id;
    const isAdmin = adminIds.includes(userId);

    // Ambil data yang dibutuhkan
    const [
      serverCount, userCount, userData, accountStats, trialData
    ] = await Promise.all([
      new Promise((resolve, reject) => db.get('SELECT COUNT(*) AS count FROM Server WHERE hidden = 0', (err, row) => err ? reject(err) : resolve(row ? row.count : 0))),
      new Promise((resolve, reject) => db.get('SELECT COUNT(*) AS count FROM users', (err, row) => err ? reject(err) : resolve(row ? row.count : 0))),
      new Promise((resolve, reject) => db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => err ? reject(err) : resolve(row || { saldo: 0, role: 'member' }))),
      new Promise((resolve, reject) => db.get('SELECT SUM(accounts_created_30days) as total_30days, SUM(total_accounts_created) as total_global FROM users', (err, row) => err ? reject(err) : resolve(row || { total_30days: 0, total_global: 0 }))),
      new Promise((resolve, reject) => db.get('SELECT trial_count, last_trial_date FROM users WHERE user_id = ?', [userId], (err, row) => err ? reject(err) : resolve(row || { trial_count: 0, last_trial_date: null })))
    ]);

    // ==> PERUBAHAN DIMULAI DI SINI: Ambil data akun aktif pengguna <==
    const activeCounts = { ssh: 0, vmess: 0, vless: 0, trojan: 0, hysteria: 0 };
    const fixed = await new Promise((res,rej)=>db.all("SELECT lower(protocol) as protocol, COUNT(*) as count FROM created_accounts WHERE created_by_user_id = ? AND is_active = 1 AND expiry_date > datetime('now','localtime') GROUP BY protocol", [userId], (e,r)=>e?rej(e):res(r||[])));
    const payg = await new Promise((res,rej)=>db.all("SELECT lower(protocol) as protocol, COUNT(*) as count FROM payg_sessions WHERE user_id = ? AND is_active = 1 GROUP BY protocol", [userId], (e,r)=>e?rej(e):res(r||[])));
    
    fixed.forEach(p => { if (activeCounts.hasOwnProperty(p.protocol)) activeCounts[p.protocol] += p.count; });
    payg.forEach(p => { if (activeCounts.hasOwnProperty(p.protocol)) activeCounts[p.protocol] += p.count; });
    
    const activeAccountsText = `
<blockquote><b>💡 AKUN AKTIF ANDA</b></blockquote><code> SSH   : ${activeCounts.ssh} Akun
 VMESS : ${activeCounts.vmess} Akun
 VLESS : ${activeCounts.vless} Akun
 TROJAN: ${activeCounts.trojan} Akun
 HYSTERIA: ${activeCounts.hysteria} Akun</code>`;
    // ==> AKHIR BLOK DATA AKUN AKTIF <==

    const rawUsername = ctx.from.username || ctx.from.first_name || `User${userId}`;
    const usernameLink = `<a href="tg://user?id=${userId}">${escapeHtml(rawUsername)}</a>`;
    const formattedSaldo = userData.saldo.toLocaleString('id-ID');
    const today = new Date().toISOString().split('T')[0];
    const isReseller = userData.role === 'reseller';
    const dailyLimit = isReseller ? 20 : 5;
    let usedTrials = 0;
    if (trialData.last_trial_date === today) {
      usedTrials = trialData.trial_count;
    }

    const keyboard = [
        [{ text: '🛰️ PANEL SERVER', callback_data: 'panel_server_start' }, { text: '💰 TOPUP SALDO', callback_data: 'topup_saldo' }],
        [{ text: '🗂️ KELOLA AKUN', callback_data: 'my_accounts_list' }],
        [{ text: 'REFRESH', callback_data: 'refresh_menu' }]
    ];
    if (isAdmin) {
      keyboard.push([{ text: '⚙️ ADMIN', callback_data: 'admin_menu' }, { text: '💹 CEK SALDO', callback_data: 'cek_saldo_semua' }]);
    }

    // ==> MODIFIKASI Tampilan Pesan Utama <==
    const messageText = `
<code><b>═══════════════════════════════</b></code>
                ≡ <b>🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​</b> ≡
<code><b>═══════════════════════════════</b></code>
  <code><b>Server Tersedia:</b></code> ${serverCount}
  <code><b>Total Pengguna:</b></code> ${userCount}
  <code><b>Akun (30 Hari):</b></code> ${accountStats.total_30days || 0}
  <code><b>Akun Global:</b></code> ${accountStats.total_global || 0}
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<blockquote><b> TRIAL ${dailyLimit}X DALAM SEHARI</b></blockquote><b><code>MxTrial:</code></b> <b><code>${usedTrials}/${dailyLimit}</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
  <code><b>Selamat Datang</b></code> <i>${usernameLink}</i>
  <code><b>ID Anda:</b></code> <code>${userId}</code>
  <code><b>Status:</b></code> <code><b>${userData.role === 'reseller' ? 'Reseller 🛒' : 'Member 👤'}</b></code>
<blockquote><code><b>SALDO ANDA:</b></code> Rp <code>${formattedSaldo}</code></blockquote>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>${activeAccountsText}
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<code><b>CHAT OWNER:</b></code> <a href="tg://user?id=7251232303">RyyStore</a>
☏ <a href="https://wa.me/6287767287284">WhatsApp</a>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
Silakan pilih opsi layanan:`;

    // ... (Sisa dari fungsi ini untuk mengirim/mengedit pesan tetap sama persis) ...
    let sentMessageInfo;
    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true
    };
    if (ctx.callbackQuery) { 
        try {
            sentMessageInfo = await callTelegramApiWithRetry(() => ctx.editMessageText(messageText, messageOptions));
        } catch (e) {
            console.warn(`[sendMainMenu] Gagal editMessageText untuk user ${userId} (mungkin pesan sama atau tidak ada): ${e.message}. Mencoba kirim baru.`);
            if (userMessages[userId]) { 
                try { 
                    await callTelegramApiWithRetry(() => ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId])); 
                    delete userMessages[userId];
                } catch (delErr) {
                    console.warn(`[sendMainMenu] Gagal menghapus pesan lama (userMessages[${userId}]) untuk user ${userId} setelah edit gagal: ${delErr.message}`);
                }
            }
            sentMessageInfo = await callTelegramApiWithRetry(() => ctx.reply(messageText, messageOptions));
        }
    } else { 
        if (userMessages[userId]) {
            try { 
                await callTelegramApiWithRetry(() => ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId])); 
                delete userMessages[userId];
            } catch (error) {
                console.warn(`[sendMainMenu] Gagal menghapus pesan lama (userMessages[${userId}]) untuk user ${userId} dari command: ${error.message}`);
            }
        }
        sentMessageInfo = await callTelegramApiWithRetry(() => ctx.reply(messageText, messageOptions));
    }
    
    if (sentMessageInfo) {
        if (sentMessageInfo.message_id) {
             userMessages[userId] = sentMessageInfo.message_id;
        } else if (typeof sentMessageInfo === 'object' && sentMessageInfo.result && sentMessageInfo.result.message_id) {
            userMessages[userId] = sentMessageInfo.result.message_id;
        } else if (ctx.callbackQuery && sentMessageInfo === true) {
            userMessages[userId] = ctx.callbackQuery.message.message_id;
        }
    }

  } catch (error) {
    console.error('Error di sendMainMenu:', error.stack);
    try {
        await callTelegramApiWithRetry(() => ctx.reply('Terjadi kesalahan. Coba /menu lagi.', {
        reply_markup: {
            inline_keyboard: [
            [{ text: '🛰️ PANEL SERVER', callback_data: 'panel_server_start' }],
            [{ text: 'REFRESH', callback_data: 'refresh_menu' }]
            ]
        }
        }));
    } catch (e_fallback) {
        console.error("[sendMainMenu] Gagal mengirim fallback menu setelah retry:", e_fallback.message);
    }
  }
}


// ASUMSI: Fungsi escapeHtml dan cleanUsername sudah terdefinisi di kode Anda
// function escapeHtml(text) { /* ... implementasi Anda ... */ }
// function cleanUsername(username) { /* ... implementasi Anda ... */ }
// ASUMSI: Variabel adminIds, db, userMessages, bot, NAMA_STORE, dll., sudah terdefinisi

async function sendMainMenuToUser(targetUserId) {
  try {
    const isAdmin = adminIds.includes(targetUserId); // Asumsikan adminIds adalah array

    // Bagian pengambilan data dari database tetap sama,
    // error dari sini akan ditangkap oleh catch utama.
    const [
      serverCount,
      userCount,
      userData,
      accountStats,
      ranking,
      trialData
    ] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS count FROM Server WHERE hidden = 0', (err, row) => {
          if (err) reject(new Error(`DB Error (serverCount): ${err.message}`)); // Tambahkan pesan error yg jelas
          else resolve(row ? row.count : 0);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
          if (err) reject(new Error(`DB Error (userCount): ${err.message}`));
          else resolve(row ? row.count : 0);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT saldo, role FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
          if (err) reject(new Error(`DB Error (userData for ${targetUserId}): ${err.message}`));
          else resolve(row || { saldo: 0, role: 'member' }); // Default jika user baru
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT SUM(accounts_created_30days) as total_30days, SUM(total_accounts_created) as total_global FROM users', (err, row) => {
          if (err) reject(new Error(`DB Error (accountStats): ${err.message}`));
          else resolve(row || { total_30days: 0, total_global: 0 });
        });
      }),
      getAccountCreationRanking(), // Asumsikan fungsi ini ada dan menangani error DB-nya sendiri
      new Promise((resolve, reject) => {
        db.get('SELECT trial_count, last_trial_date FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
          if (err) reject(new Error(`DB Error (trialData for ${targetUserId}): ${err.message}`));
          else resolve(row || { trial_count: 0, last_trial_date: null });
        });
      })
    ]);

    let rawUsername = `User${targetUserId}`; // Fallback
    try {
        // Menggunakan callTelegramApiWithRetry untuk getChat
        const chatInfo = await callTelegramApiWithRetry(() => bot.telegram.getChat(targetUserId));
        rawUsername = chatInfo.username || chatInfo.first_name || `User${targetUserId}`;
    } catch (e) {
        // Jika getChat gagal setelah retry, gunakan fallback dan log errornya
        console.warn(`[sendMainMenuToUser] Tidak dapat mengambil info chat untuk ${targetUserId} setelah retry: ${e.message}. Menggunakan fallback.`);
    }
    
    // Pastikan Anda punya fungsi escapeHtml untuk keamanan
    const usernameLink = `<a href="tg://user?id=${targetUserId}">${escapeHtml(rawUsername)}</a>`;
    const formattedSaldo = userData.saldo.toLocaleString('id-ID'); // Gunakan toLocaleString agar lebih rapi

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isReseller = userData.role === 'reseller';
    const dailyLimit = isReseller ? 20 : 5; // Sesuai kode asli Anda
    
    let usedTrials = 0;
    if (trialData.last_trial_date === today) {
      usedTrials = trialData.trial_count;
    }

    let rankingText = '⚠️ Tidak ada data ranking.';
    if (ranking && ranking.length > 0) {
      rankingText = ranking.map((user, index) => {
        const cleanedUser = cleanUsername(user.username) || `ID:${user.user_id}`; // Asumsikan cleanUsername ada
        const medals = ["🥇", "🥈", "🥉"]; // Medali untuk top 3
        return `${medals[index] || '➥'} ${escapeHtml(cleanedUser)}: ${user.accounts_created_30days} akun`;
      }).join('\n');
    }

    // Keyboard tetap sama seperti kode asli Anda
const keyboard = [
    [
        { text: '🛰️ PANEL SERVER', callback_data: 'panel_server_start' },
        { text: '💰 TOPUP SALDO', callback_data: 'topup_saldo' }
    ],
    [
       { text: '🗂️ HAPUS AKUN (REFUND SALDO)', callback_data: 'my_accounts' }
    ],
    [ 
       
        { text: 'REFRESH', callback_data: 'refresh_menu' }
    ]
];

    if (isAdmin) {
      keyboard.push([ 
        { text: '⚙️ ADMIN', callback_data: 'admin_menu' },
        { text: '💹 CEK SALDO', callback_data: 'cek_saldo_semua' }
      ]);
    }

    // messageText tetap sama seperti kode asli Anda
    const messageText = `
<code><b>═══════════════════════════════</b></code>
           ≡ <b>🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​</b> ≡
<code><b>═══════════════════════════════</b></code>
  <code><b>Server Tersedia:</b></code> ${serverCount}
  <code><b>Total Pengguna:</b></code> ${userCount}
  <code><b>Akun (30 Hari):</b></code> ${accountStats.total_30days}
  <code><b>Akun Global:</b></code> ${accountStats.total_global}
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<blockquote><b> TRIAL ${dailyLimit}X DALAM SEHARI</b></blockquote><b><code>MxTrial:</code></b> <b><code>${usedTrials}/${dailyLimit}</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
  <code><b>Selamat Datang</b></code> <i>${usernameLink}</i>
  <code><b>ID Anda:</b></code> <code>${targetUserId}</code>
  <code><b>Status:</b></code> <code><b>${userData.role === 'reseller' ? 'Reseller 🛒' : 'Member 👤'}</b></code>
<blockquote><code><b>SALDO ANDA:</b></code> Rp <code>${formattedSaldo}</code></blockquote>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<blockquote><code>🏆</code> <code><b>TOP 3 CREATE AKUN (30 HARI)</b></code></blockquote><code>${rankingText}</code>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<code><b>CHAT OWNER:</b></code> <a href="tg://user?id=7251232303">RyyStore</a>
☏ <a href="https://wa.me/6287767287284">WhatsApp</a>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
Silakan pilih opsi layanan:`;

    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true
    };

    // Hapus pesan lama (jika ada) dengan retry
    if (userMessages[targetUserId]) { // userMessages adalah objek untuk menyimpan ID pesan terakhir per user
        try { 
            // Menggunakan callTelegramApiWithRetry untuk deleteMessage
            await callTelegramApiWithRetry(() => bot.telegram.deleteMessage(targetUserId, userMessages[targetUserId]));
            delete userMessages[targetUserId]; 
        } catch (error) {
            // Jika gagal menghapus setelah retry, log saja, jangan hentikan proses
            console.warn(`[sendMainMenuToUser] Gagal menghapus pesan menu lama untuk ${targetUserId} setelah retry: ${error.message}`);
        }
    }
    
    // Kirim pesan baru dengan retry
    const sentMessageInfo = await callTelegramApiWithRetry(() => bot.telegram.sendMessage(targetUserId, messageText, messageOptions));
    
    if (sentMessageInfo) {
        userMessages[targetUserId] = sentMessageInfo.message_id;
    }
    console.log(`[sendMainMenuToUser] Menu utama dikirim ke ${targetUserId}`);

  } catch (error) { 
    // Catch ini akan menangkap error dari operasi DB atau error Telegram API yang tidak bisa di-retry lagi
    console.error(`Error di sendMainMenuToUser untuk ${targetUserId}:`, error.stack);
    try {
      // Mengirim pesan fallback jika terjadi error, juga dengan retry
      await callTelegramApiWithRetry(() => bot.telegram.sendMessage(targetUserId, 'Terjadi kesalahan saat menampilkan menu. Coba ketik /menu.', {
        reply_markup: { // Sediakan keyboard fallback minimal
          inline_keyboard: [
            [{ text: '🛰️ PANEL SERVER', callback_data: 'panel_server_start' }],
            [{ text: 'REFRESH', callback_data: 'refresh_menu' }]
          ]
        }
      }));
    } catch (e_fallback) {
      // Jika pengiriman pesan fallback juga gagal setelah retry
      console.error(`[sendMainMenuToUser] Gagal mengirim pesan fallback ke ${targetUserId} setelah retry:`, e_fallback.message);
    }
  }
}

// GANTI PERINTAH LAMA DENGAN INI
bot.command('forceresetnow', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
        return ctx.reply('⚠️ Hanya admin yang bisa melakukan reset manual');
    }
    try {
        await ctx.reply("⏳ Memulai proses reset statistik manual, mohon tunggu...");
        // Panggil fungsi yang benar dengan parameter forceRun = true
        await resetMonthlyStatsCounter(true); 
        await ctx.reply("✅ Reset statistik manual berhasil dilakukan.");

    } catch (error) {
        const errorMsg = `❌ Gagal total saat menjalankan reset statistik manual:\n${error.message}`;
        console.error(errorMsg, error.stack);
        await ctx.reply(errorMsg);
    }
});

bot.command('checkreset', async (ctx) => {
  const row = await new Promise(resolve => {
    db.get('SELECT * FROM system_settings WHERE key = ?', ['last_reset_date'], (err, row) => {
      resolve(row);
    });
  });

  if (row) {
    await ctx.reply(`♻️ Terakhir reset:\n${row.value}\n(${new Date(row.value).toLocaleString()})`);
  } else {
    await ctx.reply('ℹ️ Belum ada data reset tersimpan');
  }
});

bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const helpMessage = `
<b>📚 DAFTAR PERINTAH ADMIN</b>

<blockquote>┌─
────────────────────────────┐
│ <b>MANAJEMEN SERVER</b>              
├─────────────────────────────
│ <code>/addserver</code> - Tambah server baru        
│ <code>/listserver</code> - Lihat daftar server     
│ <code>/detailserver</code> - Detail server          
│ <code>/hapusserver</code> - Hapus server           
│ <code>/editharga</code> - Edit harga server        
│ <code>/editnama</code> - Edit nama server         
│ <code>/editdomain</code> - Edit domain server       
│ <code>/editauth</code> - Edit auth server         
│ <code>/editquota</code> - Edit quota server        
│ <code>/editiplimit</code> - Edit limit IP           
│ <code>/editlimitcreate</code> - Limit jumlah layanan  
│ <code>/hideserver</code> - Sembunyikan server
│ <code>/showserver</code> - Tampilkan server    
│ <code>/resetslotserver</code> - Reset slot server   
├─────────────────────────────
│ <b>MANAJEMEN PENGGUNA & RESELLER</b>   
├─────────────────────────────
│ <code>/listreseller</code> - Lihat daftar reseller
│ <code>/listusers</code> - Lihat daftar semua user
│ <code>/addsaldo</code> - Tambah saldo user        
│ <code>/hapussaldo</code> - Kurangi saldo user      
│ <code>/changerole</code> - Ubah role user         
│ <code>/upgrade_reseller</code> - Upgrade user ke reseller
│ <code>/ceksaldo</code> - Cek saldo semua user (admin)
├─────────────────────────────
│ <b>BROADCAST & KONTAK</b>              
├─────────────────────────────
│ <code>/broadcast semua|reseller|member [pesan]</code>
│ <code>/broadcast punya_saldo [pesan]</code>
│ <code>/broadcast pernah_order [pesan]</code>
│ <code>/send [user_id] [pesan]</code> - Kirim pesan ke user
├─────────────────────────────
│ <b>PENGATURAN TOPUP & BONUS</b>       
├─────────────────────────────
│ <code>/setmingeneraltopup [jumlah]</code> - Min. topup umum
│ <code>/setminresellertopup [jumlah]</code> - Min. topup reseller
│ <code>/viewmintopups</code> - Lihat min. topup
│ <code>/setbonus [min] [tipe] [nilai] [hari]</code> - Atur bonus
│ <code>/viewbonus</code> - Lihat status bonus  
│ <code>/clearbonus</code> - Hapus/nonaktifkan bonus
├─────────────────────────────
│ <b>PENGATURAN BUG HOST</b>
├─────────────────────────────
│ <code>/addbug</code> - Tambah konfigurasi bug baru
│ <code>/listbugs</code> - Lihat & kelola daftar bug
├─────────────────────────────
│ <b>PENGATURAN SISTEM</b>             
├─────────────────────────────
│ <code>/forceresetnow</code> - Reset counter 30hr  
│ <code>/fixresetcycle</code> - Perbaiki siklus reset
│ <code>/checkreset</code> - Cek terakhir reset     
│ <code>/resetdb</code> - Reset database server     
├─────────────────────────────
│ <b>LAIN-LAIN</b>                       
├─────────────────────────────
│ <code>/helpadmin</code> - Tampilkan menu ini       
│ <code>/menu</code> - Kembali ke menu utama       
└─────────────────────────────</blockquote>

<b>📌 CONTOH PENGGUNAAN:</b>
<code>/addsaldo 12345678 50000</code>
<code>/changerole 12345678 reseller</code>
<code>/broadcast semua Pesan penting untuk semua pengguna</code>
<code>/broadcast punya_saldo Diskon khusus untuk Anda yang punya saldo!</code>
<code>/broadcast pernah_order Terima kasih sudah pernah order di toko kami!</code>
<code>/setmingeneraltopup 10000</code>
<code>/setminresellertopup 20000</code>
<code>/setbonus 50000 nominal 5000 7</code>
<code>/addbug</code> (akan memulai alur input)

Gunakan perintah di atas dengan format yang benar.
`;

// ... (sisa fungsi tetap sama) ...
  if (userMessages[userId] && !ctx.callbackQuery) {
      try {
          await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]);
      } catch (e) { /* abaikan */ }
  }
  if (ctx.message && ctx.message.message_id && !ctx.callbackQuery) {
    try { await ctx.deleteMessage(ctx.message.message_id); } catch(e) {}
  }

  let sentHelpMessage;
  const messageOptions = { 
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: []
    }
  };

  if (ctx.callbackQuery) {
    try {
        sentHelpMessage = await ctx.editMessageText(helpMessage, messageOptions);
    } catch (e) {
        sentHelpMessage = await ctx.reply(helpMessage, messageOptions);
    }
  } else {
    sentHelpMessage = await ctx.reply(helpMessage, messageOptions);
  }
  userMessages[userId] = sentHelpMessage.message_id;
});
// Hapus semua handler: my_accounts, myacc_server_..., myacc_proto_...
// 1. Handler utama untuk tombol "Kelola Akun"
bot.action('my_accounts_list', async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery("Memuat akun Anda...");

    try {
        // Ambil semua jenis akun dalam satu kali jalan untuk efisiensi
    const fixedAccounts = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 'fixed' as type, ca.id, ca.account_username, ca.protocol, ca.expiry_date, s.nama_server, s.hidden AS server_hidden
        FROM created_accounts ca JOIN Server s ON ca.server_id = s.id
        WHERE ca.created_by_user_id = ? AND ca.is_active = 1 AND ca.expiry_date > DATETIME('now', 'localtime')
      `, [userId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

    const paygAccounts = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 'payg' as type, ps.id, ps.account_username, ps.protocol, ps.hourly_rate, s.nama_server, s.hidden AS server_hidden
        FROM payg_sessions ps JOIN Server s ON ps.server_id = s.id
        WHERE ps.user_id = ? AND ps.is_active = 1
      `, [userId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

        const allAccounts = [...fixedAccounts, ...paygAccounts];

        if (allAccounts.length === 0) {
            return ctx.editMessageText("Anda tidak memiliki akun aktif saat ini.", {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu', callback_data: 'kembali' }]] }
            });
        }

        // =======================================================
        // ==> MODIFIKASI UTAMA: MEMBUAT LAYOUT KEYBOARD 2 KOLOM <==
        // =======================================================
        const keyboard = [];
        // Loop dengan increment 2 untuk memproses akun secara berpasangan
        for (let i = 0; i < allAccounts.length; i += 2) {
            const row = []; // Buat baris baru untuk setiap pasangan
            const acc1 = allAccounts[i];
            const acc2 = allAccounts[i + 1]; // Ambil akun kedua (jika ada)

            // --- Proses Akun Pertama dalam baris ---
            let btnText1 = '';
            let cbData1 = '';
            if (acc1.type === 'fixed') {
                const expiry = new Date(acc1.expiry_date);
                const dateStr = expiry.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                // Menggunakan emoji untuk menghemat tempat dan memberi petunjuk visual
                btnText1 = `🗓️ ${acc1.protocol.toUpperCase()} ${escapeHtml(acc1.account_username)}`;
                cbData1 = `manage_account_fixed_${acc1.id}`;
            } else { // type === 'payg'
                btnText1 = `⏱️ ${acc1.protocol.toUpperCase()} ${escapeHtml(acc1.account_username)}`;
                cbData1 = `manage_account_payg_${acc1.id}`;
            }
            row.push({ text: btnText1, callback_data: cbData1 });

            // --- Proses Akun Kedua dalam baris (jika ada) ---
            if (acc2) {
                let btnText2 = '';
                let cbData2 = '';
                if (acc2.type === 'fixed') {
                    const expiry = new Date(acc2.expiry_date);
                    const dateStr = expiry.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                    btnText2 = `🗓️ ${acc2.protocol.toUpperCase()} ${escapeHtml(acc2.account_username)}`;
                    cbData2 = `manage_account_fixed_${acc2.id}`;
                } else { // type === 'payg'
                    btnText2 = `⏱️ ${acc2.protocol.toUpperCase()} ${escapeHtml(acc2.account_username)}`;
                    cbData2 = `manage_account_payg_${acc2.id}`;
                }
                row.push({ text: btnText2, callback_data: cbData2 });
            }
            
            // Tambahkan baris yang sudah terisi (1 atau 2 tombol) ke keyboard utama
            keyboard.push(row);
        }
        // =======================================================
        // ==> AKHIR MODIFIKASI <==
        // =======================================================

        keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali' }]);

        const message = `🗂️ *Kelola Akun Anda*\n\n*🗓️ = Berlangganan | ⏱️ = Pay As You Go*\nSilakan pilih akun di bawah ini untuk melihat detail aksi.`;
        
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error("Error saat menampilkan daftar gabungan akun pengguna:", error);
        await ctx.editMessageText("⚠️ Terjadi kesalahan saat menampilkan daftar akun Anda.");
    }
});

// 2. Handler saat pengguna memilih akun BERLANGGANAN (fixed-term)
bot.action(/manage_account_fixed_(\d+)/, async (ctx) => {
    const accountId = parseInt(ctx.match[1], 10);
    const userId = ctx.from.id;
    await ctx.answerCbQuery();

    try {
    const acc = await new Promise((resolve, reject) => {
      const query = `
        SELECT ca.*, s.harga, s.harga_reseller, s.nama_server, s.hidden AS server_hidden 
        FROM created_accounts ca JOIN Server s ON ca.server_id = s.id
        WHERE ca.id = ? AND ca.created_by_user_id = ?`;
      db.get(query, [accountId, userId], (err, row) => err || !row ? reject(new Error("Akun tidak ditemukan.")) : resolve(row));
    });

        const user = await new Promise((resolve, reject) => {
            db.get("SELECT role FROM users WHERE user_id = ?", [userId], (err, row) => err || !row ? reject(new Error("User tidak ditemukan.")) : resolve(row));
        });

        const hargaPerHari = user.role === 'reseller' ? acc.harga_reseller : acc.harga;
        const totalHargaAwal = calculatePrice(hargaPerHari, acc.duration_days);
        const hariTerpakai = Math.ceil((new Date().getTime() - new Date(acc.creation_date).getTime()) / (1000 * 60 * 60 * 24)) || 1;
        const biayaTerpakai = hariTerpakai * hargaPerHari;
        let refundAmount = Math.floor((totalHargaAwal - biayaTerpakai) / 100) * 100;
        if (refundAmount < 0) refundAmount = 0;
        
    // Jika server disembunyikan, tampilkan pesan bahwa penghapusan via bot tidak diizinkan
    if (acc.server_hidden === 1) {
      const msg = `🚫 Penghapusan dibatasi: Server <b>${escapeHtml(acc.nama_server)}</b> sedang ditutup sementara oleh admin. Penghapusan akun via bot tidak diizinkan saat server ditutup.`;
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'my_accounts_list' }]] } });
      return;
    }

    const message = `
🗑️ *Hapus & Refund Akun*
──────────────────────
Anda akan menghapus akun:
🔹 Akun: <b>${escapeHtml(acc.account_username)}</b> (${acc.protocol.toUpperCase()})
🔹 Server: <b>${escapeHtml(acc.nama_server)}</b>
🔹 Model: Berlangganan
──────────────────────
<b>Perhitungan Refund:</b>
- Total Bayar: Rp ${totalHargaAwal.toLocaleString('id-ID')}
- Terpakai: ~${hariTerpakai} hari (Rp ${biayaTerpakai.toLocaleString('id-ID')})
- Sisa Saldo Kembali: <b>Rp ${refundAmount.toLocaleString('id-ID')}</b>
──────────────────────
Apakah Anda yakin? Tindakan ini tidak bisa dibatalkan.
    `;

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya, Hapus & Refund', callback_data: `delete_refund_confirm_${accountId}` }],
          [{ text: '❌ Batal', callback_data: 'my_accounts_list' }]
        ]
      }
    });
    } catch (e) {
        console.error("Error di manage_account_fixed:", e);
        await ctx.answerCbQuery(e.message, { show_alert: true });
    }
});

// 3. Handler saat pengguna memilih akun PAY-AS-YOU-GO
bot.action(/manage_account_payg_(\d+)/, async (ctx) => {
    const sessionId = parseInt(ctx.match[1], 10);
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    
    try {
        const session = await new Promise((resolve, reject) => {
            db.get(`
                SELECT ps.*, s.nama_server FROM payg_sessions ps JOIN Server s ON ps.server_id = s.id
                WHERE ps.id = ? AND ps.user_id = ?`, 
                [sessionId, userId], 
                (err, row) => err || !row ? reject(new Error("Sesi PAYG tidak ditemukan.")) : resolve(row)
            );
        });

        const message = `
⏹️ *Hentikan Layanan Pay As You Go*
──────────────────────
Anda akan menghentikan layanan untuk akun:
🔹 Akun: <b>${escapeHtml(session.account_username)}</b> (${session.protocol.toUpperCase()})
🔹 Server: <b>${escapeHtml(session.nama_server)}</b>
🔹 Model: Pay As You Go
──────────────────────
<b>INFORMASI:</b>
Layanan ini memotong saldo Anda sebesar <b>Rp ${session.hourly_rate.toLocaleString('id-ID')} setiap jam</b>.

Dengan menekan tombol "Hentikan", akun ini akan langsung <b>dihapus dari server</b> dan tidak akan ada lagi pemotongan saldo per jam.
──────────────────────
Apakah Anda yakin ingin melanjutkan?
        `;

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ya, Hentikan Layanan Ini', callback_data: `stop_payg_execute_${sessionId}` }],
                    [{ text: '❌ Batal', callback_data: 'my_accounts_list' }]
                ]
            }
        });
    } catch (e) {
        console.error("Error di manage_account_payg:", e);
        await ctx.answerCbQuery(e.message, { show_alert: true });
    }
});

// 4. Handler Eksekusi Hapus & Refund (sudah di-refactor menjadi stateless)
bot.action(/delete_refund_confirm_(\d+)/, async (ctx) => {
    const accountId = parseInt(ctx.match[1]);
    const userId = ctx.from.id; 
    
    await ctx.editMessageText("⏳ Menghapus akun di server dan memproses refund, mohon tunggu...");

    try {
        // Ambil semua data yang dibutuhkan dalam satu query
        const data = await new Promise((resolve, reject) => {
      const query = `
        SELECT ca.*, s.harga, s.harga_reseller, s.nama_server, s.hidden AS server_hidden, u.role
        FROM created_accounts ca 
        JOIN Server s ON ca.server_id = s.id
        JOIN users u ON ca.created_by_user_id = u.user_id
        WHERE ca.id = ? AND ca.created_by_user_id = ?`;
            db.get(query, [accountId, userId], (err, row) => err || !row ? reject(new Error("Akun tidak ditemukan atau bukan milik Anda.")) : resolve(row));
        });

        // Hitung ulang refund untuk keamanan
        const hargaPerHari = data.role === 'reseller' ? data.harga_reseller : data.harga;
        const totalHargaAwal = calculatePrice(hargaPerHari, data.duration_days);
        const hariTerpakai = Math.ceil((new Date().getTime() - new Date(data.creation_date).getTime()) / (1000 * 60 * 60 * 24)) || 1;
        const biayaTerpakai = hariTerpakai * hargaPerHari;
        let refundAmount = Math.floor((totalHargaAwal - biayaTerpakai) / 100) * 100;
        if (refundAmount < 0) refundAmount = 0;

    // Jika server sedang disembunyikan, larang penghapusan via bot juga
    if (data.server_hidden === 1) {
      await ctx.editMessageText(`🚫 Penghapusan dibatasi: Server <b>${escapeHtml(data.nama_server || ('ID ' + data.server_id))}</b> sedang ditutup sementara oleh admin. Penghapusan akun via bot tidak diizinkan saat server ditutup.`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'my_accounts_list' }]] } });
      return;
    }

    // Proses penghapusan
    await callDeleteAPI(data.protocol, data.account_username, data.server_id);
        
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION;");
                if (refundAmount > 0) {
                    db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [refundAmount, userId]);
                }
                db.run("UPDATE Server SET total_create_akun = total_create_akun - 1 WHERE id = ? AND total_create_akun > 0", [data.server_id]);
                db.run("DELETE FROM created_accounts WHERE id = ?", [accountId], async function(err) {
                    if (err) return; 
                    await adjustResellerQuotaOnDelete(data);
                });
                db.run("COMMIT;", (err) => err ? reject(err) : resolve());
            });
        });

        await ctx.editMessageText(`✅ Akun <b>${data.account_username}</b> berhasil dihapus.\nSaldo sebesar <b>Rp ${refundAmount.toLocaleString('id-ID')}</b> telah dikembalikan.`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu', callback_data: 'kembali' }]] }
        });

        await sendDeleteRefundNotification(userId, data, refundAmount);

    } catch (error) {
        console.error("Error saat eksekusi hapus & refund:", error);
        await ctx.editMessageText(`🚫 Gagal: ${error.message}`, {
             reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'my_accounts_list' }]] }
        });
    }
});

// 5. Handler Eksekusi Hentikan Layanan PAYG (sudah baik, hanya dipastikan lagi)
bot.action(/stop_payg_execute_(\d+)/, async (ctx) => {
    const sessionId = parseInt(ctx.match[1]);
    await ctx.editMessageText("⏳ Memproses penghentian layanan...");

    // Cek apakah server untuk sesi ini sedang disembunyikan
    try {
      const sessionInfo = await new Promise((resolve, reject) => {
        const q = `SELECT ps.*, s.hidden AS server_hidden, s.nama_server FROM payg_sessions ps JOIN Server s ON ps.server_id = s.id WHERE ps.id = ?`;
        db.get(q, [sessionId], (err, row) => err ? reject(err) : resolve(row));
      });

      if (!sessionInfo) {
        await ctx.reply('🚫 Sesi PAYG tidak ditemukan.');
        await sendMainMenu(ctx);
        return;
      }

      if (sessionInfo.server_hidden === 1) {
        // Beritahu pengguna bahwa penghentian via bot tidak diizinkan saat server disembunyikan
        await ctx.editMessageText(`🚫 Penghentian layanan dibatasi: Server <b>${escapeHtml(sessionInfo.nama_server || ('ID ' + sessionInfo.server_id))}</b> sedang ditutup sementara oleh admin. Penghentian layanan via bot tidak diizinkan saat server ditutup.`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'my_accounts_list' }]] } });
        return;
      }

    } catch (err) {
      console.error('Error checking session server_hidden in stop_payg_execute:', err);
      // If check fails, continue with stop to avoid leaving user stuck — but log the error
    }

    const success = await stopPaygSession(sessionId, 'Dihentikan oleh pengguna');
    
    // Hapus pesan "memproses..." sebelum kembali ke menu utama
    try { await ctx.deleteMessage(); } catch(e){}
    
    if (!success) {
        await ctx.reply("Gagal menghentikan layanan. Silakan hubungi admin.");
    }
    
    // Fungsi stopPaygSession sudah mengirim notifikasi, jadi kita langsung kembali ke menu utama
    await sendMainMenu(ctx);
});

bot.action('admin_examples', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(`
<b>📋 CONTOH PENGGUNAAN PERINTAH ADMIN</b>

<code>1. Menambahkan server baru:
/addserver domain123.com auth123 25000 12500 "SG Premium" 50 2 100

2. Menambah saldo reseller:
/addsaldo 12345678 50000

3. Mengubah role user:
/changerole 12345678 reseller

4. Broadcast pesan:
/broadcast Halo semua, server akan maintenance pukul 23.00 WIB

5. Reset counter 30 hari:
/forceresetnow</code>`, 
  { 
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Kembali', callback_data: 'back_to_help' }]
      ]
    }
  });
});

bot.action('back_to_help', async (ctx) => {
  await ctx.deleteMessage();
  await bot.command('helpadmin', ctx);
});

bot.action('refresh_help', async (ctx) => {
  await ctx.deleteMessage();
  await bot.command('helpadmin', ctx);
});

bot.command('changerole', async (ctx) => {
    const adminCallingId = ctx.from.id; // ID admin yang memanggil perintah
    if (!adminIds.includes(String(adminCallingId))) { // Pastikan adminIds adalah array of strings
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('🚫 Format: /changerole <user_id> <new_role (member/reseller)>', { parse_mode: 'Markdown' });
    }

    const targetUserId = args[1];
    const newRole = args[2].toLowerCase();

    if (!['member', 'reseller'].includes(newRole)) {
        return ctx.reply('🚫 Role tidak valid. Gunakan "member" atau "reseller".', { parse_mode: 'Markdown' });
    }

    const nowISO = new Date().toISOString();
    let query;
    let params;
    let notificationMessageToUser = '';

    if (newRole === 'reseller') {
        query = 'UPDATE users SET role = ?, became_reseller_on = ?, reseller_quota_last_checked_on = ? WHERE user_id = ?';
        params = [newRole, nowISO, nowISO, targetUserId];
        notificationMessageToUser = `🔄 Role Anda telah diubah menjadi reseller oleh admin. Periode pengecekan kuota akun (5 akun @30hr/30hr) dimulai.`;
    } else { 
        query = 'UPDATE users SET role = ?, became_reseller_on = NULL, reseller_quota_last_checked_on = NULL WHERE user_id = ?';
        params = [newRole, targetUserId];
        notificationMessageToUser = `🔄 Role Anda telah diubah menjadi member oleh admin.`;
    }

    try {
        const changes = await new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) {
                    console.error(`Error changing role for ${targetUserId} to ${newRole}:`, err.message);
                    reject(err);
                } else {
                    if (this.changes === 0) {
                         reject(new Error(`Pengguna dengan ID ${targetUserId} tidak ditemukan atau role tidak berubah.`));
                         return;
                    }
                    resolve(this.changes);
                }
            });
        });

        if (changes > 0) {
            await ctx.reply(`✅ Role pengguna dengan ID ${targetUserId} berhasil diubah menjadi ${newRole}.`);
            try {
                await bot.telegram.sendMessage(targetUserId, notificationMessageToUser);
            } catch (e) {
                console.warn(`Gagal mengirim notifikasi perubahan role ke user ${targetUserId}: ${e.message}`);
            }
            
            let usernameForNotif = `User ID: ${targetUserId}`;
            try {
                const targetUserInfo = await bot.telegram.getChat(targetUserId);
                usernameForNotif = targetUserInfo.username ? `@${targetUserInfo.username}` : (targetUserInfo.first_name || `User ID: ${targetUserId}`);
            } catch (e) {
                console.warn(`Gagal mendapatkan info chat untuk ${targetUserId} saat notif /changerole`);
            }
            
            const groupMessage = `🔄 *Notifikasi Perubahan Role (Admin)*\n\n` +
                                 `➥ *Pengguna:* [${usernameForNotif}](tg://user?id=${targetUserId})\n` +
                                 `➥ *User ID:* \`${targetUserId}\`\n` +
                                 `➥ *Role Baru:* ${newRole}\n` +
                                 `➥ *Diubah Oleh:* Admin (<a href="tg://user?id=${adminCallingId}">${ctx.from.username || adminCallingId}</a>)\n` +
                                 `➥ *Tanggal:* ${new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'})}\n` +
                                 `──────────────────────`;
            if (GROUP_ID) { // Pastikan GROUP_ID terdefinisi
                 try {
                    await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
                } catch (e) {
                    console.error(`Gagal mengirim notifikasi perubahan role ke grup untuk user ${targetUserId}: ${e.message}`);
                }
            }
        }
    } catch (error) {
        await ctx.reply(`🚫 Gagal mengubah role: ${error.message}`);
    }
});

// Command untuk admin melihat daftar pengguna
bot.command('listusers', async (ctx) => {
  const users = await new Promise((resolve, reject) => {
    db.all('SELECT user_id, username, role, saldo, last_transaction_date, transaction_count FROM users', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  if (users.length === 0) {
    return ctx.reply('⚠️ Tidak ada pengguna yang terdaftar.', { parse_mode: 'Markdown' });
  }

  let message = '📜 *Daftar Pengguna* 📜\n\n';
  users.forEach((user, index) => {
    message += `🔹 ${index + 1}. ID: ${user.user_id}\n` +
               `   👤 Username: ${user.username || 'Tidak ada'}\n` +
               `   🎖️ Role: ${user.role}\n` +
               `   💰 Saldo: Rp ${user.saldo}\n` +
               `   📅 Transaksi Terakhir: ${user.last_transaction_date || 'Belum ada'}\n` +
               `   🔢 Jumlah Transaksi: ${user.transaction_count}\n\n`;
  });

  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('ceksaldo', async (ctx) => {
  try {
    const adminId = ctx.from.id;
    if (adminId != ADMIN) {
      return await ctx.reply('🚫 *Anda tidak memiliki izin untuk melihat saldo semua pengguna.*', { parse_mode: 'Markdown' });
    }

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT user_id, saldo FROM users', [], (err, rows) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil data saldo semua user:', err.message);
          return reject('🚫 *Terjadi kesalahan saat mengambil data saldo semua pengguna.*');
        }
        resolve(rows);
      });
    });

    if (users.length === 0) {
      return await ctx.reply('⚠️ *Belum ada pengguna yang memiliki saldo.*', { parse_mode: 'Markdown' });
    }

    let message = '📊 *Saldo Semua Pengguna:*\n\n';
    users.forEach(user => {
      message += `🆔 ID: ${user.user_id} | 💳 Saldo: Rp${user.saldo}\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('🚫 Kesalahan saat mengambil saldo semua user:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.command('upgrade_reseller', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/upgrade_reseller <user_id>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);

  db.run('UPDATE users SET role = "reseller", last_topup_date = ? WHERE user_id = ?', [new Date().toISOString(), targetUserId], function(err) {
    if (err) {
      console.error('Kesalahan saat meng-upgrade user ke reseller:', err.message);
      return ctx.reply('⚠️ Kesalahan saat meng-upgrade user ke reseller.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ User dengan ID \`${targetUserId}\` berhasil di-upgrade ke reseller.`, { parse_mode: 'Markdown' });
  });
});

bot.command('broadcast', async (ctx) => {
    const adminUserId = ctx.message.from.id;
    console.log(`[BROADCAST DEBUG] Perintah diterima dari user ID: ${adminUserId}`);

    if (!adminIds.includes(adminUserId)) {
        console.log('[BROADCAST DEBUG] Akses ditolak: Bukan admin.');
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const repliedMessage = ctx.message.reply_to_message;
    const currentMessage = ctx.message;

    let commandTextSource = "";
    if (currentMessage.text) {
        commandTextSource = currentMessage.text;
    } else if (currentMessage.caption) {
        commandTextSource = currentMessage.caption;
    }
    console.log('[BROADCAST DEBUG] commandTextSource:', commandTextSource);

    const commandParts = commandTextSource.split(' ');
    const targetGroup = commandParts[1] ? commandParts[1].toLowerCase() : null;
    const textFollowingCommand = commandParts.slice(2).join(' '); 

    console.log('[BROADCAST DEBUG] Target Grup:', targetGroup); // Diubah ke Bahasa Indonesia
    console.log('[BROADCAST DEBUG] Teks Setelah Perintah:', textFollowingCommand); // Diubah ke Bahasa Indonesia
    if (repliedMessage) {
        console.log('[BROADCAST DEBUG] Ada pesan yang dibalas. Tipe:', repliedMessage.text ? 'text' : repliedMessage.photo ? 'photo' : repliedMessage.video ? 'video' : 'lainnya');
        if (repliedMessage.caption) console.log('[BROADCAST DEBUG] Caption Pesan Dibalas:', repliedMessage.caption);
    } else {
        console.log('[BROADCAST DEBUG] Tidak ada pesan yang dibalas.');
    }
    if (currentMessage.photo) console.log('[BROADCAST DEBUG] Pesan saat ini memiliki foto.');
    if (currentMessage.video) console.log('[BROADCAST DEBUG] Pesan saat ini memiliki video.');

     // PERBARUI VALIDASI TARGET GRUP DI SINI
    if (!targetGroup || !['semua', 'reseller', 'member', 'punya_saldo', 'pernah_order'].includes(targetGroup)) {
        console.log('[BROADCAST DEBUG] Target grup tidak valid:', targetGroup);
        return ctx.reply(
            '⚠️ Format perintah broadcast salah.\n' +
            'Gunakan:\n' +
            '`/broadcast semua [pesan/caption]`\n' +
            '`/broadcast reseller [pesan/caption]`\n' +
            '`/broadcast member [pesan/caption]`\n' +
            '`/broadcast punya_saldo [pesan/caption]` (Pengguna dengan saldo > 0)\n' +
            '`/broadcast pernah_order [pesan/caption]` (Pengguna pernah order)\n\n' +
            'Cara penggunaan:\n' +
            '1. Ketik perintah + teks (untuk teks saja).\n' +
            '2. Reply ke media/teks, lalu ketik perintah (+ caption baru jika perlu).\n' +
            '3. Kirim media DENGAN caption berisi perintah + caption untuk media.',
            { parse_mode: 'Markdown' }
        );
    }

    let messageToSend = null;    
    let fileIdToSend = null;     
    let captionForMedia = "";    
    let messageType = null;      

    // ... (logika untuk menentukan messageToSend, fileIdToSend, captionForMedia, messageType tetap sama) ...
    if (repliedMessage) { 
        captionForMedia = textFollowingCommand || repliedMessage.caption || ''; 
        if (repliedMessage.photo && repliedMessage.photo.length > 0) {
            messageType = 'photo';
            fileIdToSend = repliedMessage.photo[repliedMessage.photo.length - 1].file_id;
        } else if (repliedMessage.video) {
            messageType = 'video';
            fileIdToSend = repliedMessage.video.file_id;
        } else if (repliedMessage.text) {
            messageType = 'text';
            messageToSend = textFollowingCommand || repliedMessage.text; 
        } else { 
            if (textFollowingCommand) { 
                messageType = 'text';
                messageToSend = textFollowingCommand;
            } else {
                return ctx.reply('⚠️ Tipe pesan yang direply tidak didukung untuk broadcast dengan caption, atau tidak ada teks broadcast tambahan yang diberikan.');
            }
        }
    } else if (currentMessage.photo && currentMessage.photo.length > 0) { 
        messageType = 'photo';
        fileIdToSend = currentMessage.photo[currentMessage.photo.length - 1].file_id;
        captionForMedia = textFollowingCommand; 
    } else if (currentMessage.video) { 
        messageType = 'video';
        fileIdToSend = currentMessage.video.file_id;
        captionForMedia = textFollowingCommand; 
    } else { 
        if (textFollowingCommand) {
            messageType = 'text';
            messageToSend = textFollowingCommand;
        } else {
            return ctx.reply('⚠️ Tidak ada pesan untuk di-broadcast. Sertakan pesan setelah target (`semua`/`reseller`/`member`/`punya_saldo`/`pernah_order`).');
        }
    }
    
    if (!messageType) {
        return ctx.reply('⚠️ Konten broadcast tidak dapat ditentukan. Pastikan format perintah benar.');
    }
    if (messageType === 'text' && (messageToSend === null || messageToSend.trim() === '')) {
         return ctx.reply('⚠️ Tidak ada pesan teks yang valid untuk di-broadcast.');
    }
    if ((messageType === 'photo' || messageType === 'video') && !fileIdToSend) {
         return ctx.reply('⚠️ Gagal mendapatkan file ID dari media yang akan dikirim.');
    }
    
    console.log(`[BROADCAST DEBUG] Siap mengirim. Tipe: ${messageType}, Target: ${targetGroup}`);

    let successCount = 0;
    let failureCount = 0;
    let totalUsers = 0;
    const loadingMsg = await ctx.reply(`⏳ Mempersiapkan broadcast untuk target: ${targetGroup}...`);
    console.log(`[BROADCAST DEBUG] Pesan loading awal dikirim, ID: ${loadingMsg.message_id}`);

     // PERBARUI LOGIKA SQL QUERY DI SINI
    let sqlQuery = "SELECT user_id FROM users"; // Default untuk 'semua'
    if (targetGroup === 'reseller') {
        sqlQuery = "SELECT user_id FROM users WHERE role = 'reseller'";
    } else if (targetGroup === 'member') {
        sqlQuery = "SELECT user_id FROM users WHERE role = 'member'";
    } else if (targetGroup === 'punya_saldo') {
        sqlQuery = "SELECT user_id FROM users WHERE saldo > 0";
    } else if (targetGroup === 'pernah_order') {
        sqlQuery = "SELECT user_id FROM users WHERE total_accounts_created > 0";
    }
    console.log(`[BROADCAST DEBUG] SQL Query: ${sqlQuery}`);


    db.all(sqlQuery, [], async (err, rows) => {
        if (err) {
            console.error('[BROADCAST DEBUG] Kesalahan mengambil daftar pengguna dari DB:', err.message);
            try { await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '⚠️ Kesalahan mengambil daftar pengguna.'); } catch(e) {}
            return;
        }
        if (!rows || rows.length === 0) {
             console.log(`[BROADCAST DEBUG] Tidak ada pengguna ditemukan untuk target: ${targetGroup}`);
             try { await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `Tidak ada pengguna dalam grup '${targetGroup}'.`); } catch(e) {}
            return;
        }

        totalUsers = rows.length;
        console.log(`[BROADCAST DEBUG] Ditemukan ${totalUsers} pengguna untuk target ${targetGroup}. Memulai pengiriman...`);
        try { await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⏳ Mengirim broadcast ke <span class="math-inline">${totalUsers} pengguna (${targetGroup})... (0%)</span>`, { parse_mode: 'HTML' }); } catch(e) { console.warn("[BROADCAST DEBUG] Gagal update pesan loading awal:", e.message); }

        for (let i = 0; i < rows.length; i++) {
            const user = rows[i];
            const targetUserId = user.user_id;
            console.log(`[BROADCAST DEBUG] Mencoba mengirim ke user ID: ${targetUserId} (${i+1}/${totalUsers})`);

            try {
                switch (messageType) {
                    case 'text':
                        await bot.telegram.sendMessage(targetUserId, messageToSend, { parse_mode: 'HTML', disable_web_page_preview: true });
                        break;
                    case 'photo':
                        await bot.telegram.sendPhoto(targetUserId, fileIdToSend, { caption: captionForMedia, parse_mode: 'HTML' });
                        break;
                    case 'video':
                        await bot.telegram.sendVideo(targetUserId, fileIdToSend, { caption: captionForMedia, parse_mode: 'HTML' });
                        break;
                }
                successCount++;
                console.log(`[BROADCAST DEBUG] Berhasil mengirim ke ${targetUserId}`);
            } catch (e) {
                failureCount++;
                console.error(`[BROADCAST DEBUG] Gagal mengirim broadcast ke ${targetUserId}: ${e.message}`);
            }

            if ((i + 1) % 5 === 0 || (i + 1) === totalUsers) {
                const percentage = Math.round(((i + 1) / totalUsers) * 100);
                console.log(`[BROADCAST DEBUG] Update progress: ${percentage}%`);
                try {
                   await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⏳ Broadcast ke <span class="math-inline">${targetGroup} (${percentage}%)</span>...\nBerhasil: ${successCount}, Gagal: ${failureCount} dari ${totalUsers}`, { parse_mode: 'HTML' });
                } catch(editErr){ console.warn("[BROADCAST DEBUG] Gagal update progress broadcast:", editErr.message); }
            }
            if (i < rows.length -1) {
                 await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        console.log('[BROADCAST DEBUG] Pengiriman selesai.');
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `✅ Broadcast Selesai (${targetGroup}).\nTotal: ${totalUsers}, Berhasil: ${successCount}, Gagal: ${failureCount}`);
        } catch(e) {
             console.warn("[BROADCAST DEBUG] Gagal update pesan hasil akhir broadcast:", e.message);
             await ctx.reply(`✅ Broadcast Selesai (${targetGroup}).\nTotal: ${totalUsers}, Berhasil: ${successCount}, Gagal: ${failureCount}`);
        }
    });
});

bot.action('main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

bot.action('admin_menu', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

bot.action('cek_saldo_semua', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk melihat saldo semua pengguna.');
    return;
  }

  await handleCekSaldoSemua(ctx, userId);
});

bot.action('refresh_reseller', async (ctx) => {
  try {
    // Hapus pesan lama jika ada
    try {
      await ctx.deleteMessage();
    } catch (deleteError) {
      console.warn('Gagal menghapus pesan lama:', deleteError.message);
    }
    
    // Kirim pesan loading sementara
    const loadingMsg = await ctx.reply('🔄 Memuat data terbaru...');
    
    // Dapatkan data terbaru
    const resellers = await getResellerList();
    
    // Hapus pesan loading
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
    } catch (e) {
      console.warn('Gagal menghapus pesan loading:', e.message);
    }
    
    // Lanjutkan dengan menampilkan data baru
    await showResellerList(ctx, resellers);
    
  } catch (error) {
    console.error('Error saat refresh:', error);
    await ctx.answerCbQuery('⚠️ Gagal memuat data terbaru', { show_alert: true });
  }
});

async function showResellerList(ctx, resellers) {
  const now = new Date();
  
  if (resellers.length === 0) {
    return ctx.reply('📭 *Tidak Ada Reseller*', { parse_mode: 'Markdown' });
  }

  // Hitung statistik
  const totalSaldo = resellers.reduce((sum, r) => sum + r.saldo, 0);
  const totalAkun = resellers.reduce((sum, r) => sum + r.accounts_created_30days, 0);
  const avgSaldo = Math.round(totalSaldo / resellers.length);
  const topReseller = resellers[0];

  // Format pesan
  let message = '```\n';
  message += '╔════════════════════════════════════════════════╗\n';
  message += '║                📊 DAFTAR RESELLER              ║\n';
  message += '╠════╤══════════════╤══════════╤══════╤══════════╣\n';
  message += '║ No │ Username     │ ID Telg  │ Saldo│ Akun     ║\n';
  message += '╟────┼──────────────┼──────────┼──────┼──────────╢\n';

  resellers.forEach((reseller, index) => {
    const no = (index + 1).toString().padEnd(2);
    const username = (reseller.username || `ID:${reseller.user_id}`).slice(0,12).padEnd(12);
    const telegramId = reseller.user_id.toString().slice(-8).padEnd(8); // Ambil 8 digit terakhir
    const saldo = `Rp${reseller.saldo.toLocaleString('id-ID').padEnd(6)}`;
    const akun = reseller.accounts_created_30days.toString().padEnd(8);
    
    message += `║ ${no} │ ${username} │ ${telegramId} │ ${saldo} │ ${akun} ║\n`;
  });

  message += '╚════╧══════════════╧══════════╧══════╧══════════╝\n```\n';

  // Tambahkan statistik
  message += `*📈 STATISTIK RESELLER*\n` +
             '```\n' +
             `🛒 Total Reseller : ${resellers.length}\n` +
             `💰 Total Saldo    : Rp${totalSaldo.toLocaleString('id-ID')}\n` +
             `📦 Total Akun     : ${totalAkun} (30 hari)\n` +
             `📊 Rata-rata      : Rp${avgSaldo.toLocaleString('id-ID')}/reseller\n` +
             `🏆 Top Reseller   : ${topReseller.username || `ID:${topReseller.user_id}`} (${topReseller.accounts_created_30days} akun)\n` +
             '```\n' +
             `🕒 Update: ${now.toLocaleString('id-ID')}`;

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh', callback_data: 'refresh_reseller' }],
        [
          { text: '📤 Export Data', callback_data: 'export_reseller' },
          { text: '📞 Hubungi', callback_data: 'contact_reseller' }
        ],
        [{ text: '🔙 Menu Admin', callback_data: 'admin_menu' }]
      ]
    }
  });
}

async function sendMessageToUser(userId, message, ctx) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: message
        });
        ctx.reply(`✅ Pesan berhasil dikirim ke ${userId}`);
    } catch (error) {
        console.error(`⚠️ Gagal mengirim pesan ke ${userId}:`, error.message);
        ctx.reply(`⚠️ Gagal mengirim pesan ke ${userId}`);
    }
}

async function getUserRole(userId) {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    console.log(`Role pengguna ${userId}:`, user ? user.role : 'member'); // Log role pengguna

    // Jika role tidak ditemukan, default ke 'member'
    return user ? user.role : 'member';
  } catch (error) {
    console.error('🚫 Error saat mengambil role pengguna:', error);
    return 'member'; // Default ke 'member' jika terjadi error
  }
}

async function sendGroupNotificationPurchase(username, userId, serviceType, serverName, expDays) {
  // Ambil role pengguna dari database
  const userRole = await getUserRole(userId);

  // Ambil harga server dari database (sesuai role pengguna)
  const server = await new Promise((resolve, reject) => {
    db.get(
      'SELECT harga, harga_reseller FROM Server WHERE nama_server = ?',
      [serverName],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });

  // Tentukan harga berdasarkan role pengguna
  const hargaPerHari = userRole === 'reseller' ? server.harga_reseller : server.harga;
  
  // Hitung total harga
  const totalHarga = calculatePrice(hargaPerHari, expDays);
  
  // Format tampilan harga
  let hargaDisplay;
  if (expDays === 30) {
    hargaDisplay = `Rp${totalHarga.toLocaleString('id-ID')}`;
  } else {
    hargaDisplay = `Rp${totalHarga.toLocaleString('id-ID')} (${expDays} hari)`;
  }

  // Format tanggal saat ini
  const currentDate = new Date().toLocaleString('id-ID');

  const groupMessage = `
──────────────────────
⟨ TRX PAYVPN BOT ⟩
──────────────────────
THANKS TO
➥ User  : <a href="tg://user?id=${userId}">${username}</a>
➥ Role  : ${userRole === 'reseller' ? 'Reseller 🛒' : 'Member 👤'}
──────────────────────
➥ Layanan : ${serviceType}
<blockquote>➥ Server : ${serverName}</blockquote>
➥ Harga per Hari : Rp${hargaPerHari.toLocaleString('id-ID')}
➥ Masa Aktif : ${expDays} Hari
➥ Total Harga : ${hargaDisplay}
➥ Tanggal : ${currentDate}
──────────────────────
Notifikasi Pembelian detail di bawah.
  `;

  try {
    await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'HTML' });
    console.log(`✅ Notifikasi pembelian berhasil dikirim ke grup untuk user ${username}`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi pembelian ke grup:', error.message);
  }
}


bot.command('addsaldo', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetUserId) || isNaN(amount)) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (amount < 0) { // Saldo yang ditambahkan tidak boleh negatif
    return ctx.reply('⚠️ Jumlah saldo tidak boleh negatif.', { parse_mode: 'Markdown' });
  }

  try {
    // Cek apakah user ada
    const userExists = await new Promise((resolve, reject) => {
        db.get("SELECT id FROM users WHERE user_id = ?", [targetUserId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (!userExists) {
        return ctx.reply(`⚠️ Pengguna dengan ID ${targetUserId} tidak ditemukan. Saldo tidak ditambahkan.`);
    }


    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], async (err) => {
      if (err) {
        console.error('Kesalahan saat menambahkan saldo (admin):', err.message);
        return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
      }

      // Panggil checkAndUpdateUserRole dengan jumlah saldo yang ditambahkan
      await checkAndUpdateUserRole(targetUserId, amount); 

      // Notifikasi ke pengguna
      try {
        await ctx.telegram.sendMessage(targetUserId, `✅ Saldo sebesar Rp${amount.toLocaleString('id-ID')} telah ditambahkan ke akun Anda oleh admin.`, { parse_mode: 'Markdown' });
      } catch (e) {
        console.warn(`Gagal kirim notif tambah saldo ke user ${targetUserId}: ${e.message}`);
      }
      
      // Notifikasi ke admin
      await ctx.reply(`✅ Saldo sebesar Rp${amount.toLocaleString('id-ID')} berhasil ditambahkan ke user dengan ID ${targetUserId}.`, { parse_mode: 'Markdown' });

      // Notifikasi ke grup
      const username = await getUsernameById(targetUserId); 
      await sendGroupNotificationTopup(username, targetUserId, amount, amount, 0); // Bonus 0 untuk admin add
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat proses tambah saldo (admin):', error);
    await ctx.reply('🚫 Terjadi kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
  }
});

bot.command('hapusserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/hapusserver <server_id>`', { parse_mode: 'Markdown' });
  }

  const serverId = parseInt(args[1]);

  if (isNaN(serverId)) {
    return ctx.reply('⚠️ `server_id` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run('DELETE FROM Server WHERE id = ?', [serverId], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat menghapus server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat menghapus server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Server dengan ID \`${serverId}\` berhasil dihapus.`, { parse_mode: 'Markdown' });
  });
});

bot.command('listserver', async (ctx) => {
  try {
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.nama_server} (ID: ${server.id})\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});

bot.command('detailserver', async (ctx) => {
  try {
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: `${server.nama_server} (ID: ${server.id})`,
      callback_data: `server_detail_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📋 *Silakan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.command('addserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 8) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <harga_reseller> <nama_server> <quota> <iplimit> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth, harga, harga_reseller, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);

  const numberOnlyRegex = /^\d+$/;
  if (!numberOnlyRegex.test(harga) || !numberOnlyRegex.test(harga_reseller) || !numberOnlyRegex.test(quota) || !numberOnlyRegex.test(iplimit) || !numberOnlyRegex.test(batas_create_akun)) {
    return ctx.reply('⚠️ `harga`, `harga_reseller`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("INSERT INTO Server (domain, auth, harga, harga_reseller, nama_server, quota, iplimit, batas_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
    [domain, auth, parseInt(harga), parseInt(harga_reseller), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], function(err) {
      if (err) {
        console.error('⚠️ Kesalahan saat menambahkan server:', err.message);
        return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });
});
bot.command('editharga', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <server_id> <harga_member> <harga_reseller>`', { parse_mode: 'Markdown' });
  }

  const serverId = args[1];
  const hargaMember = parseInt(args[2]);
  const hargaReseller = args[3] ? parseInt(args[3]) : Math.floor(hargaMember * 0.5); // Diskon default 50%

  if (isNaN(hargaMember) || isNaN(hargaReseller)) {
    return ctx.reply('⚠️ Harga harus angka.', { parse_mode: 'Markdown' });
  }

  if (hargaMember <= 0 || hargaReseller <= 0) {
    return ctx.reply('⚠️ Harga harus lebih dari 0.', { parse_mode: 'Markdown' });
  }

  try {
    db.run("UPDATE Server SET harga = ?, harga_reseller = ? WHERE id = ?", 
      [hargaMember, hargaReseller, serverId], 
      function(err) {
        if (err) {
          console.error('⚠️ Gagal edit harga:', err.message);
          return ctx.reply('⚠️ Gagal mengubah harga server.', { parse_mode: 'Markdown' });
        }

        if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
        }

        ctx.reply(
          `✅ Harga server berhasil diubah:\n` +
          `- Harga Member: Rp${hargaMember.toLocaleString('id-ID')}\n` +
          `- Harga Reseller: Rp${hargaReseller.toLocaleString('id-ID')}`,
          { parse_mode: 'Markdown' }
        );
      }
    );
  } catch (error) {
    console.error('🚫 Gagal edit harga:', error);
    await ctx.reply('🚫 Gagal mengubah harga.', { parse_mode: 'Markdown' });
  }
});

bot.command('editnama', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editnama <domain> <nama_server>`', { parse_mode: 'Markdown' });
  }

  const [domain, nama_server] = args.slice(1);

  db.run("UPDATE Server SET nama_server = ? WHERE domain = ?", [nama_server, domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit nama server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Nama server \`${domain}\` berhasil diubah menjadi \`${nama_server}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editdomain', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
  }

  const [old_domain, new_domain] = args.slice(1);

  db.run("UPDATE Server SET domain = ? WHERE domain = ?", [new_domain, old_domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editauth', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editauth <domain> <auth>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth] = args.slice(1);

  // Periksa apakah domain ada dalam database
  db.get("SELECT * FROM Server WHERE domain = ?", [domain], (err, row) => {
      if (err) {
          console.error('⚠️ Kesalahan saat mengambil data server:', err.message);
          return ctx.reply('⚠️ Terjadi kesalahan saat mengambil data server.', { parse_mode: 'Markdown' });
      }

      if (!row) {
          return ctx.reply(`⚠️ Server dengan domain \`${domain}\` tidak ditemukan.`, { parse_mode: 'Markdown' });
      }

      // Update auth jika server ditemukan
      db.run("UPDATE Server SET auth = ? WHERE domain = ?", [auth, domain], function(err) {
          if (err) {
              console.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
              return ctx.reply('⚠️ Kesalahan saat mengedit auth server.', { parse_mode: 'Markdown' });
          }

          ctx.reply(`✅ Auth server \`${domain}\` berhasil diubah menjadi \`${auth}\`.`, { parse_mode: 'Markdown' });
      });
  });
});


bot.command('editlimitquota', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitquota <domain> <quota>`', { parse_mode: 'Markdown' });
  }

  const [domain, quota] = args.slice(1);

  if (!/^\d+$/.test(quota)) {
      return ctx.reply('⚠️ `quota` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET quota = ? WHERE domain = ?", [parseInt(quota), domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit quota server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Quota server \`${domain}\` berhasil diubah menjadi \`${quota}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitip', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitip <domain> <iplimit>`', { parse_mode: 'Markdown' });
  }

  const [domain, iplimit] = args.slice(1);

  if (!/^\d+$/.test(iplimit)) {
      return ctx.reply('⚠️ `iplimit` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET iplimit = ? WHERE domain = ?", [parseInt(iplimit), domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit iplimit server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Iplimit server \`${domain}\` berhasil diubah menjadi \`${iplimit}\`.`, { parse_mode: 'Markdown' });
  });
});

// Perintah editlimitcreate yang lebih baik
bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <server_id> <batas_baru>`', { parse_mode: 'Markdown' });
  }

  const serverId = args[1];
  const newLimit = parseInt(args[2]);

  if (isNaN(newLimit)) {
    return ctx.reply('⚠️ Batas create akun harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (newLimit <= 0) {
    return ctx.reply('⚠️ Batas create akun harus lebih besar dari 0.', { parse_mode: 'Markdown' });
  }

  try {
    // Ambil info server untuk konfirmasi
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT nama_server, batas_create_akun FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!server) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    // Simpan di state untuk konfirmasi
    userState[ctx.chat.id] = {
      step: 'confirm_edit_limit_create',
      serverId,
      newLimit,
      oldLimit: server.batas_create_akun,
      serverName: server.nama_server
    };

    await ctx.reply(
      `⚠️ *Konfirmasi Perubahan Batas Create Akun*\n\n` +
      `Server: ${server.nama_server}\n` +
      `Batas Lama: ${server.batas_create_akun}\n` +
      `Batas Baru: ${newLimit}\n\n` +
      `Apakah Anda yakin ingin mengubah?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ya', callback_data: 'confirm_edit_limit' }],
            [{ text: '❌ Tidak', callback_data: 'cancel_edit_limit' }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('⚠️ Kesalahan saat mengedit batas create akun:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat memproses permintaan.', { parse_mode: 'Markdown' });
  }
});

// Handle konfirmasi callback
bot.action('confirm_edit_limit', async (ctx) => {
  const state = userState[ctx.chat.id];
  if (!state || state.step !== 'confirm_edit_limit_create') {
    return ctx.answerCbQuery('⚠️ Sesi tidak valid');
  }

  try {
    await db.run(
      'UPDATE Server SET batas_create_akun = ? WHERE id = ?',
      [state.newLimit, state.serverId]
    );

    await ctx.editMessageText(
      `✅ *Batas create akun berhasil diubah!*\n\n` +
      `Server: ${state.serverName}\n` +
      `Batas Lama: ${state.oldLimit}\n` +
      `Batas Baru: ${state.newLimit}`,
      { parse_mode: 'Markdown' }
    );

    // Catat perubahan
    console.log(`Admin ${ctx.from.id} mengubah batas create akun server ${state.serverId} dari ${state.oldLimit} ke ${state.newLimit}`);

  } catch (error) {
    console.error('⚠️ Gagal mengupdate batas create akun:', error);
    await ctx.editMessageText('⚠️ Gagal mengupdate batas create akun', { parse_mode: 'Markdown' });
  } finally {
    delete userState[ctx.chat.id];
  }
});

bot.action('cancel_topup_qris', async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery('Permintaan top-up dibatalkan.');
    
    if (userState[userId] && userState[userId].step === 'topup_waiting_payment') {
        // Hapus pesan QRIS jika ada
        if (userState[userId].qrisMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, userState[userId].qrisMessageId);
            } catch (e) {
                console.warn("Gagal hapus pesan QRIS saat batal:", e.message);
            }
        }
        delete userState[userId]; // Hapus state topup
    } else { // Jika dipanggil dari prompt input jumlah
         try {
            await ctx.deleteMessage(); // Hapus pesan prompt input jumlah
        } catch(e) {}
    }
    await ctx.reply("Top-up dibatalkan. Kembali ke menu utama.");
    await sendMainMenu(ctx); // Arahkan kembali ke menu utama
});

// Handle pembatalan
bot.action('cancel_edit_limit', async (ctx) => {
  delete userState[ctx.chat.id];
  await ctx.editMessageText('❌ Perubahan batas create akun dibatalkan', { parse_mode: 'Markdown' });
});

// Callback handler untuk edit limit yang lebih baik
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  userState[ctx.chat.id] = { 
    step: 'input_edit_batas_create', 
    serverId,
    field: 'batas_create_akun'
  };

  await ctx.reply('📝 Masukkan batas create akun baru:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 Batalkan', callback_data: 'cancel_edit' }]
      ]
    }
  });
});
bot.command('hapussaldo', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/hapussaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetUserId) || isNaN(amount)) {
    return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (amount <= 0) {
    return ctx.reply('⚠️ Jumlah saldo yang dihapus harus lebih besar dari 0.', { parse_mode: 'Markdown' });
  }

  db.get("SELECT * FROM users WHERE user_id = ?", [targetUserId], (err, row) => {
    if (err) {
      console.error('⚠️ Kesalahan saat memeriksa `user_id`:', err.message);
      return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
    }

    if (!row) {
      return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });
    }

    if (row.saldo < amount) {
      return ctx.reply('⚠️ Saldo pengguna tidak mencukupi untuk dihapus.', { parse_mode: 'Markdown' });
    }

    db.run("UPDATE users SET saldo = saldo - ? WHERE user_id = ?", [amount, targetUserId], function(err) {
      if (err) {
        console.error('⚠️ Kesalahan saat menghapus saldo:', err.message);
        return ctx.reply('⚠️ Kesalahan saat menghapus saldo.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil dihapus dari \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
    });
  });
});


bot.command('edittotalcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/edittotalcreate <domain> <total_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, total_create_akun] = args.slice(1);

  if (!/^\d+$/.test(total_create_akun)) {
      return ctx.reply('⚠️ `total_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET total_create_akun = ? WHERE domain = ?", [parseInt(total_create_akun), domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});


bot.command('setbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const args = ctx.message.text.split(' ');
    // /setbonus <min_amount> <type:nominal|percent> <value> <duration_days>
    if (args.length !== 5) {
        return ctx.reply('⚠️ Format salah. Gunakan: `/setbonus <min_amount> <type:nominal|percent> <value> <duration_days>`\nContoh nominal: `/setbonus 50000 nominal 5000 7`\nContoh persen: `/setbonus 100000 percent 10 3`', { parse_mode: 'Markdown' });
    }

    const minAmount = parseInt(args[1], 10);
    const type = args[2].toLowerCase();
    const value = parseFloat(args[3]);
    const durationDays = parseInt(args[4], 10);

    if (isNaN(minAmount) || minAmount <= 0) {
        return ctx.reply('⚠️ Jumlah minimal top-up tidak valid.');
    }
    if (type !== 'nominal' && type !== 'percentage') {
        return ctx.reply('⚠️ Tipe bonus tidak valid. Gunakan `nominal` atau `percent`.');
    }
    if (isNaN(value) || value <= 0) {
        return ctx.reply('⚠️ Nilai bonus tidak valid.');
    }
    if (type === 'percentage' && (value > 100)) { // Max 100% bonus
        return ctx.reply('⚠️ Nilai bonus persentase tidak boleh lebih dari 100.');
    }
    if (isNaN(durationDays) || durationDays <= 0) {
        return ctx.reply('⚠️ Durasi hari tidak valid.');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationDays);
    // Untuk memastikan bonus berlaku sepanjang hari terakhir
    endDate.setHours(23, 59, 59, 999);


    try {
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_min_topup_amount', minAmount.toString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_type', type]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_value', value.toString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_start_date', startDate.toISOString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_end_date', endDate.toISOString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_is_active', 'true']);

        ctx.reply(`✅ Bonus top-up berhasil diatur:\n` +
            `- Minimal Top-up: Rp${minAmount.toLocaleString('id-ID')}\n` +
            `- Tipe: ${type}\n` +
            `- Nilai: ${type === 'nominal' ? `Rp${value.toLocaleString('id-ID')}` : `${value}%`}\n` +
            `- Aktif hingga: ${endDate.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long' })} (Durasi: ${durationDays} hari)\n` +
            `Pastikan bot di-restart jika ini adalah pengaturan pertama kali atau setelah lama tidak aktif untuk memastikan semua proses mengambil konfigurasi terbaru (meskipun seharusnya sudah dinamis).`);
    } catch (error) {
        console.error('Error saat mengatur bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat mengatur bonus.');
    }
});

bot.command('viewbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    try {
        const config = await getActiveBonusConfig(); // Menggunakan fungsi yang sudah ada
        if (config) {
            ctx.reply(`🎁 *Konfigurasi Bonus Top-up Saat Ini (Aktif):*\n` +
                `  - Minimal Top-up: Rp${config.min_topup_amount.toLocaleString('id-ID')}\n` +
                `  - Tipe: ${config.type}\n` +
                `  - Nilai: ${config.type === 'nominal' ? `Rp${config.value.toLocaleString('id-ID')}` : `${config.value}%`}\n` +
                `  - Periode Mulai: ${new Date(config.start_date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}\n` +
                `  - Periode Selesai: ${new Date(config.end_date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}\n` +
                `  *(Waktu server saat ini: ${new Date().toLocaleString('id-ID', { timeZoneName: 'short' })})*`, { parse_mode: 'Markdown' });
        } else {
            // Cek apakah ada konfigurasi tapi tidak aktif
            const keys = ['bonus_min_topup_amount', 'bonus_type', 'bonus_value', 'bonus_start_date', 'bonus_end_date', 'bonus_is_active'];
            const settings = {};
            let hasConfig = false;
            for (const key of keys) {
                const row = await new Promise((resolve) => { db.get('SELECT value FROM system_settings WHERE key = ?', [key], (_, r) => resolve(r)); });
                if (row && row.value) hasConfig = true;
                settings[key] = row ? row.value : null;
            }

            if (hasConfig && settings.bonus_is_active === 'true') {
                 ctx.reply('ℹ️ Ada konfigurasi bonus, tetapi periode sudah berakhir atau belum dimulai.\n' +
                    `   Mulai: ${settings.bonus_start_date ? new Date(settings.bonus_start_date).toLocaleString('id-ID') : 'N/A'}\n` +
                    `   Selesai: ${settings.bonus_end_date ? new Date(settings.bonus_end_date).toLocaleString('id-ID') : 'N/A'}`);
            } else if (hasConfig && settings.bonus_is_active !== 'true') {
                ctx.reply('ℹ️ Ada konfigurasi bonus, tetapi saat ini dinonaktifkan.');
            }
            else {
                ctx.reply('ℹ️ Tidak ada konfigurasi bonus top-up yang aktif saat ini.');
            }
        }
    } catch (error) {
        console.error('Error saat melihat bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat melihat konfigurasi bonus.');
    }
});

bot.command('clearbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }
    try {
        // Cara paling sederhana untuk menonaktifkan adalah dengan mengubah status atau tanggal akhir
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_is_active', 'false']);
        // Atau, set tanggal akhir ke masa lalu
        // await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_end_date', new Date(0).toISOString()]);

        // Opsional: hapus semua kunci bonus
        // const bonusKeys = ['bonus_min_topup_amount', 'bonus_type', 'bonus_value', 'bonus_start_date', 'bonus_end_date', 'bonus_is_active'];
        // for (const key of bonusKeys) {
        //     await db.run('DELETE FROM system_settings WHERE key = ?', [key]);
        // }

        ctx.reply('✅ Konfigurasi bonus top-up telah dinonaktifkan/dihapus.');
    } catch (error) {
        console.error('Error saat menghapus bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat menghapus konfigurasi bonus.');
    }
});bot.command('setbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const args = ctx.message.text.split(' ');
    // /setbonus <min_amount> <type:nominal|percent> <value> <duration_days>
    if (args.length !== 5) {
        return ctx.reply('⚠️ Format salah. Gunakan: `/setbonus <min_amount> <type:nominal|percent> <value> <duration_days>`\nContoh nominal: `/setbonus 50000 nominal 5000 7`\nContoh persen: `/setbonus 100000 percent 10 3`', { parse_mode: 'Markdown' });
    }

    const minAmount = parseInt(args[1], 10);
    const type = args[2].toLowerCase();
    const value = parseFloat(args[3]);
    const durationDays = parseInt(args[4], 10);

    if (isNaN(minAmount) || minAmount <= 0) {
        return ctx.reply('⚠️ Jumlah minimal top-up tidak valid.');
    }
    if (type !== 'nominal' && type !== 'percentage') {
        return ctx.reply('⚠️ Tipe bonus tidak valid. Gunakan `nominal` atau `percent`.');
    }
    if (isNaN(value) || value <= 0) {
        return ctx.reply('⚠️ Nilai bonus tidak valid.');
    }
    if (type === 'percentage' && (value > 100)) { // Max 100% bonus
        return ctx.reply('⚠️ Nilai bonus persentase tidak boleh lebih dari 100.');
    }
    if (isNaN(durationDays) || durationDays <= 0) {
        return ctx.reply('⚠️ Durasi hari tidak valid.');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationDays);
    // Untuk memastikan bonus berlaku sepanjang hari terakhir
    endDate.setHours(23, 59, 59, 999);


    try {
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_min_topup_amount', minAmount.toString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_type', type]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_value', value.toString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_start_date', startDate.toISOString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_end_date', endDate.toISOString()]);
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_is_active', 'true']);

        ctx.reply(`✅ Bonus top-up berhasil diatur:\n` +
            `- Minimal Top-up: Rp${minAmount.toLocaleString('id-ID')}\n` +
            `- Tipe: ${type}\n` +
            `- Nilai: ${type === 'nominal' ? `Rp${value.toLocaleString('id-ID')}` : `${value}%`}\n` +
            `- Aktif hingga: ${endDate.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long' })} (Durasi: ${durationDays} hari)\n` +
            `Pastikan bot di-restart jika ini adalah pengaturan pertama kali atau setelah lama tidak aktif untuk memastikan semua proses mengambil konfigurasi terbaru (meskipun seharusnya sudah dinamis).`);
    } catch (error) {
        console.error('Error saat mengatur bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat mengatur bonus.');
    }
});

bot.command('viewbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    try {
        const config = await getActiveBonusConfig(); // Menggunakan fungsi yang sudah ada
        if (config) {
            ctx.reply(`🎁 *Konfigurasi Bonus Top-up Saat Ini (Aktif):*\n` +
                `  - Minimal Top-up: Rp${config.min_topup_amount.toLocaleString('id-ID')}\n` +
                `  - Tipe: ${config.type}\n` +
                `  - Nilai: ${config.type === 'nominal' ? `Rp${config.value.toLocaleString('id-ID')}` : `${config.value}%`}\n` +
                `  - Periode Mulai: ${new Date(config.start_date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}\n` +
                `  - Periode Selesai: ${new Date(config.end_date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}\n` +
                `  *(Waktu server saat ini: ${new Date().toLocaleString('id-ID', { timeZoneName: 'short' })})*`, { parse_mode: 'Markdown' });
        } else {
            // Cek apakah ada konfigurasi tapi tidak aktif
            const keys = ['bonus_min_topup_amount', 'bonus_type', 'bonus_value', 'bonus_start_date', 'bonus_end_date', 'bonus_is_active'];
            const settings = {};
            let hasConfig = false;
            for (const key of keys) {
                const row = await new Promise((resolve) => { db.get('SELECT value FROM system_settings WHERE key = ?', [key], (_, r) => resolve(r)); });
                if (row && row.value) hasConfig = true;
                settings[key] = row ? row.value : null;
            }

            if (hasConfig && settings.bonus_is_active === 'true') {
                 ctx.reply('ℹ️ Ada konfigurasi bonus, tetapi periode sudah berakhir atau belum dimulai.\n' +
                    `   Mulai: ${settings.bonus_start_date ? new Date(settings.bonus_start_date).toLocaleString('id-ID') : 'N/A'}\n` +
                    `   Selesai: ${settings.bonus_end_date ? new Date(settings.bonus_end_date).toLocaleString('id-ID') : 'N/A'}`);
            } else if (hasConfig && settings.bonus_is_active !== 'true') {
                ctx.reply('ℹ️ Ada konfigurasi bonus, tetapi saat ini dinonaktifkan.');
            }
            else {
                ctx.reply('ℹ️ Tidak ada konfigurasi bonus top-up yang aktif saat ini.');
            }
        }
    } catch (error) {
        console.error('Error saat melihat bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat melihat konfigurasi bonus.');
    }
});

bot.command('clearbonus', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }
    try {
        // Cara paling sederhana untuk menonaktifkan adalah dengan mengubah status atau tanggal akhir
        await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_is_active', 'false']);
        // Atau, set tanggal akhir ke masa lalu
        // await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['bonus_end_date', new Date(0).toISOString()]);

        // Opsional: hapus semua kunci bonus
        // const bonusKeys = ['bonus_min_topup_amount', 'bonus_type', 'bonus_value', 'bonus_start_date', 'bonus_end_date', 'bonus_is_active'];
        // for (const key of bonusKeys) {
        //     await db.run('DELETE FROM system_settings WHERE key = ?', [key]);
        // }

        ctx.reply('✅ Konfigurasi bonus top-up telah dinonaktifkan/dihapus.');
    } catch (error) {
        console.error('Error saat menghapus bonus:', error);
        ctx.reply('⚠️ Terjadi kesalahan saat menghapus konfigurasi bonus.');
    }
});

// --- Tambahkan perintah admin baru ---

bot.command('addbug', async (ctx) => {
    if (!ADMIN.includes(ctx.from.id)) { // Pastikan ADMIN adalah array ID admin
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk perintah ini.');
    }
    // Inisialisasi userState untuk alur penambahan bug
    userState[ctx.from.id] = { step: 'admin_addbug_code_input' };
    await ctx.reply('📝 Masukkan Kode Bug (unik, tanpa spasi, huruf kecil, angka, underscore, cth: xl_vidio_new):');
});

bot.command('listbugs', async (ctx) => {
    if (!ADMIN.includes(ctx.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk perintah ini.');
    }

    try {
        const bugs = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM Bugs ORDER BY display_name ASC', [], (err, rows) => { // Urutkan berdasarkan nama untuk tampilan lebih baik
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        let message = '🐞 *Daftar Konfigurasi Bug:*\n\n';
        const inline_keyboard = [];

        if (!bugs || bugs.length === 0) {
            message = 'ℹ️ Tidak ada bug yang dikonfigurasi saat ini.';
        } else {
            bugs.forEach(bug => {
                message += `*ID:* ${bug.id} | *Kode:* \`${bug.bug_code}\`\n`;
                message += `  *Nama:* ${escapeHtml(bug.display_name)}\n`; // Gunakan escapeHtml jika nama bisa mengandung karakter khusus
                message += `  *Alamat:* \`${escapeHtml(bug.bug_address)}\`\n`;
                message += `  *Subdomain:* ${bug.bug_subdomain ? `\`${escapeHtml(bug.bug_subdomain)}\`` : 'Tidak Ada'}\n`;
                message += `  *Status:* ${bug.is_active ? '✅ Aktif' : '❌ Tidak Aktif'}\n`;
                message += `────────────────────\n`;

                const row = [];
                row.push({ text: `🗑️ Hps ${bug.id}`, callback_data: `admin_managebug_delete_${bug.id}` });
                if (bug.is_active) {
                    row.push({ text: `🚫 Nonaktif ${bug.id}`, callback_data: `admin_managebug_deactivate_${bug.id}` });
                } else {
                    row.push({ text: `✔️ Aktifkan ${bug.id}`, callback_data: `admin_managebug_activate_${bug.id}` });
                }
                inline_keyboard.push(row);
            });
        }
        inline_keyboard.push([{text: '➕ Tambah Bug Baru', callback_data: 'admin_trigger_addbug_cmd'}]);
        if (bugs && bugs.length > 0) { // Tombol refresh hanya jika ada bug
             inline_keyboard.push([{ text: '🔄 Refresh List', callback_data: 'admin_trigger_listbugs_cmd' }]);
        }


        // Coba edit pesan jika dipanggil dari callback refresh, jika tidak kirim baru
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }, disable_web_page_preview: true });
            } catch (e) { // Jika edit gagal (misal pesan sama), kirim reply sebagai fallback (atau abaikan jika tidak ingin duplikat)
                // console.warn("Gagal edit listbugs, mungkin pesan sama:", e.message);
                 await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }, disable_web_page_preview: true });
            }
        } else {
            await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard }, disable_web_page_preview: true });
        }

    } catch (error) {
        console.error("Error listing bugs:", error);
        await ctx.reply('⚠️ Gagal mengambil daftar bug.');
    }
});

bot.command('setmingeneraltopup', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/setmingeneraltopup <jumlah>`\nContoh: `/setmingeneraltopup 10000`');
  }
  const amount = parseInt(args[1], 10);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ Jumlah minimal top-up umum tidak valid. Harus angka positif.');
  }
  try {
    await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['min_general_topup', amount.toString()]);
    await ctx.reply(`✅ Minimal top-up umum berhasil diatur ke Rp${amount.toLocaleString('id-ID')}.`);
  } catch (error) {
    console.error('Error saat mengatur minimal top-up umum:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat mengatur minimal top-up umum.');
  }
});

bot.command('setminresellertopup', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }
  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/setminresellertopup <jumlah>`\nContoh: `/setminresellertopup 25000`');
  }
  const amount = parseInt(args[1], 10);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ Jumlah minimal top-up untuk upgrade reseller tidak valid. Harus angka positif.');
  }
  try {
    await db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['min_reseller_upgrade_topup', amount.toString()]);
    await ctx.reply(`✅ Minimal top-up untuk upgrade reseller berhasil diatur ke Rp${amount.toLocaleString('id-ID')}.`);
  } catch (error) {
    console.error('Error saat mengatur minimal top-up reseller:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat mengatur minimal top-up reseller.');
  }
});

bot.command('viewmintopups', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }
  try {
    const minGeneral = await getMinGeneralTopUp();
    const minReseller = await getMinResellerUpgradeTopUp();
    await ctx.reply(
      `📊 *Pengaturan Minimal Top-Up Saat Ini:*\n\n` +
      `🔸 *Minimal Top-Up Umum:* Rp${minGeneral.toLocaleString('id-ID')}\n` +
      `🔸 *Minimal Top-Up untuk Upgrade Reseller:* Rp${minReseller.toLocaleString('id-ID')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error saat melihat minimal top-up:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat melihat pengaturan minimal top-up.');
  }
});

// GANTI PERINTAH LAMA DENGAN VERSI FINAL INI
bot.command('cleanupresellers', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('🚫 Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    let message;
    try {
        message = await ctx.reply('⏳ Memulai proses pembersihan reseller (Mode Adil)... Ini mungkin memakan waktu.');

        const now = new Date();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        
        const resellers = await new Promise((resolve, reject) => {
            db.all("SELECT user_id, username, became_reseller_on FROM users WHERE role = 'reseller'", [], (err, rows) => {
                if (err) reject(err); else resolve(rows || []);
            });
        });

        if (resellers.length === 0) {
            return ctx.telegram.editMessageText(ctx.chat.id, message.message_id, undefined, 'ℹ️ Tidak ada reseller aktif untuk diperiksa.');
        }

        let demotedCount = 0;
        let skippedCount = 0;
        let checkedCount = 0;
        const demotedUsersDetails = [];
        const skippedUsersDetails = [];

        for (const reseller of resellers) {
            if (!reseller.became_reseller_on) {
                skippedCount++;
                skippedUsersDetails.push({ name: reseller.username || reseller.user_id, reason: "Tdk ada tgl angkat" });
                continue;
            }

            const becameResellerDate = new Date(reseller.became_reseller_on);
            if (now.getTime() < becameResellerDate.getTime() + thirtyDaysInMs) {
                skippedCount++;
                skippedUsersDetails.push({ name: reseller.username || reseller.user_id, reason: "Belum 30 hari" });
                continue;
            }
            
            checkedCount++;
            const accountsCreated = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT COUNT(*) as count FROM created_accounts
                    WHERE created_by_user_id = ? AND duration_days >= 30 AND creation_date >= ?
                `, [reseller.user_id, reseller.became_reseller_on], (err, row) => {
                    if (err) reject(err); else resolve(row ? row.count : 0);
                });
            });

            if (accountsCreated < 5) {
                demotedCount++;
                demotedUsersDetails.push({
                    name: reseller.username || reseller.user_id,
                    count: accountsCreated
                });

                await new Promise((resolve, reject) => {
                    db.run("UPDATE users SET role = 'member', became_reseller_on = NULL, reseller_quota_last_checked_on = NULL WHERE user_id = ?", [reseller.user_id], (err) => {
                        if (err) reject(err); else resolve();
                    });
                });

                const userNotif = `⚠️ Peran reseller Anda telah diturunkan karena tidak membuat minimal 5 akun bulanan dalam periode evaluasi Anda (Anda hanya membuat ${accountsCreated} akun).`;
                const groupNotif = `📉 *Penurunan Role Manual (Admin)*\n\n` +
                                   `👤 User: ${reseller.username || `<a href="tg://user?id=${reseller.user_id}">${reseller.user_id}</a>`}\n` + // Fallback jika username null
                                   `📉 Diturunkan ke: Member\n` +
                                   `📝 Alasan: Hanya membuat ${accountsCreated} akun sejak diangkat.`;

                try { await bot.telegram.sendMessage(reseller.user_id, userNotif); } catch (e) { console.error(`Gagal kirim notif ke user ${reseller.user_id}: ${e.message}`); }
                try { await bot.telegram.sendMessage(GROUP_ID, groupNotif, { parse_mode: 'HTML', disable_web_page_preview: true }); } catch (e) { console.error(`Gagal kirim notif ke grup untuk user ${reseller.user_id}: ${e.message}`); }
            }
        }

        let summary = `✅ **Pembersihan Reseller Selesai**\n\n` +
                      `Reseller Diperiksa: ${checkedCount}\n` +
                      `Reseller Dilewati: ${skippedCount}\n` +
                      `Jumlah Diturunkan: ${demotedCount}\n`;
        
        if (demotedUsersDetails.length > 0) {
            summary += `\n📉 **Daftar User yang Diturunkan:**\n`;
            // PERBAIKAN DI SINI: Menghapus escapeHtml agar link HTML bisa dirender
            demotedUsersDetails.forEach(detail => {
                summary += `- ${detail.name} (Hanya ${detail.count} akun)\n`;
            });
        }

        if (skippedUsersDetails.length > 0) {
            summary += `\n⏭️ **Daftar User yang Dilewati:**\n`;
            // PERBAIKAN DI SINI: Menghapus escapeHtml agar link HTML bisa dirender
            skippedUsersDetails.forEach(detail => {
                summary += `- ${detail.name} (${detail.reason})\n`;
            });
        }

        // Pastikan pesan dikirim dengan parse_mode HTML
        await ctx.telegram.editMessageText(ctx.chat.id, message.message_id, undefined, summary, { parse_mode: 'HTML' });

    } catch (error) {
        console.error("Error pada /cleanupresellers (Mode Adil):", error);
        await ctx.telegram.editMessageText(ctx.chat.id, message.message_id, undefined, `🚫 Terjadi kesalahan: ${error.message}`);
    }
});

console.log(`[APP_MAIN] Memanggil initGenerateBug dengan GROUP_ID: '${GROUP_ID}'`); // LOG X
initGenerateBug(bot, db, ADMIN, vars, GROUP_ID); // Pastikan GROUP_ID di-pass sebagai argumen kelima


bot.action('kembali', async (ctx) => {
  console.log('Tombol Kembali diklik oleh:', ctx.from.id);

  try {
    await ctx.deleteMessage();
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Gagal memproses permintaan:', error);
    await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.', { parse_mode: 'Markdown' });
  }
});
async function sendAdminMenu(ctx) {
  const adminKeyboard = [
    [
      { text: '➕ Tambah Server', callback_data: 'addserver' },
      { text: '🚫 Hapus Server', callback_data: 'deleteserver' }
    ],
    [
      { text: '💲 Edit Harga', callback_data: 'editserver_harga' },
      { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }
    ],
    [
      { text: '🌍 Edit Domain', callback_data: 'editserver_domain' },
      { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }
    ],
    [
      { text: '📊 Edit Quota', callback_data: 'editserver_quota' },
      { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }
    ],
    [
      { text: '👥 List Reseller', callback_data: 'list_resellers' }, // Tombol baru
      { text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' }
    ],
    [
      { text: '📋 List Server', callback_data: 'listserver' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    [
       { text: '📊 Statistik', callback_data: 'admin_stats' } 
    ],
    [
      { text: '🔙 Kembali ke Main Menu', callback_data: 'send_main_menu' }
    ]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    console.log('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply('Menu Admin:', {
        reply_markup: {
          inline_keyboard: adminKeyboard
        }
      });
      console.log('Admin menu sent as new message');
    } else {
      console.error('Error saat mengirim menu admin:', error);
    }
  }
}

bot.action('admin_stats', async (ctx) => {
    await ctx.answerCbQuery();
    await sendAdminStats(ctx);
});

bot.action('list_resellers', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    await ctx.answerCbQuery('🚫 Akses ditolak', { show_alert: true });
    return;
  }

  try {
    const resellers = await getResellerList();
    
    if (resellers.length === 0) {
      await ctx.reply('⚠️ Tidak ada reseller yang terdaftar', { parse_mode: 'Markdown' });
      return;
    }

    let message = '📋 *Daftar Reseller* 📋\n\n';
    message += '```\n';
    message += '┌──────────────┬─────────────────┬──────────────┐\n';
    message += '│ Username     │ Akun Dibuat     │ Saldo        │\n';
    message += '├──────────────┼─────────────────┼──────────────┤\n';

    resellers.forEach(reseller => {
      // Ekstrak username dari format HTML jika ada
      let username = reseller.username;
      if (username && username.includes('<a href')) {
        username = username.match(/">(.*?)<\/a>/)[1] || username;
      }
      
      const displayUsername = (username || `ID:${reseller.user_id}`).slice(0,12).padEnd(12);
      const accounts = reseller.accounts_created_30days.toString().padEnd(15);
      const saldo = `Rp${reseller.saldo.toLocaleString('id-ID')}`.padEnd(12);
      
      message += `│ ${displayUsername} │ ${accounts} │ ${saldo} │\n`;
    });

    message += '└──────────────┴─────────────────┴──────────────┘\n';
    message += '```\n';

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Kembali', callback_data: 'admin_menu' }]
        ]
      }
    });

  } catch (error) {
    console.error('Error saat mengambil daftar reseller:', error);
    await ctx.reply('⚠️ Gagal mengambil daftar reseller', { parse_mode: 'Markdown' });
  }
});



bot.action('send_main_menu', async (ctx) => {
  console.log('Tombol Kembali ke Menu Utama diklik oleh:', ctx.from.id);

  try {
    // Coba hapus pesan menu saat ini
    try {
      await ctx.deleteMessage();
      console.log('Pesan menu dihapus.');
    } catch (deleteError) {
      console.warn('Tidak dapat menghapus pesan:', deleteError.message);
      // Jika pesan tidak dapat dihapus, lanjutkan tanpa menghapus
    }

    // Tampilkan menu utama
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Gagal memproses permintaan:', error);
    await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.', { parse_mode: 'Markdown' });
  }
});

bot.action('panel_server_start', async (ctx) => {
  const userId = ctx.from.id;
  // console.log(`User ${userId}: Tombol PANEL SERVER diklik`);
  if (!userId) {
    return ctx.answerCbQuery('Error: User ID tidak ditemukan.', { show_alert: true });
  }
  userState[userId] = { step: 'selecting_server_for_action' }; // Inisialisasi state awal
  await startSelectServerForAction(ctx, 0);
});
async function startSelectServerForAction(ctx, page = 0) {
    try {
        const userId = ctx.from.id;
        const servers = await getServerList(userId);

        const messageOptions = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
        };

        if (servers.length === 0) {
            messageOptions.reply_markup.inline_keyboard.push([{ text: '🔙 Kembali ke Menu', callback_data: 'kembali' }]);
            const noServerMsg = '⚠️ Tidak ada server yang tersedia saat ini.';
            try {
                if (ctx.callbackQuery) await ctx.editMessageText(noServerMsg, messageOptions);
                else await ctx.reply(noServerMsg, messageOptions);
            } catch (e) {
                await ctx.reply(noServerMsg, messageOptions);
            }
            return;
        }

        const serversPerPage = 3;
        const totalPages = Math.ceil(servers.length / serversPerPage);
        const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
        const currentServers = servers.slice(currentPage * serversPerPage, (currentPage + 1) * serversPerPage);

        const keyboardRows = [];
        for (let i = 0; i < currentServers.length; i += 2) {
            const row = [];
            const server1 = currentServers[i];
            const server2 = currentServers[i + 1];
            row.push({ text: `${server1.nama_server}`, callback_data: `server_selected_for_action_${server1.id}` });
            if (server2) {
                row.push({ text: `${server2.nama_server}`, callback_data: `server_selected_for_action_${server2.id}` });
            }
            keyboardRows.push(row);
        }

        const navButtons = [];
        if (totalPages > 1) {
            if (currentPage > 0) {
                navButtons.push({ text: '⬅️ Back', callback_data: `panel_server_page_${currentPage - 1}` });
            }
            if (currentPage < totalPages - 1) {
                navButtons.push({ text: '➡️ Next', callback_data: `panel_server_page_${currentPage + 1}` });
            }
        }

        if (navButtons.length > 0) {
            keyboardRows.push(navButtons);
        }
        keyboardRows.push([{ text: '🔙 Kembali ke Menu', callback_data: 'kembali' }]);
        messageOptions.reply_markup.inline_keyboard = keyboardRows;

        // =======================================================
        // ==> MODIFIKASI DIMULAI DI SINI <==
        // =======================================================
        let messageText = `<code><b>══════════════════════════════</b></code>\n  <code>   <b>PANEL PREMIUM RYYSTORE</b></code>\n<code><b>══════════════════════════════</b></code>\n📌 <code><b>PILIH SERVER (Hal ${currentPage + 1}/${totalPages})</b></code>\n\n<pre>`;
        currentServers.forEach((server) => {
            const hargaPer30Hari = calculatePrice(server.harga, 30);
            
            // BARIS BARU: Hitung harga per jam dari harga harian
            const hargaPerJam = Math.ceil(server.harga / 24); 

            const status = server.total_create_akun >= server.batas_create_akun ? '❌ PENUH' : '✅ TERSEDIA';
            
            messageText += `🚀 ${server.nama_server}\n`;
            messageText += `💰 HARGA/HARI : Rp${server.harga.toLocaleString('id-ID')}\n`;
            messageText += `🗓️ 30 HARI   : Rp${hargaPer30Hari.toLocaleString('id-ID')}\n`;
            
            // BARIS BARU: Tampilkan harga per jam untuk PAYG
            messageText += `⏱️ PAYG/JAM  : Rp${hargaPerJam.toLocaleString('id-ID')}\n`; 
            
            messageText += `📦 KUOTA     : ${server.quota}GB\n`;
            messageText += `🔒 IP LIMIT  : ${server.iplimit}\n`;
            messageText += `👤 PENGGUNA  : ${server.total_create_akun}/${server.batas_create_akun} ${status}\n`;
            messageText += '─'.repeat(30) + '\n';
        });
        messageText += '</pre>\nSilakan pilih server:';
        // =======================================================
        // ==> MODIFIKASI BERAKHIR DI SINI <==
        // =======================================================

        let sentMessageInfo;
        if (ctx.callbackQuery) {
            try {
                sentMessageInfo = await ctx.editMessageText(messageText, messageOptions);
            } catch (e) {
                console.warn("Gagal editMessageText di startSelectServerForAction, mengirim pesan baru.", e.message);
                delete userState[userId];
                if (userMessages[userId]) { try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch (delErr) {} }
                sentMessageInfo = await ctx.reply(messageText, messageOptions);
            }
        } else {
            if (userMessages[userId]) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch (e) {}
            }
            sentMessageInfo = await ctx.reply(messageText, messageOptions);
        }

        if (sentMessageInfo) {
            userMessages[userId] = sentMessageInfo.message_id || (sentMessageInfo.result && sentMessageInfo.result.message_id);
        }
        userState[userId] = { ...userState[userId], step: 'selecting_server_for_action', currentPage: currentPage };

    } catch (error) {
        console.error('Error di startSelectServerForAction:', error);
        delete userState[userId];
        await ctx.reply('⚠️ Terjadi kesalahan fatal. Silakan coba /menu lagi.', { parse_mode: 'Markdown' });
    }
}

bot.action(/panel_server_page_(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1], 10);
  if (isNaN(page)) {
    console.error("Error: Halaman navigasi tidak valid", ctx.match[1]);
    await ctx.answerCbQuery('⚠️ Halaman tidak valid!', { show_alert: true });
    return;
  }
  // Pastikan userState ada sebelum memanggil fungsi
  if (!userState[ctx.from.id]) {
      userState[ctx.from.id] = {}; // Inisialisasi jika belum ada
  }
  userState[ctx.from.id].step = 'selecting_server_for_action'; // Set ulang step untuk konsistensi
  await startSelectServerForAction(ctx, page);
});

bot.action(/navigate_server_selection_(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1], 10);
  await startSelectServerForAction(ctx, page);
});

bot.action(/server_selected_for_action_(.+)/, async (ctx) => {
    const serverId = ctx.match[1];
    const userId = ctx.from.id;

    if (!userState[userId]) userState[userId] = {};
    userState[userId].serverId = serverId;
    userState[userId].step = 'selecting_protocol_for_action'; 

    try {
        const userDbData = await new Promise((resolve, reject) => {
            db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row || { saldo: 0, role: 'member' });
            });
        });

        const serverDetails = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => {
                if (err) reject(err);
                else if (!row) reject(new Error("Server tidak ditemukan"));
                else resolve(row);
            });
        });

        const role = userDbData.role;
        const hargaPerHari = role === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
        const hargaBulanan = calculatePrice(hargaPerHari, 30);
        // ==> HITUNG HARGA PER JAM DI SINI <==
        const hargaPerJam = Math.ceil(hargaPerHari / 24);

        const displayName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User ${userId}`);
        const userClickableDisplay = `<a href="tg://user?id=${userId}">${escapeHtml(displayName)}</a>`;
        const userSaldoFormatted = userDbData.saldo.toLocaleString('id-ID');
        
        let city = 'Unknown';
        const serverNameLower = serverDetails.nama_server.toLowerCase();
        if (serverNameLower.includes('sg')) city = 'Singapore 🇸🇬';
        else if (serverNameLower.includes('id')) city = 'Indonesia 🇮🇩';
        else if (serverNameLower.includes('us')) city = 'United States 🇺🇸';

        let message = `
<b>╔═════════════════════╗</b>
  <code><b>  PANEL PILIH PROTOKOL</b></code>
<b>╚═════════════════════╝</b>
  <code><b>User:</b></code> ${userClickableDisplay}
  <code><b>Saldo:</b></code> <code>Rp${userSaldoFormatted}</code>
<b>─────────────────────</b>
<code><b>INFORMASI SERVER TERPILIH</b></code>
<b>─────────────────────</b>
  <code><b>Server:</b></code> <code>${serverDetails.nama_server}</code>
  <code><b>Lokasi:</b></code> <code>${city}</code>
  <code><b>Max IP:</b></code> <code>${serverDetails.iplimit}</code>
  <code><b>Kuota:</b></code> <code>${serverDetails.quota} GB</code>
<b>─────────────────────</b>
<code><b>DAFTAR HARGA (${role === 'reseller' ? 'Reseller' : 'Member'})</b></code>
<b>─────────────────────</b>`;

        // --- MODIFIKASI TAMPILAN HARGA ---
        const protocols = ['SSH', 'VMESS', 'VLESS', 'TROJAN', 'HYSTERIA'];
        protocols.forEach(p => {
            message += `\n<blockquote><b>${p.toUpperCase()}</b></blockquote>`;
            message += `  • Per Jam  : <code>Rp${hargaPerJam.toLocaleString('id-ID')}</code> (PAYG)\n`;
            message += `  • Harian   : <code>Rp${hargaPerHari.toLocaleString('id-ID')}</code>\n`;
            message += `  • Bulanan  : <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>`;
        });
        // --- AKHIR MODIFIKASI ---
        
        message += `
<b>─────────────────────</b>
Silakan pilih jenis protokol layanan:`;

        const keyboard = [
            [{ text: 'SSH', callback_data: `protocol_selected_for_action_ssh` }, { text: 'VMESS', callback_data: `protocol_selected_for_action_vmess` }],
            [{ text: 'VLESS', callback_data: `protocol_selected_for_action_vless` }, { text: 'TROJAN', callback_data: `protocol_selected_for_action_trojan` }],
            // ==> TAMBAHKAN BARIS INI <==
    [{ text: 'HYSTERIA 2', callback_data: `protocol_selected_for_action_hysteria` }], 
    // ===========================
    [{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]
];

        await ctx.editMessageText(message, { 
            parse_mode: 'HTML', 
            reply_markup: { inline_keyboard: keyboard },
            disable_web_page_preview: true
        });

    } catch (error) {
        console.error('Error di server_selected_for_action:', error);
        await ctx.editMessageText("⚠️ Terjadi kesalahan saat menampilkan detail server. Silakan coba lagi.", {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]] }
        });
    }
});

// GANTI handler lama Anda dengan yang ini
bot.action(/protocol_selected_for_action_(ssh|vmess|vless|trojan|hysteria)/, async (ctx) => {
    const protocol = ctx.match[1];
    const userId = ctx.from.id;

    if (!userState[userId] || !userState[userId].serverId) {
        return ctx.answerCbQuery('⚠️ Sesi tidak valid. Ulangi dari awal.', { show_alert: true });
    }

    const serverId = userState[userId].serverId;
    userState[userId].protocol = protocol;
    userState[userId].step = 'choosing_final_action';

    try {
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => err ? reject(err) : resolve(row || { saldo: 0, role: 'member' }));
        });

        const serverDetails = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => err ? reject(err) : resolve(row));
        });

        if (!serverDetails) {
            return ctx.editMessageText("⚠️ Server tidak ditemukan.", { reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'panel_server_start' }]] } });
        }

        const role = user.role;
        const hargaPerHari = role === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
        const hargaBulanan = calculatePrice(hargaPerHari, 30);
        // ==> HITUNG HARGA PER JAM DI SINI <==
        const hargaPerJam = Math.ceil(hargaPerHari / 24);

        let city = 'Unknown';
        const serverNameLower = serverDetails.nama_server.toLowerCase();
        if (serverNameLower.includes('sg')) city = 'Singapore 🇸🇬';
        else if (serverNameLower.includes('id')) city = 'Indonesia 🇮🇩';
        else if (serverNameLower.includes('us')) city = 'United States 🇺🇸';

        // --- MODIFIKASI TAMPILAN HARGA ---
        const messageText = `
<b>PANEL KONFIRMASI ${protocol.toUpperCase()}</b>
──────────────────────
Chat ID : <code>${userId}</code>
Saldo   : <code>Rp${user.saldo.toLocaleString('id-ID')}</code>
──────────────────────
Server  : <code>${serverDetails.nama_server}</code>
Kota    : <code>${city}</code>
Kuota   : <code>${serverDetails.quota} GB</code>
IP Limit: <code>${serverDetails.iplimit}</code>
──────────────────────
  HARGA ${protocol.toUpperCase()} (${role === 'reseller' ? 'Reseller' : 'Member'})
  Per Jam  : <code>Rp${hargaPerJam.toLocaleString('id-ID')}</code> (PAYG)
  Harian   : <code>Rp${hargaPerHari.toLocaleString('id-ID')}</code>
  Bulanan  : <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>
──────────────────────
<i>Premium Panel ${protocol.toUpperCase()} ${NAMA_STORE}</i>
──────────────────────
Silakan pilih aksi Anda:`;
        // --- AKHIR MODIFIKASI ---

        // Di keyboard, kita ubah callback untuk PAYG agar menampilkan info dulu
        const keyboard = [
            [{ text: 'BUAT AKUN', callback_data: 'action_do_create_final' }, { text: 'RENEW AKUN', callback_data: 'action_do_renew_start' }],
            [{ text: '⏱️ PAY AS YOU GO', callback_data: 'payg_info_confirm' }, { text: 'TRIAL AKUN', callback_data: 'action_do_trial_final' }], // Diubah ke payg_info_confirm
            [{ text: '🔙 Kembali Pilih Protokol', callback_data: `server_selected_for_action_${serverId}` }]
        ];

        await ctx.editMessageText(messageText, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
            disable_web_page_preview: true
        });

    } catch (error) {
        console.error('Error di protocol_selected_for_action:', error);
        await ctx.editMessageText("⚠️ Terjadi kesalahan saat memproses. Silakan coba lagi.", {
            reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'panel_server_start' }]] }
        });
    }
});

bot.action('action_do_payg_final', async (ctx) => {
    const userId = ctx.from.id;
    if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
        return ctx.answerCbQuery('⚠️ Sesi tidak valid. Ulangi dari awal.', { show_alert: true });
    }

    const { protocol } = userState[userId];
    userState[userId].action = 'payg';
    userState[userId].type = protocol;
    userState[userId].step = `username_payg_${protocol}`;
    
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e) {}

    const promptMsg = await ctx.reply('👤 *Masukkan username untuk layanan Pay-As-You-Go:*', { parse_mode: 'Markdown' });
    if(userState[userId]) userState[userId].lastBotMessageId = promptMsg.message_id;
});

async function processFinalPaygCreation(ctx) {
    const userId = ctx.from.id;
    const state = userState[userId];

    if (!state || state.action !== 'payg' || !state.type || !state.serverId || !state.username || (state.type === 'ssh' && !state.password) ) {
        console.error("State PAYG tidak lengkap untuk kreasi final:", state);
        if (state) delete userState[userId];
        await ctx.reply("⚠️ Sesi error. Ulangi dari /menu.", { parse_mode: 'Markdown' });
        return sendMainMenu(ctx);
    }

    const { username, password, serverId, type } = state;
    let loadingMessage;

    try {
        loadingMessage = await ctx.reply('⏳ Validasi data & persiapan akun PAYG...');

        const server = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => {
                if (err) reject(new Error("Gagal ambil detail server."));
                else if (!row) reject(new Error("Server tidak ditemukan."));
                else resolve(row);
            });
        });

        if (server.total_create_akun >= server.batas_create_akun) {
            throw new Error(`Server ${escapeHtml(server.nama_server)} penuh.`);
        }

        const user = await new Promise((resolve, reject) => {
            db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(new Error("Gagal ambil data user."));
                else if (!row) reject(new Error("User tidak ditemukan."));
                else resolve(row);
            });
        });

        const hargaPerHari = user.role === 'reseller' ? server.harga_reseller : server.harga;
        const hourlyRate = Math.ceil(hargaPerHari / 24);

        if (user.saldo < hourlyRate + PAYG_MINIMUM_BALANCE_THRESHOLD) {
            throw new Error(`Saldo tidak cukup. Dibutuhkan min. Rp${(hourlyRate + PAYG_MINIMUM_BALANCE_THRESHOLD).toLocaleString('id-ID')} untuk memulai. Saldo Anda: Rp${user.saldo.toLocaleString('id-ID')}.`);
        }
        
        await callTelegramApiWithRetry(() => ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, '⏳ Mengurangi saldo & menghubungi server...'));

        const longExpiryDays = 3650; // Masa aktif "dummy" yang sangat panjang
        let accountDetailsMsg;
        const createFn = { 
    ssh: createssh, 
    vmess: createvmess, 
    vless: createvless, 
    trojan: createtrojan,
    hysteria: createhysteria // <--- TAMBAHAN
}[type];
        
        // =======================================================
        // ==> INI BAGIAN PENTINGNYA <==
        // Kita menambahkan 'true' sebagai argumen terakhir untuk menandakan ini adalah PAYG
        // =======================================================
        if (type === 'ssh') {
            accountDetailsMsg = await createFn(username, password, longExpiryDays, server.iplimit, serverId, true);
        } else {
            accountDetailsMsg = await createFn(username, longExpiryDays, server.quota, server.iplimit, serverId, true);
        }
        // =======================================================

        if (!accountDetailsMsg || (typeof accountDetailsMsg === 'string' && accountDetailsMsg.toLowerCase().includes('gagal'))) {
             throw new Error(accountDetailsMsg || "Gagal membuat akun di panel server.");
        }

        const nowISO = new Date().toISOString();
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION;");
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [hourlyRate, userId], (err) => { if(err) return db.run("ROLLBACK;", () => reject(err)); });
                db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], (err) => { if(err) return db.run("ROLLBACK;", () => reject(err)); });
                db.run('INSERT INTO payg_sessions (user_id, server_id, account_username, protocol, hourly_rate, last_billed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userId, serverId, username, type, hourlyRate, nowISO, nowISO], (err) => { if(err) return db.run("ROLLBACK;", () => reject(err)); });
                db.run("COMMIT;", (err) => err ? reject(err) : resolve());
            });
        });

        await callTelegramApiWithRetry(() => ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id));
        
        await sendPaygPurchaseNotification(userId, username, type, server.nama_server, hourlyRate);

        await ctx.reply(accountDetailsMsg, { parse_mode: 'Markdown' });
        await ctx.replyWithMarkdown(`✅ Layanan *Pay-As-You-Go* untuk akun *${escapeHtml(username)}* telah aktif!\n\nBiaya: *Rp${hourlyRate.toLocaleString('id-ID')} per jam*.\nTagihan pertama telah dibayar. Saldo Anda akan dipotong otomatis setiap jam.\n\nAnda dapat menghentikan layanan ini di menu "Kelola Akun".`);

    } catch (error) {
        console.error('Error pada alur pembuatan akun PAYG:', error.message);
         if (loadingMessage) {
            try { await callTelegramApiWithRetry(() => ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, `🚫 Gagal: ${error.message}`)); }
            catch (editError) { await ctx.reply(`🚫 Gagal: ${error.message}`); }
        } else {
            await ctx.reply(`🚫 Gagal: ${error.message}`);
        }
    } finally {
        if (userState[userId]) delete userState[userId];
        await sendMainMenu(ctx);
    }
}

// Handler baru untuk menampilkan informasi tentang PAYG sebelum membuat akun
bot.action('payg_info_confirm', async (ctx) => {
    const userId = ctx.from.id;
    if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
        return ctx.answerCbQuery('⚠️ Sesi tidak valid. Ulangi dari awal.', { show_alert: true });
    }

    const { serverId, protocol } = userState[userId];

    try {
        const server = await new Promise((resolve, reject) => {
            db.get('SELECT harga, harga_reseller FROM Server WHERE id = ?', [serverId], (err, row) => err || !row ? reject(new Error("Server Error")) : resolve(row));
        });
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => err || !row ? reject(new Error("User Error")) : resolve(row));
        });

        const hargaPerHari = user.role === 'reseller' ? server.harga_reseller : server.harga;
        const hourlyRate = Math.ceil(hargaPerHari / 24);

        const message = `
⏱️ <b>Konfirmasi Layanan Pay As You Go</b> ⏱️
──────────────────────
Anda akan membuat akun dengan sistem bayar per pemakaian (per jam).

<b>💡 Konsep Pay As You Go:</b>
<b>1. Biaya per Jam:</b> Saldo Anda akan dipotong sebesar <b>Rp ${hourlyRate.toLocaleString('id-ID')}</b> setiap jam.
<b>2. Tanpa Masa Aktif:</b> Akun akan terus aktif selama saldo Anda mencukupi.
<b>3. Penghentian Otomatis:</b> Layanan akan berhenti dan akun terhapus jika saldo Anda kurang dari Rp 200.
<b>4. Fleksibel:</b> Anda bisa menghentikan layanan kapan saja melalui menu "Kelola Akun".

Saldo akan langsung dipotong untuk 1 jam pertama saat akun dibuat. Pastikan Anda memahami sistem ini sebelum melanjutkan.
`;

        const keyboard = [
            [{ text: '✅ Lanjutkan & Buat Akun PAYG', callback_data: 'action_do_payg_final' }],
            [{ text: '❌ Batal, Kembali', callback_data: `protocol_selected_for_action_${protocol}` }]
        ];

        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error("Error menampilkan info PAYG:", error);
        await ctx.answerCbQuery("⚠️ Terjadi kesalahan, silakan coba lagi.", { show_alert: true });
    }
});

// GANTI HANDLER LAMA ANDA DENGAN VERSI INI
bot.action('action_do_renew_start', async (ctx) => {
    const userId = ctx.from.id;

    if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
        return ctx.answerCbQuery('⚠️ Sesi tidak valid. Ulangi dari awal.', { show_alert: true });
    }

    const { serverId, protocol } = userState[userId];
    userState[userId].step = 'renew_selecting_account';

    try {
        // --- PERUBAHAN DI QUERY INI ---
        const userAccounts = await new Promise((resolve, reject) => {
            const nowISO = new Date().toISOString();
            // Menambahkan "AND expiry_date > ?" untuk menyaring yang sudah lewat waktu secara real-time
            const query = `
                SELECT account_username, expiry_date FROM created_accounts 
                WHERE created_by_user_id = ? 
                  AND server_id = ? 
                  AND protocol = ? 
                  AND is_active = 1
                  AND expiry_date > ? 
                ORDER BY creation_date DESC`;
            
            db.all(query, [userId, serverId, protocol, nowISO], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        // --- AKHIR PERUBAHAN ---

        if (userAccounts.length === 0) {
            await ctx.editMessageText(
                `ℹ️ Anda tidak memiliki akun <b>${protocol.toUpperCase()}</b> yang aktif di server ini untuk diperpanjang.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 Kembali', callback_data: `protocol_selected_for_action_${protocol}` }]
                        ]
                    }
                }
            );
            return;
        }

        const keyboard = userAccounts.map(acc => {
            const expiry = new Date(acc.expiry_date);
            const dateString = expiry.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            
            const buttonText = `${acc.account_username} (exp: ${dateString})`;
            
            return [{ text: buttonText, callback_data: `renew_account_select_${acc.account_username}` }];
        });

        keyboard.push([{ text: '🔙 Kembali', callback_data: `protocol_selected_for_action_${protocol}` }]);

        await ctx.editMessageText('👇 Silakan pilih akun yang ingin Anda perpanjang:', {
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        console.error("Error saat mengambil daftar akun untuk renew:", error);
        await ctx.answerCbQuery('⚠️ Gagal mengambil daftar akun Anda.', { show_alert: true });
    }
});

// CARI FUNGSI INI DI KODE ANDA DAN GANTI SEPENUHNYA
bot.action(/renew_account_select_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const usernameToRenew = ctx.match[1];

    if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
        return ctx.answerCbQuery('⚠️ Sesi tidak valid. Ulangi dari awal.', { show_alert: true });
    }

    // Mengambil 'protocol' dari state yang sudah ada
    const protocol = userState[userId].protocol;
    
    // --- INI BAGIAN PERBAIKANNYA ---
    // Menyiapkan state untuk langkah selanjutnya, sekarang dengan menyertakan 'type'
    userState[userId].username = usernameToRenew;
    userState[userId].action = 'renew';
    userState[userId].type = protocol; // <-- BARIS PENTING INI DITAMBAHKAN
    userState[userId].step = `exp_renew_${protocol}`;
    // -------------------------------

    await ctx.answerCbQuery(`Anda memilih untuk memperpanjang ${usernameToRenew}`);
    
    // Hapus pesan daftar akun dan tampilkan prompt baru
    try {
        await ctx.deleteMessage();
    } catch(e) {}

    const promptMsg = await ctx.reply(
        `⏳ Anda akan memperpanjang akun: <b>${escapeHtml(usernameToRenew)}</b>\n\nMasukkan masa aktif perpanjangan (dalam hari, contoh: 7, 30):`,
        { parse_mode: 'HTML' }
    );
    userState[userId].lastBotMessageId = promptMsg.message_id;
});

bot.action('action_do_create_final', async (ctx) => {
  const userId = ctx.from.id;
  if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
    await ctx.answerCbQuery('⚠️ Sesi tidak valid. Silakan ulangi dari awal.', { show_alert: true });
    return;
  }

  const { serverId, protocol } = userState[userId];
  userState[userId].action = 'create';
  userState[userId].type = protocol;
  userState[userId].step = `username_create_${protocol}`; 
  
  await ctx.answerCbQuery(); 

  const promptMsg = await ctx.reply('👤 *Masukkan username :*', { parse_mode: 'Markdown' });
  userState[userId].lastBotMessageId = promptMsg.message_id; 
});

bot.action('action_do_trial_final', async (ctx) => {
  const userId = ctx.from.id;
  if (!userState[userId] || !userState[userId].serverId || !userState[userId].protocol) {
    await ctx.editMessageText("⚠️ Sesi tidak valid. Ulangi.", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'kembali' }]] } });
    return;
  }
  const { serverId, protocol } = userState[userId];
  // console.log(`User ${userId} -> Trial: Server ${serverId}, Proto ${protocol}. Memproses...`);
  let processingMessage;
  try {
    processingMessage = await ctx.editMessageText('⏳ Memproses permintaan trial Anda...', { parse_mode: 'Markdown' });
  } catch (e) {
    processingMessage = await ctx.reply('⏳ Memproses permintaan trial Anda...', { parse_mode: 'Markdown' });
  }
  // Simpan ID pesan "memproses" untuk dihapus nanti jika perlu (opsional)
  // userMessages[userId + '_processing'] = processingMessage.message_id;

  await processTrial(ctx, protocol, serverId); 
});

// Handler ketika server dipilih
bot.action(/trial_server_(.+)/, async (ctx) => {
  const serverId = ctx.match[1];
  const userId = ctx.from.id;
  
  try {
    // Cek trial limit
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const user = await getUserData(userId);
    
    const isAdmin = adminIds.includes(userId);
    const dailyLimit = user?.role === 'reseller' ? 20 : 5;
    let usedTrials = 0;
    
    if (user?.last_trial_date === today) {
      usedTrials = user.trial_count;
    }

    if (!isAdmin && usedTrials >= dailyLimit) {
      return ctx.reply(
        `⚠️ Anda sudah mencapai batas trial hari ini (${usedTrials}/${dailyLimit}).\nTrial akan direset setiap hari pukul 00:00 WIB.`,
        { parse_mode: 'Markdown' }
      );
    }

    // Tampilkan pilihan protocol
    const message = `
<b>══════════════════════</b>
             <b>FREE TRIAL VPN</b>
<b>══════════════════════</b>
 <code>👤 User:</code> ${ctx.from.username ? `@${ctx.from.username}` : `ID:${userId}`}
 <code>🆔 ID:</code> <code>${userId}</code>
 <code>👥 Role:</code> <code>${user.role === 'reseller' ? 'Reseller' : 'Member'}</code>
<b>══════════════════════</b>
 <code>📊 Trial Hari Ini:</code> <b>${usedTrials}/${dailyLimit}</b>
 <code>⏳ Masa Aktif:</code> <b>30 Menit</b>
 <code>📅 Batas Trial:</code> <b>${dailyLimit}x/hari</b>
<b>══════════════════════</b>
<blockquote>⚠️ <b>PERHATIAN</b> ⚠️
• Trial hanya untuk testing
• Dilarang abuse/spam trial
• Gunakan dengan bijak</blockquote>
<b>══════════════════════</b>
Silakan pilih jenis layanan trial:
    `;

    const keyboard = [
  [
    { text: 'SSH', callback_data: `trial_ssh_${serverId}` },
    { text: 'VMESS', callback_data: `trial_vmess_${serverId}` }
  ],
  [
    { text: 'VLESS', callback_data: `trial_vless_${serverId}` },
    { text: 'TROJAN', callback_data: `trial_trojan_${serverId}` }
  ],
  // ==> TAMBAHAN <==
  [
    { text: 'HYSTERIA 2', callback_data: `trial_hysteria_${serverId}` }
  ],
  // ================
  [
    { text: '🔙 Kembali ke Server', callback_data: 'service_trial' }
  ]
];

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    console.error('Error saat memilih server trial:', error);
    await ctx.reply('⚠️ Terjadi kesalahan. Silakan coba lagi.', { parse_mode: 'Markdown' });
  }
});

bot.action('service_renew', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'renew');
});

bot.action('send_main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

bot.action('create_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'trojan');
});


bot.action('trial_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'vmess');
});

bot.action('trial_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'vless');
});

bot.action('trial_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'trojan');
});

bot.action('trial_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'ssh');
});

bot.action('renew_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'ssh');
});

// --- TAMBAHAN HANDLER HYSTERIA ---

bot.action('create_hysteria', async (ctx) => {
  if (!ctx || !ctx.match) return ctx.reply('🚫 Error.');
  await startSelectServer(ctx, 'create', 'hysteria');
});

bot.action('renew_hysteria', async (ctx) => {
  if (!ctx || !ctx.match) return ctx.reply('🚫 Error.');
  await startSelectServer(ctx, 'renew', 'hysteria');
});

bot.action('trial_hysteria', async (ctx) => {
  if (!ctx || !ctx.match) return ctx.reply('🚫 Error.');
  await startSelectServer(ctx, 'trial', 'hysteria');
});

async function startSelectServer(ctx, action, page = 0) {
  try {
    console.log(`Memulai proses ${action} di halaman ${page + 1}`);

    const servers = await getServerList(ctx.from.id);

    if (servers.length === 0) {
      console.log('Tidak ada server yang tersedia');
      return ctx.reply('⚠️ <b>PERHATIAN! Tidak ada server yang tersedia saat ini. Coba lagi nanti!</b>', { parse_mode: 'HTML' });
    }

    const serversPerPage = 3;
    const totalPages = Math.ceil(servers.length / serversPerPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const currentServers = servers.slice(currentPage * serversPerPage, (currentPage + 1) * serversPerPage);

    const keyboard = [];
    for (let i = 0; i < currentServers.length; i += 2) {
      const row = [];
      const server1 = currentServers[i];
      const server2 = currentServers[i + 1];

      // Callback data sekarang hanya menyertakan action dan server ID
      row.push({ 
        text: `${server1.nama_server}`, 
        callback_data: `${action}_server_${server1.id}` 
      });

      if (server2) {
        row.push({ 
          text: `${server2.nama_server}`, 
          callback_data: `${action}_server_${server2.id}` 
        });
      }

      keyboard.push(row);
    }

    // Tombol navigasi
    const navButtons = [];
    if (totalPages > 1) {
      if (currentPage > 0) {
        navButtons.push({ 
          text: '⬅️ Back', 
          callback_data: `navigate_${action}_${currentPage - 1}` 
        });
      }
      if (currentPage < totalPages - 1) {
        navButtons.push({ 
          text: '➡️ Next', 
          callback_data: `navigate_${action}_${currentPage + 1}` 
        });
      }
    }
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    // Tombol kembali ke menu utama
    keyboard.push([{ text: '🔙 Kembali', callback_data: 'kembali' }]);

    // Pesan untuk menampilkan list server
    let message =
`<code><b>══════════════════════</b></code>
 <code><b>PANEL PREMIUM RYYSTORE</b></code>
 <code><b>══════════════════════</b></code>
📌 <code><b>LIST SERVER (Halaman ${currentPage + 1} dari ${totalPages})</b></code>\n\n`;
    message += '<pre>\n';

    currentServers.forEach((server, index) => {
      const hargaPer30Hari = Math.floor((server.harga * 30) / 100) * 100;
      const status = server.total_create_akun >= server.batas_create_akun ? '❌ PENUH' : '✅ TERSEDIA';
      
      message += `🚀 ${server.nama_server}\n`;
      message += `💰 HARGA      : Rp${server.harga}\n`;
      message += `🗓️ 30 HARI    : Rp${hargaPer30Hari}\n`;
      message += `📦 QUOTA      : ${server.quota}GB\n`;
      message += `🔒 IP LIMIT   : ${server.iplimit}\n`;
      message += `👤 PENGGUNA   : ${server.total_create_akun}/${server.batas_create_akun} ${status}\n`;
      message += '─'.repeat(30) + '\n';
    });

    message += '</pre>';

    try {
      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      await ctx.reply(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    }

    // Simpan state
    userState[ctx.chat.id] = { 
      step: `${action}_select_server`, 
      page: currentPage 
    };

  } catch (error) {
    console.error(`🚫 Error saat memulai proses ${action}:`, error);
    await ctx.reply(`🚫 <b>GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.</b>`, { parse_mode: 'HTML' });
  }
}


bot.action(/navigate_(\w+)_(\d+)/, async (ctx) => {
  const [, action, page] = ctx.match;
  await startSelectServer(ctx, action, parseInt(page, 10));
});

bot.action(/(create|trial)_server_(.+)/, async (ctx) => {
  const action = ctx.match[1]; // 'create' atau 'trial'
  const serverId = ctx.match[2];
  
  try {
    // Dapatkan data user dan server
    const [user, server] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT username, saldo FROM users WHERE user_id = ?', [ctx.from.id], (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT nama_server, harga, harga_reseller, quota, iplimit, batas_create_akun FROM Server WHERE id = ?', [serverId], (err, row) => {
          if (err) reject(err);
          else resolve(row || {});
        });
      })
    ]);

    if (!server.nama_server) {
      return ctx.reply('<b>⚠️ Server tidak ditemukan</b>', { parse_mode: 'HTML' });
    }

    // Simpan serverId di state
    userState[ctx.chat.id] = { 
      ...(userState[ctx.chat.id] || {}),
      serverId,
      step: `${action}_select_protocol`
    };

    // Dapatkan role user
    const role = await getUserRole(ctx.from.id);
    const harga = role === 'reseller' ? server.harga_reseller : server.harga;
    const hargaBulanan = Math.floor((harga * 30) / 100) * 100;

    // Format pesan baru yang lebih menarik
    let message = `
<b>╔═════════════════════╗</b>
<code><b>  PREMIUM VPN SERVER PANEL</b></code>
<b>╚═════════════════════╝</b>
 <code><b>User:</b></code> ${ctx.from.username ? `@${ctx.from.username}` : 'Anonymous'}
 <code><b>Chat ID:</b></code> <code>${ctx.from.id}</code>
 <code><b>Saldo:</b></code> <code>Rp${user.saldo ? user.saldo.toLocaleString('id-ID') : '0'}</code>
<b>─────────────────────</b>
<code><b>SERVER INFORMASI</b></code>
<b>─────────────────────</b>
 <code><b>Server:</b></code> <code>${server.nama_server}</code>
 <code><b>Location:</b></code> <code>${server.nama_server.includes('SG') ? 'Singapore 🇸🇬' : 'Indonesia 🇮🇩'}</code>
 <code><b>Max IP Login:</b></code> <code>${server.iplimit}</code>
 <code><b>Bandwidth Quota:</b></code> <code>${server.quota}GB</code>
<b>─────────────────────</b>
<code><b>LIST HARGA</b></code>
<b>─────────────────────</b>
<blockquote><b>SSH/WS</b></blockquote>
• Harian: <code>Rp${harga.toLocaleString('id-ID')}</code>
• Bulanan: <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>

<blockquote><b>VMESS</b></blockquote>
• Harian: <code>Rp${harga.toLocaleString('id-ID')}</code>
• Bulanan: <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>

<blockquote><b>VLESS</b></blockquote>
• Harian: <code>Rp${harga.toLocaleString('id-ID')}</code>
• Bulanan: <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>

<blockquote><b>TROJAN</b></blockquote>
• Harian: <code>Rp${harga.toLocaleString('id-ID')}</code>
• Bulanan: <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>

<b>╔═════════════════════╗</b>
<code><b>  Powered By RyyStore 2025</b></code>
<b>╚═════════════════════╝</b>
    `;

    // Tampilkan pilihan protokol
    const keyboard = [
      [
        { text: 'SSH', callback_data: `${action}_ssh_${serverId}` },
        { text: 'VMESS', callback_data: `${action}_vmess_${serverId}` }
      ],
      [
        { text: 'VLESS', callback_data: `${action}_vless_${serverId}` },
        { text: 'TROJAN', callback_data: `${action}_trojan_${serverId}` }
      ],
      [{ text: '🔙 Back to Menu', callback_data: `service_${action}` }]
    ];

    try {
      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      await ctx.reply(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    }

  } catch (error) {
    console.error('Error:', error);
    await ctx.reply('<b>⚠️ Error loading server details</b>', { parse_mode: 'HTML' });
  }
});

bot.action(/(create|trial)_(ssh|vmess|vless|trojan|hysteria)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];

  if (action === 'trial') {
    await processTrial(ctx, type, serverId);
  } else {
    userState[ctx.chat.id] = { 
      step: `username_${action}_${type}`, 
      serverId, 
      type, 
      action 
    };
    await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
  }
});
const ensureColumnsExist = async () => {
  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(users)", [], (err, rows) => {
      if (err) {
        console.error("⚠️ Kesalahan saat mengecek struktur tabel:", err.message);
        return reject(err);
      }

      const columns = rows.map(row => row.name);
      const queries = [];

      if (!columns.includes('trial_count')) {
        queries.push("ALTER TABLE users ADD COLUMN trial_count INTEGER DEFAULT 0;");
      }
      if (!columns.includes('last_trial_date')) {
        queries.push("ALTER TABLE users ADD COLUMN last_trial_date TEXT DEFAULT NULL;");
      }

      if (queries.length === 0) {
        return resolve(); // Tidak ada perubahan
      }

      // Eksekusi ALTER TABLE secara berurutan untuk menghindari error
      (async () => {
        for (const query of queries) {
          try {
            await new Promise((res, rej) => {
              db.run(query, (err) => {
                if (err) {
                  console.error("⚠️ Gagal menambahkan kolom:", err.message);
                  rej(err);
                } else {
                  console.log(`✅ Berhasil menjalankan: ${query}`);
                  res();
                }
              });
            });
          } catch (error) {
            return reject(error);
          }
        }
        resolve();
      })();
    });
  });
};

const getUserData = async (userId) => {
  await ensureColumnsExist();
  return new Promise((resolve, reject) => {
    db.get('SELECT trial_count, last_trial_date, role, saldo FROM users WHERE user_id = ?', [userId], (err, user) => {
      if (err) {
        console.error('⚠️ Kesalahan saat mengambil data user:', err.message);
        reject(err);
      } else {
        resolve(user || null);
      }
    });
  });
};

const updateTrialCount = (userId, today) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET trial_count = trial_count + 1, last_trial_date = ? WHERE user_id = ?',
      [today, userId],
      (err) => {
        if (err) {
          console.error('⚠️ Kesalahan saat memperbarui trial count:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
};

// --- Fungsi untuk Memproses Akun yang Kedaluwarsa ---
async function processExpiredAccounts() {
    console.log('🔄 Memulai pengecekan akun kedaluwarsa...');
    const nowISO = new Date().toISOString();

    try {
        const expiredAccounts = await new Promise((resolve, reject) => {
            db.all(
                "SELECT id, server_id, account_username, protocol FROM created_accounts WHERE expiry_date < ? AND is_active = 1",
                [nowISO],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        if (expiredAccounts.length === 0) {
            return; // Tidak ada yang diproses, keluar lebih awal
        }

        console.log(`ℹ️ Ditemukan ${expiredAccounts.length} akun kedaluwarsa untuk diproses.`);

        for (const account of expiredAccounts) {
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run("BEGIN TRANSACTION;");

                    db.run(
                        `UPDATE Server SET total_create_akun = CASE
                            WHEN total_create_akun > 0 THEN total_create_akun - 1
                            ELSE 0
                         END
                         WHERE id = ?`,
                        [account.server_id],
                        function(err) {
                            if (err) {
                                console.error(`❌ Gagal mengurangi total_create_akun untuk server_id ${account.server_id} (akun ${account.account_username}):`, err.message);
                                db.run("ROLLBACK;");
                                return reject(err);
                            }
                            console.log(`✅ Slot bertambah di server ID ${account.server_id} karena akun ${account.account_username} (${account.protocol}) expired.`);
                        }
                    );

                    db.run(
                        "UPDATE created_accounts SET is_active = 0 WHERE id = ?",
                        [account.id],
                        function(err) {
                            if (err) {
                                console.error(`❌ Gagal menonaktifkan akun ${account.account_username} (id ${account.id}):`, err.message);
                                db.run("ROLLBACK;");
                                return reject(err);
                            }
                        }
                    );
                    db.run("COMMIT;", (errCommit) => {
                        if (errCommit) {
                             console.error(`❌ Gagal commit transaksi untuk akun ${account.account_username}:`, errCommit.message);
                            reject(errCommit);
                        } else {
                            resolve();
                        }
                    });
                });
            });
            // Jika Anda ingin notifikasi ke admin atau grup, tambahkan di sini.
            // Contoh: await bot.telegram.sendMessage(ADMIN, `ℹ️ Akun ${account.account_username} (${account.protocol}) di server ID ${account.server_id} telah kedaluwarsa. Slot telah dikembalikan.`);
        }
        console.log(`✅ ${expiredAccounts.length} akun kedaluwarsa berhasil diproses.`);

    } catch (error) {
        console.error('❌ Kesalahan signifikan saat memproses akun kedaluwarsa:', error);
    }
}

// Menjalankan pengecekan akun kedaluwarsa secara periodik
const expiredCheckInterval = 15 * 60 * 1000; // 15 menit
setInterval(processExpiredAccounts, expiredCheckInterval);
// Panggil juga sekali saat bot pertama kali start
processExpiredAccounts();


// --- Fungsi untuk Admin Mereset total_create_akun Suatu Server ke 0 ---
async function adminResetTotalCreatedAccounts(ctx, serverIdToReset) {
    const adminUserId = ctx.from.id;
    if (!adminIds.includes(adminUserId)) { // adminIds harus terdefinisi global atau di-pass
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk melakukan tindakan ini.');
    }

    try {
        const server = await new Promise((resolve, reject) => {
            db.get("SELECT nama_server, total_create_akun FROM Server WHERE id = ?", [serverIdToReset], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!server) {
            return ctx.reply(`⚠️ Server dengan ID ${serverIdToReset} tidak ditemukan.`);
        }

        await new Promise((resolve, reject) => {
            db.run("UPDATE Server SET total_create_akun = 0 WHERE id = ?", [serverIdToReset], function(err) {
                if (err) return reject(err);
                if (this.changes === 0) return reject(new Error("Tidak ada server yang diupdate (mungkin ID salah atau nilai sudah 0)."));
                resolve();
            });
        });
        
        // Opsional: Menandai semua akun di created_accounts untuk server tersebut sebagai tidak aktif.
        // Ini berguna jika reset berarti semua akun dianggap tidak valid lagi.
        // Jika tidak, biarkan processExpiredAccounts yang menangani secara alami.
        /*
        await new Promise((resolve, reject) => {
            db.run("UPDATE created_accounts SET is_active = 0 WHERE server_id = ? AND is_active = 1", [serverIdToReset], function(err) {
                if (err) {
                    console.warn(`Gagal menonaktifkan created_accounts untuk server ${serverIdToReset} saat reset: ${err.message}`);
                    // Tetap resolve karena operasi utama (reset total_create_akun) berhasil
                } else {
                    console.log(`(${this.changes}) entri di created_accounts untuk server ID ${serverIdToReset} ditandai tidak aktif setelah reset total_create_akun.`);
                }
                resolve();
            });
        });
        */

        await ctx.reply(`✅ Counter akun aktif (total_create_akun) untuk server "${server.nama_server}" (ID: ${serverIdToReset}) telah berhasil direset ke 0.`);
        console.log(`Admin ${adminUserId} mereset total_create_akun untuk server ID ${serverIdToReset} dari ${server.total_create_akun} menjadi 0.`);

    } catch (error) {
        console.error(`❌ Gagal mereset total_create_akun untuk server ID ${serverIdToReset}:`, error);
        await ctx.reply(`❌ Terjadi kesalahan: ${error.message}`);
    }
}

async function processTrial(ctx, type, serverId) {
  const userId = ctx.from.id;
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000; // UTC+7
  const today = new Date(now.getTime() + wibOffset).toISOString().split('T')[0];
  const isAdmin = adminIds.includes(userId);

  try {
    let user = await getUserData(userId); // Pastikan getUserData terdefinisi
    if (!isAdmin && (!user || user.saldo < 100)) {
      await ctx.reply('🚫 *Saldo minimal Rp100 (tidak dipotong) untuk trial.*\nTopup dulu.', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'TOPUP SALDO [QRIS]', callback_data: 'topup_saldo' }],
            [{ text: '🔙 Kembali', callback_data: `protocol_selected_for_action_${type}` }] 
          ]
        }
      });
      return;
    }

    let trialCountToday = 0;
    let dailyLimit = (user && user.role === 'reseller') ? 20 : 5;

    if (user) {
      if (user.last_trial_date === today) {
        trialCountToday = user.trial_count;
      } else {
        await new Promise((resolve, reject) => {
          db.run('UPDATE users SET trial_count = 0, last_trial_date = ? WHERE user_id = ?', [today, userId], (err) => {
            if (err) reject(err); else resolve();
          });
        });
        trialCountToday = 0; 
      }
    } else { 
       await new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO users (user_id, username, saldo, role, trial_count, last_trial_date) VALUES (?, ?, ?, ?, 0, NULL)',
          [userId, ctx.from.username ? `<a href="tg://user?id=${userId}">${ctx.from.username}</a>` : `<a href="tg://user?id=${userId}">Pengguna</a>`, 0, 'member'],
          (err) => {
            if (err) return reject(err);
            db.run('UPDATE users SET trial_count = 0, last_trial_date = ? WHERE user_id = ?', [today, userId], (errUpdate) => { // Inisialisasi untuk trial pertama hari ini
                if(errUpdate) reject(errUpdate); else resolve();
            });
          }
        );
      });
      user = await getUserData(userId); 
      dailyLimit = (user && user.role === 'reseller') ? 20 : 5;
      trialCountToday = 0;
    }
    
    if (!isAdmin && trialCountToday >= dailyLimit) {
      await ctx.reply(`🚫 *Batas trial (${dailyLimit}x) hari ini habis.*`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 BUAT AKUN', callback_data: 'action_do_create_final' }],
            [{ text: '🔙 Menu Utama', callback_data: 'kembali' }]
          ]
        }
      });
      return; // Jangan hapus state di sini agar bisa kembali
    }

    let msg;
    const trialFunctions = { ssh: trialssh, vmess: trialvmess, vless: trialvless, trojan: trialtrojan, hysteria: trialhysteria };
    if (!trialFunctions[type]) throw new Error(`Tipe trial tidak dikenali: ${type}`);
    msg = await trialFunctions[type](serverId);

    if (!isAdmin) {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET trial_count = trial_count + 1, last_trial_date = ? WHERE user_id = ?', // Increment di DB
          [today, userId], (err) => { if (err) reject(err); else resolve(); });
      });
      trialCountToday++; 
    }

    const serverInfo = await new Promise((resolve, reject) => {
      db.get('SELECT nama_server FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    
    const usernameForNotif = cleanUsername(user?.username) || (ctx.from.username ? `@${ctx.from.username}` : `User ID: ${userId}`);

    if (serverInfo) {
      const groupMessage = `\n<b>──────────────────────</b>\n      ⟨ <b>TRIAL BOT</b> ⟩\n<b>──────────────────────</b>\n➥ <b>User</b> : <a href="tg://user?id=${userId}">${usernameForNotif}</a>\n➥ <b>ID</b>   : ${userId}\n➥ <b>Role</b> : ${isAdmin ? 'Admin 👑' : (user?.role === 'reseller' ? 'Reseller 🛒' : 'Member 👤')}\n➥ <b>Trial Ke</b> : ${isAdmin ? 'N/A' : `${trialCountToday}/${dailyLimit}`}\n<b>──────────────────────</b>\n➥ <b>Layanan</b>  : ${type.toUpperCase()}\n<blockquote>➥ <b>Server</b>   : ${serverInfo.nama_server}</blockquote>\n➥ <b>Expired</b> : 30 Menit\n➥ <b>Tanggal</b>  : ${new Date().toLocaleString('id-ID')}\n<b>──────────────────────</b>\n<i>Notif Trial @${NAMA_STORE}</i>`;
      try {
        await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'HTML' });
      } catch (error) { console.error('🚫 Gagal kirim notif trial ke grup:', error.message); }
    }

    // Hapus pesan "Memproses..." jika ada
    // if (userMessages[userId + '_processing']) {
    //     try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId + '_processing']); delete userMessages[userId + '_processing']; } catch(e) {}
    // }
    await ctx.reply(msg, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error(`❌ Error processTrial (user ${userId}, type ${type}, server ${serverId}):`, error);
    await ctx.reply('🚫 *Kesalahan internal saat proses trial.*', { parse_mode: 'Markdown' });
  } finally {
    delete userState[userId]; // Hapus state setelah proses trial selesai atau gagal
    // Panggil sendMainMenu untuk memastikan pengguna kembali ke menu utama dengan pesan yang bersih
    // Pesan "Memproses..." seharusnya sudah dihapus atau ditimpa oleh pesan hasil trial atau error.
    // Jika processTrial dipanggil dari ctx.editMessageText, maka pesan itu yg akan ditimpa.
    // Jika ctx.reply, maka pesan baru.
    // Untuk konsistensi, setelah reply hasil trial, panggil sendMainMenu
    if (ctx.callbackQuery) { // Jika ini dari callback, coba hapus pesan tombol sebelumnya
        try { await ctx.deleteMessage(); } catch(e) {}
    }
    await sendMainMenu(ctx); 
  }
}

async function resetTrialCounts() {
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000; // UTC+7 untuk WIB
  const wibTime = new Date(now.getTime() + wibOffset);
  
  // Cek jika jam antara 00:00 - 00:05 WIB
  if (wibTime.getHours() === 0 && wibTime.getMinutes() < 5) {
    try {
      console.log('🔄 Memulai reset trial count harian...');
      
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET trial_count = 0, last_trial_date = NULL', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log('✅ Reset trial count harian berhasil');
    } catch (error) {
      console.error('❌ Gagal reset trial count:', error);
    }
  }
}

// Jalankan pengecekan ini setiap jam
setInterval(resetTrialCounts, 60 * 60 * 1000);

async function getActiveBonusConfig() {
    const keys = [
        'bonus_min_topup_amount', 'bonus_type', 'bonus_value',
        'bonus_start_date', 'bonus_end_date', 'bonus_is_active'
    ];
    const settings = {};
    try {
        for (const key of keys) {
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT value FROM system_settings WHERE key = ?', [key], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            settings[key] = row ? row.value : null;
        }

        if (settings.bonus_is_active !== 'true' || !settings.bonus_start_date || !settings.bonus_end_date || !settings.bonus_min_topup_amount || !settings.bonus_type || !settings.bonus_value) {
            // console.log('Bonus tidak aktif atau konfigurasi tidak lengkap.');
            return null;
        }

        const now = new Date();
        const startDate = new Date(settings.bonus_start_date);
        const endDate = new Date(settings.bonus_end_date);

        // Set jam, menit, detik, ms ke 0 untuk startDate dan 23:59:59:999 untuk endDate
        // agar perbandingan tanggal lebih inklusif sepanjang hari.
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);


        if (now >= startDate && now <= endDate) {
            // console.log('Bonus aktif ditemukan:', settings);
            return {
                min_topup_amount: parseInt(settings.bonus_min_topup_amount, 10),
                type: settings.bonus_type,
                value: parseFloat(settings.bonus_value),
                start_date: startDate,
                end_date: endDate
            };
        }
        // console.log('Periode bonus tidak aktif saat ini.');
        return null;
    } catch (error) {
        console.error('Error saat mengambil konfigurasi bonus:', error);
        return null;
    }
}

function calculateBonusAmount(originalTopupAmount, bonusConfig) {
    if (!bonusConfig) return 0;
    let calculatedBonus = 0;
    if (bonusConfig.type === 'nominal') {
        calculatedBonus = bonusConfig.value;
    } else if (bonusConfig.type === 'percentage') {
        calculatedBonus = originalTopupAmount * (bonusConfig.value / 100);
    }
    return Math.floor(calculatedBonus); // Kembalikan nilai integer
}


bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];

    // Jika tidak ada state atau step, abaikan pesan teks (bukan bagian dari alur input yang diharapkan)
    if (!state || !state.step) {
        return;
    }

    // ==========================================================
    // ALUR 1: TOP UP SALDO
    // ==========================================================
    
if (state.step === 'topup_enter_amount') {
    const amountText = ctx.message.text.trim();
    let userTypedAmountMessageId = ctx.message.message_id;
    let botPromptMessageId = userState[userId] ? userState[userId].lastBotMessageId : null;

    // Hapus pesan-pesan sebelumnya
    if (botPromptMessageId) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPromptMessageId); } catch (e) {} }
    if (userTypedAmountMessageId) { try { await ctx.telegram.deleteMessage(ctx.chat.id, userTypedAmountMessageId); } catch (e) {} }
    if (userState[userId]) userState[userId].lastBotMessageId = null;

    if (!/^\d+$/.test(amountText)) {
        delete userState[userId];
        await ctx.reply('⚠️ Jumlah top-up tidak valid. Hanya masukkan angka.');
        return sendMainMenu(ctx);
    }

    const amount = parseInt(amountText, 10);
    const minGeneralTopUp = await getMinGeneralTopUp();

    if (amount < minGeneralTopUp) {
        delete userState[userId];
        await ctx.reply(`⚠️ Jumlah top-up minimal adalah Rp${minGeneralTopUp.toLocaleString('id-ID')}.`);
        return sendMainMenu(ctx);
    }
    if (amount > 5000000) {
        delete userState[userId];
        await ctx.reply('⚠️ Jumlah top-up maksimal adalah Rp5.000.000.');
        return sendMainMenu(ctx);
    }

    const randomSuffix = Math.floor(Math.random() * 900) + 100;
    const uniqueAmount = amount + randomSuffix;
    const usernameForDisplay = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User${userId}`);

    const qrisCaption = `
<b>TOP UP SALDO - SCAN QRIS</b>
──────────────────────
 User: ${usernameForDisplay}
 ID: <code>${userId}</code>
──────────────────────
<b>JUMLAH PEMBAYARAN:</b>
<code>Rp ${uniqueAmount.toLocaleString('id-ID')}</code>
──────────────────────
⚠️ <i>Transfer <b>TEPAT SESUAI</b> nominal
 di atas agar saldo masuk otomatis.</i>

⏳ Batas Pembayaran: <code>15 Menit</code>
──────────────────────
Silakan scan QRIS untuk top up.`;

    let loadingQrisMsg;
    try {
        loadingQrisMsg = await ctx.reply('⏳ Sedang membuat kode QRIS, mohon tunggu...');

        const base64Qris = await generateDynamicQris(uniqueAmount, QRIS_STATIS_STRING);
        const qrisBuffer = Buffer.from(base64Qris, 'base64');

        if (loadingQrisMsg) { try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingQrisMsg.message_id); } catch (e) {} }

        const qrisPhotoMessage = await ctx.replyWithPhoto(
            { source: qrisBuffer },
            {
                caption: qrisCaption,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Batalkan Top Up Ini', callback_data: 'cancel_topup_qris' }]
                    ]
                }
            }
        );

        // Simpan state untuk proses top-up di queue
        userState[userId] = {
            step: 'topup_waiting_payment',
            uniqueAmount: uniqueAmount,
            baseAmount: amount,
            qrisMessageId: qrisPhotoMessage.message_id,
        };

        // Tambahkan job ke queue untuk cek mutasi
        await topUpQueue.add({
            userId,
            amount: amount,
            uniqueAmount: uniqueAmount,
            qrisMessageId: qrisPhotoMessage.message_id
        });

    } catch (error) {
        console.error("Error mengirim QRIS Topup atau generate dinamis:", error.message);
        if (loadingQrisMsg) { try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingQrisMsg.message_id); } catch (e) {} }
        await ctx.reply(`🚫 Terjadi kesalahan saat memproses permintaan top-up: ${error.message}.\nMohon coba lagi atau hubungi admin.`);
        delete userState[userId];
        return sendMainMenu(ctx);
    }
}

    // ==========================================================
    // ALUR 2: PEMBUATAN AKUN BERLANGGANAN (FIXED-TERM)
    // ==========================================================
    else if (state.step && state.step.startsWith('username_create_')) {
        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e) {/* abaikan */}
        const botUsernamePromptId = userState[userId]?.lastBotMessageId;
        if (botUsernamePromptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, botUsernamePromptId); } catch(e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }

        const enteredUsername = ctx.message.text.trim();
        const currentProtocol = state.type;
        const currentServerId = state.serverId;

        // Validasi format username (panjang dan karakter yang diizinkan)
        if (enteredUsername.length < 3 || enteredUsername.length > 20 || !/^[a-zA-Z0-9]+$/.test(enteredUsername)) {
            const newPrompt = await ctx.reply('🚫 *Username tidak valid (3-20 karakter, hanya huruf dan angka, tanpa spasi).* Silakan masukkan username lagi:', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return; // Penting: hentikan eksekusi jika validasi gagal
        }

        try {
            // Panggil fungsi helper universal untuk memeriksa ketersediaan username
            const available = await isUsernameAvailable(enteredUsername, currentServerId, currentProtocol);

            if (!available) { // Jika username TIDAK tersedia (sudah dipakai oleh akun berlangganan atau PAYG)
                const newPrompt = await ctx.reply(`⚠️ Username '<code>${escapeHtml(enteredUsername)}</code>' sudah terdaftar dan masih aktif untuk layanan <b>${currentProtocol.toUpperCase()}</b> di server ini (baik berlangganan atau PAYG). Silakan pilih username lain:`, { parse_mode: 'HTML' });
                if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
                return; // Penting: hentikan eksekusi
            }
        } catch (dbCheckError) {
            console.error("Kesalahan saat validasi username (create flow):", dbCheckError.message);
            const newPrompt = await ctx.reply('⚠️ Terjadi kesalahan saat memeriksa ketersediaan username. Coba lagi atau hubungi admin jika masalah berlanjut.\nSilakan masukkan username lagi:', { parse_mode: 'Markdown'});
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return; // Penting: hentikan eksekusi
        }

        // Jika username valid dan tersedia, lanjutkan ke langkah berikutnya
        state.username = enteredUsername;
        let nextPromptMessage;
        if (state.type === 'ssh') {
            state.step = `password_create_${state.type}`;
            nextPromptMessage = await ctx.reply('🔑 *Masukkan password (minimal 6 karakter, hanya huruf dan angka):*', { parse_mode: 'Markdown' });
        } else {
            state.step = `exp_create_${state.type}`;
            nextPromptMessage = await ctx.reply('⏳ *Masukkan masa aktif (dalam hari, contoh: 1, 7, 30):*', { parse_mode: 'Markdown' });
        }
        if (userState[userId]) userState[userId].lastBotMessageId = nextPromptMessage.message_id;

    }

    // ==========================================================
    // ALUR 3: INPUT PASSWORD UNTUK SSH (SAAT PEMBUATAN AKUN BERLANGGANAN)
    // ==========================================================
    else if (state.step && state.step.startsWith('password_create_')) {
        // Validasi bahwa ini memang alur pembuatan akun SSH dan state sebelumnya lengkap
        if (!state.action || state.action !== 'create' || state.type !== 'ssh' || !state.serverId || !state.username) {
            console.error("State tidak lengkap atau salah untuk input password (create flow):", state);
            delete userState[userId];
            await ctx.reply("⚠️ Terjadi kesalahan sesi. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
            return sendMainMenu(ctx);
        }
        const enteredPassword = ctx.message.text.trim();

        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e) {}
        const botPasswordPromptId = userState[userId]?.lastBotMessageId;
        if (botPasswordPromptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, botPasswordPromptId); } catch(e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }

        // Validasi format password
        if (enteredPassword.length < 6 || !/^[a-zA-Z0-9]+$/.test(enteredPassword)) {
            const newPrompt = await ctx.reply('🚫 *Password tidak valid (minimal 6 karakter, hanya huruf dan angka, tanpa spasi).* Silakan masukkan password lagi:', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return;
        }
        state.password = enteredPassword;
        state.step = `exp_create_${state.type}`; // Lanjut ke input masa aktif
        const nextPromptMessage = await ctx.reply('⏳ *Masukkan masa aktif (dalam hari, contoh: 1, 7, 30):*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPromptMessage.message_id;

    }

    // ==========================================================
    // ALUR 4: INPUT MASA AKTIF (UNTUK PEMBUATAN AKUN BERLANGGANAN)
    // ==========================================================
    else if (state.step && state.step.startsWith('exp_create_')) {
        // Validasi bahwa ini memang alur pembuatan akun dan state sebelumnya lengkap
        if (!state.action || state.action !== 'create' || !state.type || !state.serverId || !state.username) {
            console.error("State tidak lengkap atau salah untuk input masa aktif (create flow):", state);
            delete userState[userId];
            await ctx.reply("⚠️ Terjadi kesalahan sesi. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
            return sendMainMenu(ctx);
        }
        const expInput = ctx.message.text.trim();

        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        const botExpPromptId = userState[userId]?.lastBotMessageId;
        if (botExpPromptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, botExpPromptId); } catch(e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e) {}

        // Validasi input masa aktif
        if (!/^\d+$/.test(expInput) || parseInt(expInput, 10) <= 0 || parseInt(expInput, 10) > 365) {
            const newPrompt = await ctx.reply('🚫 *Masa aktif tidak valid (1-365 hari).* Silakan masukkan masa aktif lagi:', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return;
        }
        state.exp = parseInt(expInput, 10);

        const { username, password, exp, serverId, type } = state;
        let loadingMessage;

        try {
            loadingMessage = await ctx.reply('⏳ Memvalidasi permintaan Anda...');

            // Ambil detail server dari DB
            const serverDetails = await new Promise((resolve, reject) => {
                db.get('SELECT quota, iplimit, harga, harga_reseller, nama_server, batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], (err, row) => {
                    if (err) reject(new Error("Gagal mengambil detail server dari database."));
                    else if (!row) reject(new Error("Informasi server tidak ditemukan."));
                    else resolve(row);
                });
            });

            // Cek apakah server penuh
            if (serverDetails.total_create_akun >= serverDetails.batas_create_akun) {
                throw new Error(`Server ${serverDetails.nama_server} sudah penuh (Slot: ${serverDetails.total_create_akun}/${serverDetails.batas_create_akun}). Saldo Anda tidak dipotong.`);
            }

            // Ambil role dan hitung harga
            const userRole = await getUserRole(userId);
            const hargaPerHari = userRole === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
            const totalHarga = calculatePrice(hargaPerHari, exp);

            // Ambil saldo pengguna dari DB
            const userDbInfo = await new Promise((resolve, reject) => {
                db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
                    if (err) reject(new Error("Gagal mengambil informasi saldo Anda."));
                    else if (!row) reject(new Error("Data pengguna tidak ditemukan."));
                    else resolve(row);
                });
            });

            // Cek saldo
            if (userDbInfo.saldo < totalHarga) {
                throw new Error(`Saldo Anda (Rp${userDbInfo.saldo.toLocaleString('id-ID')}) tidak mencukupi. Harga layanan adalah Rp${totalHarga.toLocaleString('id-ID')}. Saldo Anda tidak dipotong.`);
            }

            await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, `⏳ Menghubungi server untuk membuat akun ${type.toUpperCase()}...`);

            // Panggil fungsi create akun di panel (createssh, createvmess, dll.)
            let panelCreationResponse;
            // TAMBAHKAN hysteria: createhysteria DI SINI
            const createFunctions = { 
                ssh: createssh, 
                vmess: createvmess, 
                vless: createvless, 
                trojan: createtrojan,
                hysteria: createhysteria 
            };

            if (!createFunctions[type]) {
                throw new Error("Tipe layanan tidak valid untuk pembuatan akun.");
            }

            try {
                panelCreationResponse = (type === 'ssh')
                    ? await createFunctions[type](username, password, exp, serverDetails.iplimit, serverId)
                    : await createFunctions[type](username, exp, serverDetails.quota, serverDetails.iplimit, serverId);

                // Periksa respons dari panel
                if (typeof panelCreationResponse === 'string' && (panelCreationResponse.toLowerCase().includes("gagal") || panelCreationResponse.toLowerCase().includes("error") || panelCreationResponse.toLowerCase().includes("sudah ada"))) {
                    throw new Error(`Panel: ${panelCreationResponse}`);
                }
                if (!panelCreationResponse) {
                    throw new Error("Panel tidak memberikan respon yang valid setelah pembuatan akun.");
                }
            } catch (panelError) {
                console.error(`Error dari panel saat membuat akun ${type} ${username}:`, panelError);
                throw new Error(`Gagal membuat akun di panel server. Penyebab: ${panelError.message || "Tidak ada detail dari server."}. Saldo Anda TIDAK dipotong.`);
            }

            await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, '⏳ Akun berhasil dibuat di panel. Memproses transaksi & mencatat akun...');

            // Potong saldo di DB
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], function(err) {
                    if (err) {
                        console.error("KRITIS: Akun dibuat di panel, TAPI GAGAL POTONG SALDO:", err.message, {userId, totalHarga, username, type, serverId});
                        bot.telegram.sendMessage(ADMIN, `🔴 KRITIS: Akun ${username} (${type}) di server ${serverDetails.nama_server} DIBUAT di panel, TAPI GAGAL potong saldo user ID ${userId} sejumlah Rp${totalHarga}. Harap periksa manual!`).catch(e => console.error("Gagal kirim notif kritis ke admin:", e));
                        reject(new Error("Gagal memotong saldo Anda setelah akun dibuat. Mohon segera hubungi Admin."));
                    } else if (this.changes === 0) {
                        console.error("KRITIS: Akun dibuat di panel, TAPI SALDO TIDAK BERUBAH (user/saldo tidak ditemukan saat update):", {userId, totalHarga, username, type, serverId});
                        bot.telegram.sendMessage(ADMIN, `🔴 KRITIS: Akun ${username} (${type}) di server ${serverDetails.nama_server} DIBUAT di panel, TAPI saldo user ID ${userId} TIDAK BERUBAH (target Rp${totalHarga}). Harap periksa manual!`).catch(e => console.error("Gagal kirim notif kritis ke admin:", e));
                        reject(new Error("Gagal mencatat pemotongan saldo setelah akun dibuat. Mohon segera hubungi Admin."));
                    } else {
                        resolve();
                    }
                });
            });

            await recordUserTransaction(userId); // Catat transaksi pengguna
            await new Promise((resolve, reject) => {
                db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], (err) => {
                    if (err) {
                        console.error('PERHATIAN: Gagal update total_create_akun server setelah sukses panel:', err.message, {serverId, username, type});
                        bot.telegram.sendMessage(ADMIN, `🟡 PERHATIAN: Akun ${username} (${type}) di server ${serverDetails.nama_server} berhasil dibuat & saldo dipotong, TAPI GAGAL update counter slot server. Server ID: ${serverId}. Harap periksa manual.`).catch(e => console.error("Gagal kirim notif perhatian ke admin:", e));
                    }
                    resolve(); // Lanjutkan meskipun ada error ini karena ini bukan error fatal
                });
            });
            await updateUserAccountCreation(userId); // Update statistik pembuatan akun user

            // Hitung tanggal kadaluarsa dan simpan di DB
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + exp);
            expiryDate.setHours(23, 59, 59, 999); // Set ke akhir hari agar tidak expired di awal hari

            const creationTimestamp = new Date().toISOString();
            const accountDurationDays = exp;

            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO created_accounts (server_id, account_username, protocol, created_by_user_id, expiry_date, is_active, creation_date, duration_days) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
                    [serverId, username, type, userId, expiryDate.toISOString(), creationTimestamp, accountDurationDays],
                    function(err) {
                        if (err) {
                            console.error(`PERHATIAN: Gagal mencatat akun ${username} (${type}) ke created_accounts: ${err.message}`);
                            bot.telegram.sendMessage(ADMIN, `🟡 PERHATIAN: Akun ${username} (${type}) di server ${serverDetails?.nama_server || serverId} berhasil dibuat & saldo dipotong, TAPI GAGAL dicatat di 'created_accounts'. User ID: ${userId}, Server ID: ${serverId}. Harap periksa manual.`).catch(e => console.error("Gagal kirim notif perhatian ke admin:", e));
                            reject(err);
                        } else {
                            console.log(`Akun ${username} (${type}) berhasil dicatat ke created_accounts. Durasi: ${accountDurationDays} hari, Dibuat: ${creationTimestamp}, Exp: ${expiryDate.toISOString()}`);
                            resolve();
                        }
                    }
                );
            });

            try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch(e) {} // Hapus pesan loading

            // Kirim notifikasi ke grup
            await sendGroupNotificationPurchase(ctx.from.username || `User ${userId}`, userId, type, serverDetails.nama_server, exp);
            // Kirim detail akun ke pengguna
            await ctx.reply(panelCreationResponse, { parse_mode: 'Markdown' });

        } catch (error) {
            console.error('Error saat proses pembuatan akun (langkah exp_create_):', error.message, error.stack);
            let finalErrorMessage = `🚫 Gagal memproses pembuatan akun: ${error.message || 'Detail error tidak tersedia.'}`;

            // Perbaiki pesan error agar lebih informatif
            if (error.message.includes("Saldo Anda tidak dipotong") ||
                error.message.includes("Saldo Anda TIDAK dipotong") ||
                (error.message.includes("Saldo Anda (Rp") && error.message.includes("tidak mencukupi")) ||
                (error.message.includes("Server") && error.message.includes("sudah penuh")) ||
                error.message.includes("Panel tidak memberikan respon")
            ) {
                finalErrorMessage = `🚫 ${error.message}`;
            }
            else if (error.message.includes("Gagal memotong saldo") || error.message.includes("Gagal mencatat pemotongan saldo")) {
                finalErrorMessage = `🚫 ${error.message}\nAkun kemungkinan telah terbuat di server. Harap segera laporkan ke Admin dengan menyertakan:\nUsername: <code>${escapeHtml(username)}</code>\nServer: <code>${escapeHtml(serverDetails?.nama_server || serverId)}</code>\nProtokol: <code>${type.toUpperCase()}</code>`;
            } else {
                finalErrorMessage = `🚫 Gagal membuat akun. Penyebab: ${error.message || 'Tidak ada detail.'}\nSaldo Anda kemungkinan besar TIDAK terpotong. Hubungi admin jika ragu.`;
            }

            // Kirim pesan error ke pengguna
            if (loadingMessage && loadingMessage.message_id) {
                try {
                    await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, finalErrorMessage, {parse_mode: 'HTML'});
                } catch (editError) {
                    await ctx.reply(finalErrorMessage, { parse_mode: 'HTML' });
                }
            } else {
                await ctx.reply(finalErrorMessage, { parse_mode: 'HTML' });
            }
        } finally {
            delete userState[userId]; // Bersihkan state setelah alur selesai (berhasil/gagal)
            await sendMainMenu(ctx); // Kembali ke menu utama
        }
    }

    // ==========================================================
    // ALUR 5: INPUT USERNAME UNTUK PEMBUATAN AKUN PAY-AS-YOU-GO (BARU)
    // ==========================================================
    else if (state.step && state.step.startsWith('username_payg_')) {
        // Validasi state sebelum melanjutkan
        if (!state.action || state.action !== 'payg' || !state.type || !state.serverId) {
            delete userState[userId];
            console.error("State PAYG tidak lengkap untuk input username:", state);
            await ctx.reply("⚠️ Sesi tidak valid. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
            return sendMainMenu(ctx);
        }

        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        try { await ctx.deleteMessage(); } catch(e) {}
        if (userState[userId]?.lastBotMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, userState[userId].lastBotMessageId); } catch(e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }

        const enteredUsername = ctx.message.text.trim(); // Gunakan variabel yang konsisten
        const currentProtocol = state.type;
        const currentServerId = state.serverId;

        // Validasi format username (panjang dan karakter yang diizinkan)
        if (enteredUsername.length < 3 || enteredUsername.length > 20 || !/^[a-zA-Z0-9]+$/.test(enteredUsername)) {
            const newPrompt = await ctx.reply('🚫 *Username tidak valid (3-20 karakter, hanya huruf & angka).* Coba lagi:', { parse_mode: 'Markdown' });
            if(userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return; // Penting: hentikan eksekusi
        }

        try {
            // Panggil fungsi helper universal untuk memeriksa ketersediaan username
            const available = await isUsernameAvailable(enteredUsername, currentServerId, currentProtocol);

            if (!available) { // Jika username TIDAK tersedia (sudah dipakai oleh akun berlangganan atau PAYG)
                const newPrompt = await ctx.reply(`⚠️ Username '<code>${escapeHtml(enteredUsername)}</code>' sudah digunakan di layanan <b>${currentProtocol.toUpperCase()}</b> server ini (baik berlangganan atau PAYG). Coba username lain:`, {parse_mode: 'HTML'});
                if(userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
                return; // Penting: hentikan eksekusi
            }
        } catch (dbCheckError) {
            console.error("Kesalahan saat validasi username (PAYG flow):", dbCheckError.message);
            const newPrompt = await ctx.reply('⚠️ Terjadi kesalahan saat memeriksa ketersediaan username. Coba lagi atau hubungi admin jika masalah berlanjut.\nSilakan masukkan username lagi:', { parse_mode: 'Markdown'});
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return; // Penting: hentikan eksekusi
        }

        // Jika username valid dan tersedia, simpan ke state
        state.username = enteredUsername;

        // Jika protokol SSH, minta password. Jika tidak, langsung proses pembuatan akun PAYG.
        if (state.type === 'ssh') {
            state.step = `password_payg_${state.type}`;
            const nextPrompt = await ctx.reply('🔑 *Masukkan password (min 6 karakter, alfanumerik):*', { parse_mode: 'Markdown' });
            if(userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
        } else {
            // Jika bukan SSH, langsung panggil fungsi untuk proses final PAYG creation
            await processFinalPaygCreation(ctx);
        }
    }

    // ==========================================================
    // ALUR 6: INPUT PASSWORD UNTUK SSH (SAAT PEMBUATAN AKUN PAY-AS-YOU-GO)
    // ==========================================================
    else if (state.step && state.step.startsWith('password_payg_')) {
        // Validasi bahwa ini memang alur pembuatan akun PAYG SSH dan state sebelumnya lengkap
        if (!state.action || state.action !== 'payg' || state.type !== 'ssh' || !state.serverId || !state.username) {
            delete userState[userId];
            console.error("State PAYG tidak lengkap untuk input password:", state);
            await ctx.reply("⚠️ Sesi tidak valid. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
            return sendMainMenu(ctx);
        }
        state.password = ctx.message.text.trim();

        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        try { await ctx.deleteMessage(); } catch(e) {}
        if (userState[userId]?.lastBotMessageId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, userState[userId].lastBotMessageId); } catch(e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }

        // Validasi format password
        if (state.password.length < 6 || !/^[a-zA-Z0-9]+$/.test(state.password)) {
            const newPrompt = await ctx.reply('🚫 *Password tidak valid (min 6 karakter, alfanumerik).* Coba lagi:', { parse_mode: 'Markdown' });
            if(userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return;
        }

        // Lanjutkan ke proses final pembuatan akun PAYG
        await processFinalPaygCreation(ctx);
    }

    // ==========================================================
    // ALUR 7: INPUT MASA AKTIF (UNTUK PERPANJANGAN AKUN RENEW)
    // ==========================================================
    else if (state.step && state.step.startsWith('exp_renew_')) {
        // Validasi bahwa ini memang alur perpanjangan akun dan state sebelumnya lengkap
        if (!state.action || state.action !== 'renew' || !state.type || !state.serverId || !state.username) {
            console.error("State tidak lengkap untuk perpanjangan:", state);
            delete userState[userId];
            await ctx.reply("⚠️ Terjadi kesalahan sesi perpanjangan. Ulangi dari awal.");
            return sendMainMenu(ctx);
        }

        const expInput = ctx.message.text.trim();
        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        const botExpPromptId = userState[userId]?.lastBotMessageId;
        if (botExpPromptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, botExpPromptId); } catch (e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}

        // Validasi input masa aktif
        if (!/^\d+$/.test(expInput) || parseInt(expInput, 10) <= 0 || parseInt(expInput, 10) > 365) {
            const newPrompt = await ctx.reply('🚫 *Masa aktif tidak valid (1-365 hari).* Masukkan masa aktif lagi:', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return;
        }

        state.exp = parseInt(expInput, 10);

        const { username, exp, serverId, type } = state;
        let loadingMessage;

        try {
            loadingMessage = await ctx.reply('⏳ Memproses permintaan perpanjangan...');

            // Ambil detail server dari DB
            const serverDetails = await new Promise((resolve, reject) => {
                db.get('SELECT harga, harga_reseller, nama_server, quota, iplimit FROM Server WHERE id = ?', [serverId], (err, row) => {
                    if (err) reject(new Error("Gagal mengambil detail server."));
                    else if (!row) reject(new Error("Server tidak ditemukan."));
                    else resolve(row);
                });
            });

            // Ambil role dan hitung harga perpanjangan
            const userRole = await getUserRole(userId);
            const hargaPerHari = userRole === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
            const totalHarga = calculatePrice(hargaPerHari, exp);

            // Ambil saldo pengguna dari DB
            const userDbInfo = await new Promise((resolve, reject) => {
                db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
                    if (err) reject(new Error("Gagal mengambil saldo Anda."));
                    else if (!row) reject(new Error("Data pengguna tidak ditemukan."));
                    else resolve(row);
                });
            });

            // Cek saldo
            if (userDbInfo.saldo < totalHarga) {
                throw new Error(`Saldo Anda (Rp${userDbInfo.saldo.toLocaleString('id-ID')}) tidak cukup. Harga perpanjangan: Rp${totalHarga.toLocaleString('id-ID')}.`);
            }

            // Panggil fungsi renew akun di panel
            const renewFunctions = { 
    ssh: renewssh, 
    vmess: renewvmess, 
    vless: renewvless, 
    trojan: renewtrojan,
    hysteria: renewhysteria // <--- TAMBAHAN
};
            if (!renewFunctions[type]) throw new Error("Tipe layanan tidak valid untuk perpanjangan.");

            const panelRenewResponse = (type === 'ssh')
                ? await renewFunctions[type](username, exp, serverDetails.iplimit, serverId)
                : await renewFunctions[type](username, exp, serverDetails.quota, serverDetails.iplimit, serverId);

            // Periksa respons dari panel
            if (typeof panelRenewResponse === 'string' && panelRenewResponse.startsWith('❌')) {
                throw new Error(panelRenewResponse);
            }

            // Potong saldo di DB
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], (err) => {
                    if (err) reject(new Error("KRITIS: Gagal potong saldo setelah perpanjangan sukses. Hubungi admin!"));
                    else resolve();
                });
            });

            // Update tanggal expired di tabel created_accounts
            const accountInfo = await new Promise((resolve, reject) => {
                db.get("SELECT expiry_date FROM created_accounts WHERE server_id = ? AND account_username = ? AND protocol = ?", [serverId, username, type], (err, row) => {
                    if (err || !row) reject(new Error("Gagal menemukan akun di DB untuk update expiry."));
                    else resolve(row);
                });
            });

            const currentExpiry = new Date(accountInfo.expiry_date);
            const now = new Date();
            // Jika tanggal expired sudah lewat, mulai perpanjangan dari sekarang. Jika belum, tambahkan dari tanggal expired yang ada.
            const startDateForRenewal = currentExpiry > now ? currentExpiry : now;

            const newExpiryDate = new Date(startDateForRenewal);
            newExpiryDate.setDate(startDateForRenewal.getDate() + exp);
            newExpiryDate.setHours(23, 59, 59, 999); // Set ke akhir hari

            await new Promise((resolve, reject) => {
                const sql = `
                    UPDATE created_accounts
                    SET expiry_date = ?, duration_days = duration_days + ?, is_active = 1
                    WHERE server_id = ? AND account_username = ? AND protocol = ?`;

                const params = [newExpiryDate.toISOString(), exp, serverId, username, type];

                db.run(sql, params, function(err) {
                    if (err) {
                        console.error("DATABASE UPDATE ERROR:", err);
                        reject(new Error("Gagal update tanggal expiry di DB. Hubungi admin."));
                    } else if (this.changes === 0) {
                        console.error("DATABASE UPDATE FAILED: No rows affected.", { serverId, username, type });
                        reject(new Error("Gagal update DB: Akun tidak ditemukan untuk diupdate."));
                    } else {
                        resolve();
                    }
                });
            });

            await recordUserTransaction(userId); // Catat transaksi perpanjangan

            try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch(e) {} // Hapus pesan loading

            // Kirim detail akun yang diperpanjang ke pengguna
            await ctx.reply(panelRenewResponse, { parse_mode: 'Markdown' });

            // Kirim notifikasi perpanjangan ke grup
            await sendRenewNotification(userId, userRole, type, serverDetails.nama_server, username, exp, totalHarga, newExpiryDate);

        } catch (error) {
            console.error('Error saat proses perpanjangan akun:', error.message, error.stack);
            const errorMessage = `🚫 Gagal: ${error.message.replace('❌', '').trim()}`; // Bersihkan pesan error dari panel
            if (loadingMessage) {
                try { await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, errorMessage); }
                catch (editError) { await ctx.reply(errorMessage); } // Fallback jika edit gagal
            } else {
                await ctx.reply(errorMessage);
            }
        } finally {
            delete userState[userId]; // Bersihkan state setelah alur selesai
            await sendMainMenu(ctx); // Kembali ke menu utama
        }
    }

    // ==========================================================
    // ALUR 8: ADMIN - MENAMBAHKAN SERVER BARU (bertahap)
    // ==========================================================
    else if (state.step === 'addserver_domain') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; } // Pastikan admin
        // Hapus pesan user dan bot sebelumnya
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const newDomainInput = ctx.message.text.trim();

        if (!newDomainInput) {
            const newPromptMsg = await ctx.reply('⚠️ *Domain tidak boleh kosong.* Masukkan domain server:', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.domain = newDomainInput; state.step = 'addserver_auth';
        const nextPrompt = await ctx.reply('🔑 *Masukkan auth server:*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_auth') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const auth = ctx.message.text.trim();
        if (!auth) {
            const newPromptMsg = await ctx.reply('⚠️ *Auth tidak boleh kosong.* Masukkan auth server.', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.auth = auth; state.step = 'addserver_nama_server';
        const nextPrompt = await ctx.reply('🏷️ *Masukkan nama server (misal: SG Premium):*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_nama_server') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const nama_server = ctx.message.text.trim();
        if (!nama_server) {
            const newPromptMsg = await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Masukkan nama server.', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.nama_server = nama_server; state.step = 'addserver_quota';
        const nextPrompt = await ctx.reply('📊 *Masukkan quota server (GB), contoh: 50*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_quota') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const quotaInput = ctx.message.text.trim();
        if (!/^\d+$/.test(quotaInput) || parseInt(quotaInput, 10) <=0) {
            const newPromptMsg = await ctx.reply('⚠️ *Quota tidak valid.* Masukkan angka positif (GB).', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.quota = parseInt(quotaInput, 10); state.step = 'addserver_iplimit';
        const nextPrompt = await ctx.reply('🔢 *Masukkan limit IP server, contoh: 2*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_iplimit') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const iplimitInput = ctx.message.text.trim();
        if (!/^\d+$/.test(iplimitInput) || parseInt(iplimitInput, 10) <=0) {
            const newPromptMsg = await ctx.reply('⚠️ *Limit IP tidak valid.* Masukkan angka positif.', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.iplimit = parseInt(iplimitInput, 10); state.step = 'addserver_batas_create_akun';
        const nextPrompt = await ctx.reply('🎰 *Masukkan batas maksimal pembuatan akun di server ini (slot), contoh: 100*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_batas_create_akun') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const batasCreateInput = ctx.message.text.trim();
        if (!/^\d+$/.test(batasCreateInput) || parseInt(batasCreateInput, 10) <=0) {
            const newPromptMsg = await ctx.reply('⚠️ *Batas create akun tidak valid.* Masukkan angka positif.', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.batas_create_akun = parseInt(batasCreateInput, 10); state.step = 'addserver_harga';
        const nextPrompt = await ctx.reply('💰 *Masukkan harga server per hari (untuk member), contoh: 300*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_harga') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        const hargaInput = ctx.message.text.trim();
        if (!/^\d+$/.test(hargaInput) || parseInt(hargaInput, 10) <=0) {
            const newPromptMsg = await ctx.reply('⚠️ *Harga tidak valid.* Masukkan angka integer positif.', { parse_mode: 'Markdown' });
            if (userState[userId]) userState[userId].lastBotMessageId = newPromptMsg.message_id;
            return;
        }
        state.harga = parseInt(hargaInput);
        state.step = 'addserver_harga_reseller';
        const nextPrompt = await ctx.reply('💸 *Masukkan harga server per hari (untuk reseller), contoh: 150*', { parse_mode: 'Markdown' });
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'addserver_harga_reseller') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }

        const hargaResellerInput = ctx.message.text.trim();
        // Hapus pesan user dan bot sebelumnya
        if (userState[userId]?.lastBotMessageId) { try { await ctx.telegram.deleteMessage(ctx.chat.id, userState[userId].lastBotMessageId); } catch(e){} }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        if(userState[userId]) userState[userId].lastBotMessageId = null;

        if (!/^\d+$/.test(hargaResellerInput) || parseInt(hargaResellerInput, 10) <=0) {
            await ctx.reply('⚠️ *Harga reseller tidak valid.* Masukkan angka integer positif.', { parse_mode: 'Markdown' });
            delete userState[userId];
            return sendAdminMenu(ctx); // Kembali ke menu admin jika input tidak valid
        }
        state.harga_reseller = parseInt(hargaResellerInput);

        const { domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, harga_reseller } = state;

        db.run(
            'INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, harga_reseller, total_create_akun, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
            [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, harga_reseller],
            function (err) {
                if (err) {
                    console.error('Error saat menambahkan server (admin flow):', err.message);
                    ctx.reply('🚫 *Gagal menambahkan server baru ke database.*', { parse_mode: 'Markdown' });
                } else {
                    ctx.reply(
                        `✅ *Server ${nama_server} berhasil ditambahkan.*\n` +
                        `  - Domain: ${domain}\n  - Auth: ${auth}\n` +
                        `  - Kuota: ${quota}GB, IP Limit: ${iplimit}\n` +
                        `  - Batas Akun: ${batas_create_akun}\n` +
                        `  - Harga Member: Rp${harga}/hr, Reseller: Rp${harga_reseller}/hr`, { parse_mode: 'Markdown' });
                }
                delete userState[userId]; // Bersihkan state setelah selesai
                sendAdminMenu(ctx); // Kembali ke menu admin
            }
        );
    }

    // ==========================================================
    // ALUR 9: ADMIN - MENAMBAHKAN BUG HOST (bertahap)
    // ==========================================================
    else if (state.step === 'admin_addbug_code_input') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if (userState[userId]) userState[userId].lastBotMessageId = null;

        const bug_code = ctx.message.text.trim().toLowerCase();

        // Validasi format kode bug
        if (!bug_code || bug_code.includes(' ') || bug_code.length > 50 || !/^[a-z0-9_.-]+$/.test(bug_code)) {
            const nextPrompt = await ctx.reply('⚠️ Kode Bug tidak valid (maks 50 char, tanpa spasi, huruf kecil, angka, _.-). Ulangi:');
            if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
            return;
        }
        // Cek duplikasi kode bug
        const existing = await new Promise((resolve) => db.get('SELECT id FROM Bugs WHERE bug_code = ?', [bug_code], (_,r) => resolve(r)));
        if (existing) {
            const nextPrompt = await ctx.reply('⚠️ Kode Bug `' + escapeHtml(bug_code) + '` sudah ada. Masukkan kode unik lain:');
            if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
            return;
        }

        state.bug_code = bug_code;
        state.step = 'admin_addbug_display_name_input';
        const nextPrompt = await ctx.reply('🏷️ Masukkan Nama Tampilan Bug (cth: XL Vidio Mantap [Quiz]):');
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'admin_addbug_display_name_input') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if (userState[userId]) userState[userId].lastBotMessageId = null;

        const display_name = ctx.message.text.trim();
        // Validasi nama tampilan
        if (!display_name || display_name.length > 100 || display_name.length < 3) {
            const nextPrompt = await ctx.reply('⚠️ Nama Tampilan tidak valid (3-100 char). Ulangi:');
            if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
            return;
        }
        state.display_name = display_name;
        state.step = 'admin_addbug_address_input';
        const nextPrompt = await ctx.reply('🌍 Masukkan Alamat Bug (IP atau domain, cth: quiz.vidio.com):');
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'admin_addbug_address_input') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if (userState[userId]) userState[userId].lastBotMessageId = null;

        const bug_address = ctx.message.text.trim();
        // Validasi alamat bug
        if (!bug_address || bug_address.length > 255 || bug_address.length < 3) {
            const nextPrompt = await ctx.reply('⚠️ Alamat Bug tidak valid (3-255 char). Ulangi:');
            if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
            return;
        }
        state.bug_address = bug_address;
        state.step = 'admin_addbug_subdomain_input';
        const nextPrompt = await ctx.reply('📡 Masukkan Subdomain/SNI/Host Header Bug (opsional, ketik "kosong" atau "-" jika tidak ada):');
        if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;

    } else if (state.step === 'admin_addbug_subdomain_input') {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }
        try { await ctx.deleteMessage(ctx.message.message_id); } catch(e){}
        const botPrompt = userState[userId]?.lastBotMessageId;
        if(botPrompt) { try { await ctx.telegram.deleteMessage(ctx.chat.id, botPrompt); } catch(e){} }
        if (userState[userId]) userState[userId].lastBotMessageId = null;

        let subdomain = ctx.message.text.trim();

        // Tentukan nilai subdomain (null jika "kosong", "-", atau string kosong)
        state.bug_subdomain = (subdomain.toLowerCase() === 'kosong' || subdomain === '' || subdomain === '-') ? null : subdomain;
        // Validasi panjang jika subdomain tidak null
        if (state.bug_subdomain && (state.bug_subdomain.length > 255 || state.bug_subdomain.length < 2)) {
            const nextPrompt = await ctx.reply('⚠️ Subdomain Bug tidak valid (2-255 char, atau "kosong"). Ulangi:');
            if (userState[userId]) userState[userId].lastBotMessageId = nextPrompt.message_id;
            return;
        }

        // Tampilkan konfirmasi kepada admin sebelum menyimpan
        const confirmationMessage = `
📝 *Konfirmasi Penambahan Bug*
────────────────────
*Kode Bug:* \`${escapeHtml(state.bug_code)}\`
*Nama Tampilan:* ${escapeHtml(state.display_name)}
*Alamat Bug:* \`${escapeHtml(state.bug_address)}\`
*Subdomain/SNI:* ${state.bug_subdomain ? `\`${escapeHtml(state.bug_subdomain)}\`` : 'Tidak Ada'}
────────────────────
Simpan bug ini?`;
        state.step = 'admin_addbug_confirm'; // Ubah step untuk menunggu konfirmasi
        const confirmMsg = await ctx.reply(confirmationMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Ya, Simpan', callback_data: 'admin_addbug_save_confirm' }],
                    [{ text: '❌ Batal', callback_data: 'admin_addbug_cancel_confirm' }]
                ]
            }
        });
        if (userState[userId]) userState[userId].lastBotMessageId = confirmMsg.message_id;

    }

    // ==========================================================
    // ALUR 10: ADMIN - EDIT SERVER (input teks untuk field)
    // ==========================================================
    else if (state.step && state.step.startsWith('input_edit_')) {
        if (!adminIds.includes(String(userId))) { delete userState[userId]; return; }

        const field = state.field; // Nama field yang akan diedit (e.g., 'domain', 'harga', 'quota')
        const newValue = ctx.message.text.trim();
        const serverIdToEdit = state.serverId;

        // Hapus pesan ketikan user dan pesan prompt bot sebelumnya
        const botEditPromptId = userState[userId]?.lastBotMessageId;
        if (botEditPromptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, botEditPromptId); } catch (e) {}
            if (userState[userId]) userState[userId].lastBotMessageId = null;
        }
        try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}


        // Validasi input berdasarkan jenis field
        let isValidInput = true;
        let errorPromptMessage = '';
        if (['batas_create_akun', 'iplimit', 'quota', 'harga', 'harga_reseller'].includes(field)) {
            if (!/^\d+$/.test(newValue) || parseInt(newValue, 10) < 0) { // Harus angka non-negatif
                errorPromptMessage = `⚠️ Input untuk ${field.replace(/_/g, ' ')} harus berupa angka non-negatif. Ulangi:`;
                isValidInput = false;
            }
        } else if (['domain', 'nama_server', 'auth'].includes(field)) {
            if (newValue.length > 255) { // Batas panjang
                errorPromptMessage = `⚠️ Input untuk ${field.replace(/_/g, ' ')} terlalu panjang (maks 255 karakter). Ulangi:`;
                isValidInput = false;
            }
        }
        // Tambahkan validasi lain jika ada field dengan aturan khusus

        if (!isValidInput) {
            const newPrompt = await ctx.reply(errorPromptMessage);
            if (userState[userId]) userState[userId].lastBotMessageId = newPrompt.message_id;
            return;
        }

        try {
            let updateQuery = '';
            let displayFieldName = field.replace(/_/g, ' '); // Format nama field untuk tampilan

            // Tentukan query UPDATE berdasarkan field yang akan diedit
            switch (field) {
                case 'batas_create_akun': updateQuery = `UPDATE Server SET batas_create_akun = ? WHERE id = ?`; break;
                case 'domain': updateQuery = `UPDATE Server SET domain = ? WHERE id = ?`; break;
                case 'auth': updateQuery = `UPDATE Server SET auth = ? WHERE id = ?`; break;
                case 'nama_server': updateQuery = `UPDATE Server SET nama_server = ? WHERE id = ?`; break;
                case 'quota': updateQuery = `UPDATE Server SET quota = ? WHERE id = ?`; break;
                case 'iplimit': updateQuery = `UPDATE Server SET iplimit = ? WHERE id = ?`; break;
                case 'harga': updateQuery = `UPDATE Server SET harga = ? WHERE id = ?`; break;
                case 'harga_reseller': updateQuery = `UPDATE Server SET harga_reseller = ? WHERE id = ?`; break;
                default:
                    await ctx.reply('⚠️ Field edit tidak dikenal.');
                    delete userState[userId];
                    return sendAdminMenu(ctx); // Kembali ke menu admin jika field tidak dikenal
            }

            // Eksekusi update DB
            await new Promise((resolve, reject) => {
                db.run(updateQuery, [
                    field.includes('harga') || field.includes('quota') || field.includes('iplimit') || field.includes('batas_create_akun')
                        ? parseInt(newValue, 10) // Parse ke integer untuk angka
                        : newValue, // Gunakan string untuk teks
                    serverIdToEdit
                ], function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('Server tidak ditemukan atau nilai tidak berubah.'));
                    else resolve();
                });
            });
            await ctx.reply(`✅ ${displayFieldName.charAt(0).toUpperCase() + displayFieldName.slice(1)} untuk server ID ${serverIdToEdit} berhasil diubah menjadi: ${escapeHtml(newValue)}`);
        } catch (error) {
            console.error(`Error saat mengedit server (field: ${field}):`, error);
            await ctx.reply(`🚫 Gagal mengedit ${field.replace(/_/g, ' ')}: ${error.message}`);
        } finally {
            delete userState[userId]; // Bersihkan state
            await sendAdminMenu(ctx); // Kembali ke menu admin
        }
    }

    // ==========================================================
    // JIKA STATE TIDAK DIKENALI OLEH HANDLER TEXT
    // ==========================================================
    else {
        // Ini adalah case fallback jika ada pesan teks yang masuk
        // tetapi tidak cocok dengan alur state yang sedang aktif.
        // Anda bisa menambahkan log di sini jika diperlukan untuk debugging.
        // console.log(`Input teks tidak ditangani untuk user ${userId} dengan state:`, JSON.stringify(state), `Teks: "${ctx.message.text}"`);
    }
});

bot.action('kembali', async (ctx) => {
  const userId = ctx.from.id;
  // console.log(`User ${userId}: Tombol Kembali Umum diklik.`);
  delete userState[userId]; 
  try {
    // Coba hapus pesan saat ini (tempat tombol 'kembali' berada)
    // Jika pesan saat ini adalah pesan utama yang disimpan di userMessages, sendMainMenu akan menanganinya.
    if (ctx.callbackQuery && ctx.callbackQuery.message && userMessages[userId] !== ctx.callbackQuery.message.message_id) {
        await ctx.deleteMessage();
    } else if (ctx.callbackQuery && ctx.callbackQuery.message && !userMessages[userId]) {
        // Jika userMessages[userId] tidak ada, mungkin ini pesan sementara, coba hapus
        await ctx.deleteMessage();
    }
  } catch (e) { /* abaikan jika gagal menghapus pesan, sendMainMenu akan mengirim yang baru */ }
  await sendMainMenu(ctx); 
});


bot.action('addserver', async (ctx) => {
  try {
    console.log('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌍 *Silakan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.chat.id] = { step: 'addserver_domain' };
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('🚫 *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action('detailserver', async (ctx) => {
  try {
    console.log('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      console.log('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row = [];
      row.push({
        text: `${servers[i].nama_server}`,
        callback_data: `server_detail_${servers[i].id}`
      });
      if (i + 1 < servers.length) {
        row.push({
          text: `${servers[i + 1].nama_server}`,
          callback_data: `server_detail_${servers[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    await ctx.reply('📋 *Silakan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    console.log('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      console.log('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.domain}\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});
bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '🚫 Tidak', callback_data: 'cancel_resetdb' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Error saat memulai proses reset database:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          console.error('🚫 Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('🚫 Error saat mereset database:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚫 *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('🚫 Error saat membatalkan reset database:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('deleteserver', async (ctx) => {
  try {
    console.log('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        console.log('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('🚫 *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});


bot.action('cek_saldo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          console.error('🚫 Kesalahan saat memeriksa saldo:', err.message);
          return reject('🚫 *Terjadi kesalahan saat memeriksa saldo Anda. Silakan coba lagi nanti.*');
        }
        resolve(row);
      });
    });

    if (row) {
      await ctx.reply(`💳 *Saldo Anda saat ini adalah:* Rp${row.saldo}\n🆔 *ID Anda:* ${userId}`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('⚠️ *Anda belum memiliki saldo. Silakan tambahkan saldo terlebih dahulu.*', { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('🚫 Kesalahan saat memeriksa saldo:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    // Jika username tidak ada, gunakan first_name atau User ID sebagai fallback
    return telegramUser.username ? `@${telegramUser.username}` : telegramUser.first_name || `User ID: ${userId}`;
  } catch (err) {
    console.error('🚫 Kesalahan saat mengambil username dari Telegram:', err.message);
    return `User ID: ${userId}`; // Kembalikan User ID jika terjadi error
  }
};

async function getUserIdFromTelegram(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM Users WHERE user_id = ?', [userId], (err, row) => {
      if (err) {
        console.error('🚫 Kesalahan saat mengambil ID pengguna dari database:', err.message);
        reject(err);
      } else {
        resolve(row ? row.id : null);
      }
    });
  });
}

async function generateDynamicQris(amount, staticQrisString) {
    // Membaca data dari vars yang sudah diisi otomatis oleh script bash
    const merchantCode = vars.FT_MERCHANT_CODE; 
    const apiHash = vars.FT_HASH;
    const apiUrl = `https://pay.ftstoresz.app/create_payment?merchant=${merchantCode}&hash=${apiHash}&amount=${amount}`;

    try {
        console.log(`[QRIS_GEN] Membuat QRIS FTStores untuk Rp ${amount}`);
        const response = await axios.get(apiUrl, { timeout: 15000 });

        if (response.data && response.data.success === true) {
            const qrString = response.data.results.qr_string;
            
            // Gunakan library qrcode untuk membuat gambar
            const base64Image = await qrcode.toDataURL(qrString);
            
            console.log('[QRIS_GEN] Berhasil membuat QRIS.');
            return base64Image.split(',')[1]; 
        } else {
            console.error('[QRIS_GEN] Gagal:', response.data.message);
            throw new Error(response.data.message || 'Gagal generate QRIS');
        }
    } catch (error) {
        console.error(`[QRIS_GEN] Error: ${error.message}`);
        throw new Error('Gagal menghubungi Merchant API.');
    }
}


bot.action('addsaldo_user', async (ctx) => {
  try {
    console.log('Add saldo user process started');
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id FROM Users LIMIT 20', [], (err, users) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          console.error('🚫 Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const currentPage = 0; // Halaman saat ini
    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    if (totalUsers > 20) {
      replyMarkup.inline_keyboard.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    await ctx.reply('📊 *Silakan pilih user untuk menambahkan saldo:*', {
      reply_markup: replyMarkup,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses tambah saldo user:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20; // Menghitung offset berdasarkan halaman saat ini

  try {
    console.log(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          console.error('🚫 Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    // Menambahkan tombol navigasi
    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    console.error('🚫 Kesalahan saat memproses next users:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20; 

  try {
    console.log(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          console.error('🚫 Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    console.error('🚫 Kesalahan saat memproses previous users:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_limit_ip', async (ctx) => {
  try {
    console.log('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_limit_ip_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    console.log('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_batas_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    console.log('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_total_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_quota', async (ctx) => {
  try {
    console.log('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_quota_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_auth', async (ctx) => {
  try {
    console.log('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_auth_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌍 *Silakan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    console.log('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_harga_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('💰 *Silakan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    console.log('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_domain_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌍 *Silakan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    console.log('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_nama_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🏷️ *Silakan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`🚫 *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('topup_saldo', async (ctx) => {
  try {
    await ctx.answerCbQuery(); 
    const userId = ctx.from.id;
    console.log(`User ${userId} memulai proses top-up saldo via teks.`);

    try {
      if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.deleteMessage();
      }
    } catch (e) {
      console.warn("Gagal menghapus pesan menu topup:", e.message);
    }
    
    userState[userId] = { step: 'topup_enter_amount' };
    const minGeneralTopUp = await getMinGeneralTopUp(); 

    const promptMessage = await ctx.reply(`Silakan ketikkan jumlah nominal saldo yang ingin Anda top-up.\n\nMinimal: Rp${minGeneralTopUp.toLocaleString('id-ID')}\nContoh: \`${minGeneralTopUp}\``, {
      parse_mode: 'Markdown',
      reply_markup: { 
        inline_keyboard: [
          [{ text: '❌ Batal & Kembali ke Menu', callback_data: 'kembali' }]
        ]
      }
    });
    if (userState[userId]) { 
      userState[userId].lastBotMessageId = promptMessage.message_id;
    }

  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses top-up saldo via teks:', error);
    await ctx.reply('🚫 Gagal memulai proses top-up. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
    if (ctx.from && ctx.from.id) {
      delete userState[ctx.from.id];
    }
  }
});

bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const userStateData = userState[ctx.chat.id]; // State dari file utama

    // Handler untuk sistem input nominal via keyboard lama (jika masih dipakai)
    if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
        // Pastikan handleDepositState terdefinisi jika Anda masih menggunakan logika ini
        await handleDepositState(ctx, userId, data);
    }
    // Handler untuk manajemen BUG oleh ADMIN
    else if (data === 'admin_trigger_addbug_cmd') {
        if (!ADMIN.includes(userId)) return ctx.answerCbQuery('Unauthorized', { show_alert: true });
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch(e) {} // Hapus pesan listbugs
        // Simulasikan konteks pesan seolah-olah /addbug diketik
        ctx.message = { // Buat objek message dummy
             ...ctx.callbackQuery.message, 
             text: '/addbug', 
             from: ctx.from,
             chat: ctx.chat || ctx.callbackQuery.message.chat // Pastikan chat ada
        };
        // Cari handler untuk /addbug dan panggil
        const addBugHandler = bot.handlers.find(h => h.command === 'addbug');
        if (addBugHandler) {
            return addBugHandler.fn(ctx);
        } else {
            console.warn("Handler untuk /addbug tidak ditemukan");
        }
    } else if (data === 'admin_trigger_listbugs_cmd') {
        if (!ADMIN.includes(userId)) return ctx.answerCbQuery('Unauthorized', { show_alert: true });
        await ctx.answerCbQuery('Refreshing list...');
        // Simulasikan konteks pesan
        ctx.message = { 
            ...ctx.callbackQuery.message, 
            text: '/listbugs', 
            from: ctx.from,
            chat: ctx.chat || ctx.callbackQuery.message.chat
        };
        // Panggil handler /listbugs
        const listBugsHandler = bot.handlers.find(h => h.command === 'listbugs');
        if (listBugsHandler) {
            return listBugsHandler.fn(ctx);
        } else {
            console.warn("Handler untuk /listbugs tidak ditemukan");
        }
    } else if (data.startsWith('admin_managebug_')) {
        if (!ADMIN.includes(userId)) {
            return ctx.answerCbQuery('⚠️ Akses ditolak.', { show_alert: true });
        }
        const parts = data.split('_'); // admin_managebug_action_id
        const action = parts[2];
        const bugId = parseInt(parts[3]);

        if (isNaN(bugId)) return ctx.answerCbQuery('⚠️ ID Bug tidak valid.', { show_alert: true });

        try {
            let resultMessage = '';
            let query = '';
            let params = [bugId];
            let success = false;

            if (action === 'delete') {
                query = 'DELETE FROM Bugs WHERE id = ?';
                resultMessage = `🗑️ Bug ID ${bugId} berhasil dihapus.`;
            } else if (action === 'activate') {
                query = 'UPDATE Bugs SET is_active = 1 WHERE id = ?';
                resultMessage = `✔️ Bug ID ${bugId} berhasil diaktifkan.`;
            } else if (action === 'deactivate') {
                query = 'UPDATE Bugs SET is_active = 0 WHERE id = ?';
                resultMessage = `🚫 Bug ID ${bugId} berhasil dinonaktifkan.`;
            } else {
                return ctx.answerCbQuery('⚠️ Aksi tidak dikenal.', { show_alert: true });
            }

            await new Promise((resolve, reject) => {
                db.run(query, params, function(err) {
                    if (err) return reject(err);
                    if (this.changes === 0) return reject(new Error("Bug tidak ditemukan atau tidak ada perubahan."));
                    success = true;
                    resolve();
                });
            });
            await ctx.answerCbQuery(resultMessage);
            
            // Refresh listbugs setelah aksi
            ctx.message = { 
                ...ctx.callbackQuery.message, 
                text: '/listbugs', 
                from: ctx.from,
                chat: ctx.chat || ctx.callbackQuery.message.chat 
            };
            const listBugsHandler = bot.handlers.find(h => h.command === 'listbugs');
            if (listBugsHandler) {
                 return listBugsHandler.fn(ctx);
            }

        } catch (dbError) {
            console.error(`Error ${action} bug ID ${bugId}:`, dbError);
            await ctx.answerCbQuery(`⚠️ Gagal ${action} bug: ${dbError.message}`, { show_alert: true });
        }
    } else if (data === 'admin_addbug_save_confirm') {
        if (!ADMIN.includes(userId)) return ctx.answerCbQuery('Unauthorized', { show_alert: true });
        const state = userState[userId]; // Ambil state dari userState utama
        if (!state || state.step !== 'admin_addbug_confirm' || !state.bug_code || !state.display_name || !state.bug_address) {
            return ctx.answerCbQuery('Sesi tidak valid atau data tidak lengkap.', { show_alert: true });
        }
        try {
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO Bugs (bug_code, display_name, bug_address, bug_subdomain, is_active) VALUES (?, ?, ?, ?, 1)',
                    [state.bug_code, state.display_name, state.bug_address, state.bug_subdomain], // bug_subdomain bisa null
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });
            await ctx.editMessageText(`✅ Bug "${state.display_name}" dengan kode \`${state.bug_code}\` berhasil ditambahkan!`, {parse_mode: 'Markdown'});
        } catch (dbError) {
            console.error("Error adding bug to DB after confirmation:", dbError);
            await ctx.editMessageText('⚠️ Gagal menyimpan bug ke database.\nError: ' + dbError.message, {parse_mode: 'Markdown'});
        }
        delete userState[userId]; // Bersihkan state setelah selesai
    } else if (data === 'admin_addbug_cancel_confirm') {
        if (!ADMIN.includes(userId)) return ctx.answerCbQuery('Unauthorized', { show_alert: true });
        delete userState[userId]; // Bersihkan state
        await ctx.editMessageText('❌ Penambahan bug dibatalkan.');
    }

    // Handler untuk input keyboard nomor (jika userStateData.step cocok)
    // Ini adalah logika yang sudah ada sebelumnya untuk keyboard_nomor, keyboard_full, dll.
    else if (userStateData && userStateData.step) { // Pastikan userStateData dan step ada
        switch (userStateData.step) {
            case 'add_saldo':
                await handleAddSaldo(ctx, userStateData, data); // Pastikan handleAddSaldo terdefinisi
                break;
            case 'edit_batas_create_akun':
                await handleEditBatasCreateAkun(ctx, userStateData, data); // Pastikan handleEditBatasCreateAkun terdefinisi
                break;
            case 'edit_limit_ip':
                await handleEditiplimit(ctx, userStateData, data); // Pastikan handleEditiplimit terdefinisi
                break;
            case 'edit_quota':
                await handleEditQuota(ctx, userStateData, data); // Pastikan handleEditQuota terdefinisi
                break;
            case 'edit_auth':
                await handleEditAuth(ctx, userStateData, data); // Pastikan handleEditAuth terdefinisi
                break;
            case 'edit_domain':
                await handleEditDomain(ctx, userStateData, data); // Pastikan handleEditDomain terdefinisi
                break;
            case 'edit_harga':
                await handleEditHarga(ctx, userStateData, data); // Pastikan handleEditHarga terdefinisi
                break;
            case 'edit_nama':
                await handleEditNama(ctx, userStateData, data); // Pastikan handleEditNama terdefinisi
                break;
            case 'edit_total_create_akun':
                await handleEditTotalCreateAkun(ctx, userStateData, data); // Pastikan handleEditTotalCreateAkun terdefinisi
                break;
            case 'cek_saldo_semua': // Ini sepertinya adalah aksi langsung, bukan step input
                 if (!ADMIN.includes(userId)) return ctx.answerCbQuery('Unauthorized', { show_alert: true });
                 await handleCekSaldoSemua(ctx, userId); // Pastikan handleCekSaldoSemua terdefinisi
                 break;
            // Tambahkan case lain jika ada step lain yang menggunakan keyboard input
            default:
                // Jika state.step tidak cocok dengan case di atas,
                // mungkin itu adalah callback untuk aksi lain yang belum ditangani di sini.
                // Contohnya tombol 'kembali', 'panel_server_start', dll.
                // Logika tersebut harus sudah ada di bagian lain dari `bot.on('callback_query')` Anda.
                // console.log("Callback data tidak ditangani oleh switch userStateData.step:", data, "State:", userStateData.step);
                break; 
        }
    }
    // Tambahkan else if untuk callback data spesifik lainnya (yang tidak bergantung pada userStateData.step)
    // seperti 'kembali', 'panel_server_start', 'topup_saldo', 'admin_menu', dll.
    // Contoh:
    // else if (data === 'kembali') {
    //     await ctx.deleteMessage().catch(e => {});
    //     await sendMainMenu(ctx);
    // }
    // ... dan seterusnya untuk callback data lain dari kode asli Anda ...
    else {
        // Jika data callback tidak cocok dengan kondisi di atas,
        // ini bisa jadi adalah callback yang ditangani oleh handler Telegraf yang lebih spesifik
        // (misalnya bot.action(/regex/, ...)) atau memang belum ditangani.
        // console.log("Callback data tidak ditangani secara eksplisit di sini:", data);
    }
});



bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_harga', serverId: serverId };

  await ctx.reply('💰 *Silakan masukkan harga server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  userState[ctx.chat.id] = { step: 'add_saldo', userId: userId };

  await ctx.reply('📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_batas_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan batas create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_total_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan total create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_limit_ip', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan limit IP server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_quota', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan quota server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_auth', serverId: serverId };

  await ctx.reply('🌍 *Silakan masukkan auth server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_domain', serverId: serverId };

  await ctx.reply('🌍 *Silakan masukkan domain server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  console.log(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_nama', serverId: serverId };

  await ctx.reply('🏷️ *Silakan masukkan nama server baru:*', {
    reply_markup: { inline_keyboard: keyboard_abc() },
    parse_mode: 'Markdown'
  });
});
bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        console.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        console.log('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      console.log(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('🚫 *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          console.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      console.log('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌍 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `📊 *Quota:* \`${server.quota}\`\n` +
      `📶 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n` +
      `💵 *Harga Reseller:* \`Rp ${server.harga_reseller}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[ctx.chat.id];

  if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
    await handleDepositState(ctx, userId, data);
  } else if (userStateData) {
    switch (userStateData.step) {
      case 'add_saldo':
        await handleAddSaldo(ctx, userStateData, data);
        break;
      case 'edit_batas_create_akun':
        await handleEditBatasCreateAkun(ctx, userStateData, data);
        break;
      case 'edit_limit_ip':
        await handleEditiplimit(ctx, userStateData, data);
        break;
      case 'edit_quota':
        await handleEditQuota(ctx, userStateData, data);
        break;
      case 'edit_auth':
        await handleEditAuth(ctx, userStateData, data);
        break;
      case 'edit_domain':
        await handleEditDomain(ctx, userStateData, data);
        break;
      case 'edit_harga':
        await handleEditHarga(ctx, userStateData, data);
        break;
      case 'edit_nama':
        await handleEditNama(ctx, userStateData, data);
        break;
      case 'edit_total_create_akun':
        await handleEditTotalCreateAkun(ctx, userStateData, data);
        break;
	  case 'cek_saldo_semua': // Tambahkan case baru untuk cek saldo semua
        await handleCekSaldoSemua(ctx, userId);
        break;
    }
  }
});

async function handleCekSaldoSemua(ctx, userId) {
  if (userId != ADMIN) {
    return await ctx.reply('🚫 *Anda tidak memiliki izin untuk melihat saldo semua pengguna.*', { parse_mode: 'Markdown' });
  }

  try {
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT user_id, saldo FROM users WHERE saldo > 0 ORDER BY saldo DESC', [], (err, rows) => {
        if (err) {
          console.error('🚫 Kesalahan saat mengambil data saldo semua user:', err.message);
          return reject('🚫 *Terjadi kesalahan saat mengambil data saldo semua pengguna.*');
        }
        resolve(rows);
      });
    });

    if (!users || users.length === 0) {
      return await ctx.editMessageText('⚠️ *Tidak ada pengguna dengan saldo lebih dari Rp0,00.*', { parse_mode: 'Markdown' });
    }

    let message = '📊 *Saldo Pengguna dengan Saldo > 0:*\n\n';
    message += '```\n'; // Awal format monospace
    message += '┌──────────────┬─────────────────┐\n';
    message += '│ 🆔 User ID   │ 💳 Saldo        │\n';
    message += '├──────────────┼─────────────────┤\n';

    users.forEach(user => {
      let userId = user.user_id.toString().padEnd(12);
      let saldo = `Rp${user.saldo.toLocaleString('id-ID')},00`.padStart(15);
      message += `│ ${userId} │ ${saldo} │\n`;
    });

    message += '└──────────────┴─────────────────┘\n';
    message += '```\n'; // Akhir format monospace

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Kembali ke Main Menu', callback_data: 'send_main_menu' }]
        ]
      }
    });

  } catch (error) {
    console.error('🚫 Kesalahan saat mengambil saldo semua user:', error);
    await ctx.reply(`🚫 *Terjadi kesalahan:* ${error.message}`, { parse_mode: 'Markdown' });
  }
}

// Handler tombol kembali ke menu utama dengan transisi halus
bot.action('send_main_menu', async (ctx) => {
  try {
    await ctx.editMessageText('🔄 *Kembali ke menu utama...*', { parse_mode: 'Markdown' });
    setTimeout(async () => {
      await ctx.editMessageText('📌 *Main Menu:*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Cek Saldo', callback_data: 'cek_saldo' }],
            [{ text: '⚙️ Pengaturan', callback_data: 'settings' }]
          ]
        }
      });
    }, 1000); // Delay 1 detik untuk efek transisi
  } catch (error) {
    console.error('🚫 Error saat kembali ke main menu:', error);
  }
});




async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'delete') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }

    try {
      await updateUserSaldo(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('🚫 *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[0-9]+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
    }
    if (currentSaldo.length < 12) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 12 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditBatasCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
}

async function handleEditTotalCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
}

async function handleEditiplimit(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'iplimit', 'limit IP', 'UPDATE Server SET limit_ip = ? WHERE id = ?');
}

async function handleEditQuota(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
}

async function handleEditAuth(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
}

async function handleEditDomain(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('🚫 *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('🚫 *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silakan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditNama(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`🚫 *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silakan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE Users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], function (err) {
      if (err) {
        console.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
        reject(err);
      } else {
        resolve();
	  console.log(`mendapatkana respon ${resolve} Saldo : ${saldo} User : ${userId}`)
      }
    });
  });
}


async function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) {
        console.error(`⚠️ Kesalahan saat mengupdate ${fieldName} server:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

global.depositState = {};

// Proses top-up

topUpQueue.process(async (job) => {
    const { userId, amount, uniqueAmount, qrisMessageId } = job.data;
    const timeout = Date.now() + (15 * 60 * 1000); // Batas waktu 15 menit
    let pembayaranDiterima = false;

    console.log(`[TOPUP_POLL] Memulai proses untuk User ${userId}, Amount: ${amount}, UniqueAmount: ${uniqueAmount}`);

    // Loop pengecekan selama durasi timeout
    while (Date.now() < timeout && !pembayaranDiterima) {
        const currentUserState = userState[userId];
        // Hentikan proses jika user membatalkan (state dihapus atau messageId berubah)
        if (currentUserState?.step !== 'topup_waiting_payment' || currentUserState?.qrisMessageId !== qrisMessageId) {
            console.log(`[TOPUP_POLL] Proses untuk User ${userId} (Rp ${uniqueAmount}) dihentikan karena state berubah/dibatalkan.`);
            return;
        }

        try {
    const response = await axios.post(
        `https://qris.payment.web.id/payment/qris/${vars.OKE_API_BASE}`, // Akan membaca "OK2285905"
        {
            "username": vars.ORKUT_USERNAME, // Akan membaca "rkptr"
            "token": vars.ORKUT_TOKEN        // Akan membaca "2285905:dSCEsi..."
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'curl/7.6.80'
            },
            timeout: 25000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                ciphers: 'DEFAULT:@SECLEVEL=1'
            })
        }
    );

    // Bagian ini akan sama persis seperti kode asli Anda untuk memproses 'response'
    console.log(`[TOPUP_DEBUG] Respons mentah dari API mutasi untuk User ${userId}:`, JSON.stringify(response.data, null, 2));

    if (response.data && Array.isArray(response.data.data)) {
        // Cari transaksi yang cocok dengan jumlah unik
        const paymentFound = response.data.data.find(item => {
            const isCredit = item.type === 'CR' || item.tipe === 'CR' || item.transaction_type?.toLowerCase() === 'credit';
            const nominalApi = parseFloat(item.nominal || item.amount || 0);
            return isCredit && nominalApi === parseFloat(uniqueAmount);
        });

        if (paymentFound) {
            let apiTransactionId = paymentFound.trx_id || paymentFound.transaction_id || paymentFound.id;

            if (!apiTransactionId) {
                const description = paymentFound.keterangan || paymentFound.description || `TRX-${uniqueAmount}-${paymentFound.tanggal}`;
                apiTransactionId = crypto.createHash('sha256').update(description).digest('hex');
                console.log(`[TOPUP_POLL] ID transaksi dari API tidak ada, membuat ID cadangan dari hash: ${apiTransactionId}`);
            }

            const release = await dbMutex.acquire(); // Kunci database sebelum menulis
            try {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO processed_orkut_transactions (transaction_api_id, user_id_credited, amount_credited, processed_at) VALUES (?, ?, ?, ?)',
                        [apiTransactionId, userId, uniqueAmount, new Date().toISOString()],
                        function (err) {
                            if (err) {
                                if (err.message.includes('UNIQUE constraint failed')) {
                                    return reject(new Error('ALREADY_PROCESSED'));
                                }
                                return reject(err); // Error lain
                            }
                            resolve(); // Berhasil mengunci
                        }
                    );
                });

                console.log(`[TOPUP_POLL] ✅ Transaksi ${apiTransactionId} berhasil dikunci untuk User ${userId}. Melanjutkan proses...`);
                pembayaranDiterima = true;

                if (qrisMessageId) {
                    try { await bot.telegram.deleteMessage(userId, qrisMessageId); } catch (e) {/* abaikan jika gagal */}
                }

                const baseAmountToppedUp = amount;
                let bonusAmountApplied = 0;
                const bonusConfig = await getActiveBonusConfig();

                if (bonusConfig && baseAmountToppedUp >= bonusConfig.min_topup_amount) {
                    bonusAmountApplied = calculateBonusAmount(baseAmountToppedUp, bonusConfig);
                }
                const totalAmountToCredit = baseAmountToppedUp + bonusAmountApplied;

                await new Promise((resolve, reject) => {
                    db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [totalAmountToCredit, userId], (err) => {
                        if (err) return reject(new Error(`Gagal update saldo DB untuk user ${userId}: ${err.message}`));
                        resolve();
                    });
                });

                await checkAndUpdateUserRole(userId, baseAmountToppedUp);
                await recordUserTransaction(userId);

                const userInfo = await bot.telegram.getChat(userId).catch(() => ({}));
                const username = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || `User ${userId}`);

                await sendUserNotificationTopup(userId, baseAmountToppedUp, uniqueAmount, bonusAmountApplied);
                await sendAdminNotificationTopup(username, userId, baseAmountToppedUp, uniqueAmount, bonusAmountApplied);
                await sendGroupNotificationTopup(username, userId, baseAmountToppedUp, uniqueAmount, bonusAmountApplied);

                await sendMainMenuToUser(userId);

            } catch (dbError) {
                if (dbError.message === 'ALREADY_PROCESSED') {
                    console.log(`[TOPUP_POLL] Transaksi ${apiTransactionId} sudah pernah diproses. Diabaikan untuk User ${userId}.`);
                    pembayaranDiterima = true; // Anggap selesai agar loop berhenti
                } else {
                    console.error(`[TOPUP_POLL] KRITIS: Pembayaran terdeteksi TAPI gagal proses DB untuk User ${userId}:`, dbError);
                    bot.telegram.sendMessage(ADMIN, `🔴 KRITIS: Pembayaran Rp${uniqueAmount} untuk User ${userId} terdeteksi tapi GAGAL diproses di DB. Harap periksa manual! Error: ${dbError.message}`).catch(()=>{});
                    pembayaranDiterima = true; // Hentikan loop untuk mencegah error berulang
                }
            } finally {
                release(); // Selalu lepaskan kunci database
            }
        }
    }
} catch (apiError) {
    // --- INI BLOK LOGGING ERROR YANG LEBIH DETAIL ---
    console.error(`[TOPUP_POLL] Gagal mengambil mutasi dari API.`);
    if (apiError.response) {
        // Server merespons dengan status error (4xx, 5xx)
        console.error(`[TOPUP_POLL] Status: ${apiError.response.status}`);
        console.error(`[TOPUP_POLL] Headers:`, JSON.stringify(apiError.response.headers, null, 2));
        console.error(`[TOPUP_POLL] Data:`, JSON.stringify(apiError.response.data, null, 2));
    } else if (apiError.request) {
        // Request dibuat tapi tidak ada respons
        console.error('[TOPUP_POLL] Tidak ada respons yang diterima dari server.');
    } else {
        // Error lain saat setup request
        console.error('[TOPUP_POLL] Error saat setup request:', apiError.message);
    }
}
        
        // Tunggu sebelum pengecekan berikutnya jika pembayaran belum diterima
        if (!pembayaranDiterima) {
            await new Promise((resolve) => setTimeout(resolve, 20000)); // Cek setiap 20 detik
        }
    } // Akhir loop `while`

    // Jika setelah timeout pembayaran tetap tidak ditemukan
    if (!pembayaranDiterima) {
        const finalUserState = userState[userId];
        // Pastikan proses dibatalkan hanya jika sesi top-up ini masih aktif
        if (finalUserState?.step === 'topup_waiting_payment' && finalUserState?.qrisMessageId === qrisMessageId) {
            console.log(`[TOPUP_POLL] 🚫 Pembayaran tidak ditemukan untuk User ${userId} (Rp ${uniqueAmount}) - TIMEOUT.`);
            if (qrisMessageId) {
                try { await bot.telegram.deleteMessage(userId, qrisMessageId); } catch (e) {}
            }
            try {
                await bot.telegram.sendMessage(userId, '🚫 Top-up QRIS gagal karena melewati batas waktu pembayaran. Jika Anda sudah transfer, silakan hubungi admin untuk pengecekan manual.');
                await sendMainMenuToUser(userId); // Kirim menu utama lagi
            } catch (e) {
                console.error(`[TOPUP_POLL] Gagal kirim notif timeout ke ${userId}: ${e.message}`);
            }
        }
    }

    // Bersihkan state setelah proses selesai (berhasil, gagal, atau timeout)
    const latestState = userState[userId];
    if (latestState && latestState.qrisMessageId === qrisMessageId) {
        delete userState[userId];
    }
});


async function getMinGeneralTopUp() {
  return new Promise((resolve) => {
    db.get('SELECT value FROM system_settings WHERE key = ?', ['min_general_topup'], (err, row) => {
      if (err || !row || !row.value || isNaN(parseInt(row.value, 10))) {
        // Jika error, tidak ada, atau bukan angka, resolve dengan default
        db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['min_general_topup', DEFAULT_MIN_GENERAL_TOPUP.toString()]);
        resolve(DEFAULT_MIN_GENERAL_TOPUP);
      } else {
        resolve(parseInt(row.value, 10));
      }
    });
  });
}

// Fungsi untuk mendapatkan minimal topup untuk upgrade reseller dari database
async function getMinResellerUpgradeTopUp() {
  return new Promise((resolve) => {
    db.get('SELECT value FROM system_settings WHERE key = ?', ['min_reseller_upgrade_topup'], (err, row) => {
      if (err || !row || !row.value || isNaN(parseInt(row.value, 10))) {
        // Jika error, tidak ada, atau bukan angka, resolve dengan default
        db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', ['min_reseller_upgrade_topup', DEFAULT_MIN_RESELLER_UPGRADE_TOPUP.toString()]);
        resolve(DEFAULT_MIN_RESELLER_UPGRADE_TOPUP);
      } else {
        resolve(parseInt(row.value, 10));
      }
    });
  });
}

// Panggil fungsi ini sekali saat bot startup untuk memastikan nilai default ada jika diperlukan.
// Sebaiknya diletakkan setelah koneksi DB berhasil dan sebelum bot.launch()
async function initializeDefaultSettings() {
    console.log("Memeriksa dan menginisialisasi pengaturan minimal top-up default jika perlu...");
    await getMinGeneralTopUp(); // Fungsi ini akan otomatis set default jika tidak ada
    await getMinResellerUpgradeTopUp(); // Sama seperti di atas
    console.log("Inisialisasi pengaturan minimal top-up selesai.");
}

const activePolls = new Map(); 

/**
 * Memeriksa status pembayaran di API mutasi ORKUT.
 * @param {object} ctx - Konteks Telegraf.
 * @param {number} userId - ID pengguna.
 * @param {number} uniqueAmount - Jumlah unik yang harus dicari.
 * @param {number} baseAmount - Jumlah asli sebelum kode unik.
 * @param {number} qrisMessageId - ID pesan QRIS untuk dihapus.
 */
async function checkOrkutPaymentStatus(ctx, userId, uniqueAmount, baseAmount, qrisMessageId) {
    const pollId = `${userId}-${uniqueAmount}`;
    if (activePolls.has(pollId)) return; // Hindari polling ganda

    const ORKUT_API_URL = `https://api.xlsmart.biz.id/payment/qris/${vars.ORKUT_MERCHANT_ID}`;
    const maxDurationMs = 15 * 60 * 1000; // Batas waktu 15 menit
    const interval = 20000; // Cek setiap 20 detik
    const startTime = Date.now();

    const pollingLoop = async () => {
        if (!activePolls.has(pollId)) {
            console.log(`[ORKUT_POLL] Polling untuk ${pollId} dihentikan (dibatalkan).`);
            return;
        }

        if (Date.now() - startTime > maxDurationMs) {
            console.log(`[ORKUT_POLL] Polling untuk ${pollId} timeout.`);
            activePolls.delete(pollId);
            try { await ctx.telegram.deleteMessage(userId, qrisMessageId); } catch (e) {}
            await ctx.telegram.sendMessage(userId, '🚫 TopUp QRIS Gagal karena melewati batas waktu pembayaran.');
            return sendMainMenu(ctx);
        }

        try {
            const response = await axios.post(ORKUT_API_URL, {
                username: vars.ORKUT_USERNAME,
                token: vars.ORKUT_TOKEN
            });

            if (response.data && Array.isArray(response.data.data)) {
                const paymentFound = response.data.data.find(item =>
                    (item.type === 'CR' || item.tipe === 'CR') &&
                    parseFloat(item.nominal || item.amount) === parseFloat(uniqueAmount)
                );

                if (paymentFound) {
                    console.log(`[ORKUT_POLL] ✅ Pembayaran ditemukan untuk ${pollId}`);
                    activePolls.delete(pollId);

                    try { await ctx.telegram.deleteMessage(userId, qrisMessageId); } catch (e) {}

                    const bonusConfig = await getActiveBonusConfig();
                    let bonusAmountApplied = 0;
                    if (bonusConfig && baseAmount >= bonusConfig.min_topup_amount) {
                        bonusAmountApplied = calculateBonusAmount(baseAmount, bonusConfig);
                    }
                    const totalAmountToCredit = baseAmount + bonusAmountApplied;

                    await new Promise((resolve, reject) => {
                        db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [totalAmountToCredit, userId], (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });

                    await checkAndUpdateUserRole(userId, baseAmount);
                    await recordUserTransaction(userId);
                    
                    const username = (await bot.telegram.getChat(userId)).username || `User ${userId}`;
                    await sendUserNotificationTopup(userId, baseAmount, uniqueAmount, bonusAmountApplied);
                    await sendAdminNotificationTopup(username, userId, baseAmount, uniqueAmount, bonusAmountApplied);
                    await sendGroupNotificationTopup(username, userId, baseAmount, uniqueAmount, bonusAmountApplied);
                    return sendMainMenu(ctx);
                }
            }
        } catch (error) {
            console.error(`[ORKUT_POLL] Error saat polling untuk ${pollId}:`, error.message);
        }
        
        // Jadwalkan pengecekan berikutnya jika masih aktif
        if (activePolls.has(pollId)) {
            const timeoutId = setTimeout(pollingLoop, interval);
            activePolls.set(pollId, timeoutId);
        }
    };

    activePolls.set(pollId, setTimeout(pollingLoop, 5000)); // Mulai polling setelah 5 detik
}

// Handler untuk tombol "Batalkan Top Up"
bot.action('cancel_topup_qris', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];

    if (state && state.step === 'topup_waiting_payment') {
        // Hapus state untuk memberi sinyal pada queue agar berhenti
        delete userState[userId]; 
        
        await ctx.answerCbQuery('Permintaan top-up dibatalkan.');
        try {
            // Hapus pesan QRIS yang sedang ditampilkan
            await ctx.deleteMessage(); 
        } catch (e) {
            console.warn("Gagal hapus pesan QRIS saat batal:", e.message);
        }
        
        await ctx.reply("Top-up dibatalkan. Kembali ke menu utama.");
        await sendMainMenu(ctx);
    } else {
        await ctx.answerCbQuery('Tidak ada top-up aktif untuk dibatalkan.', { show_alert: true });
        try { await ctx.deleteMessage(); } catch(e){}
        await sendMainMenu(ctx);
    }
});

bot.action('send_main_menu', async (ctx) => {
  console.log('Tombol Kembali ke Menu Utama diklik oleh:', ctx.from.id);

  try {
    // Coba hapus pesan menu saat ini
    try {
      await ctx.deleteMessage();
      console.log('Pesan menu dihapus.');
    } catch (deleteError) {
      console.warn('Tidak dapat menghapus pesan:', deleteError.message);
      // Jika pesan tidak dapat dihapus, lanjutkan tanpa menghapus
    }

    // Tampilkan menu utama
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('Gagal memproses permintaan:', error);
    await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.', { parse_mode: 'Markdown' });
  }
});
function keyboard_nomor() {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [' ', '0', '⌫ Hapus'], // Spasi untuk menjaga posisi angka 0
    ['✅ Konfirmasi'],
    ['🔙 Kembali ke Menu Utama']
  ];

  return rows.map(row => row
    .filter(text => text !== ' ') // Hapus elemen kosong agar tidak ada tombol kosong
    .map(text => ({
      text,
      callback_data: text.replace('⌫ Hapus', 'delete')
                         .replace('✅ Konfirmasi', 'confirm')
                         .replace('🔙 Kembali ke Menu Utama', 'send_main_menu')
    }))
  );
}




app.post('/callback/paydisini', async (req, res) => {
  console.log('Request body:', req.body); // Log untuk debugging
  const { unique_code, status } = req.body;

  if (!unique_code || !status) {
      return res.status(400).send('⚠️ *Permintaan tidak valid*');
  }

  const depositInfo = global.pendingDeposits[unique_code];
  if (!depositInfo) {
      return res.status(404).send('Jumlah tidak ditemukan untuk kode unik');
  }

  const amount = depositInfo.amount;
  const userId = depositInfo.userId;

  try {
      const [prefix, user_id] = unique_code.split('-');
      if (prefix !== 'user' || !user_id) {
          return res.status(400).send('Format kode unik tidak valid');
      }

      if (status === 'Success') {

          db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, user_id], function(err) {
              if (err) {
                  console.error(`Kesalahan saat memperbarui saldo untuk user_id: ${user_id}, amount: ${JSON.stringify(amount)}`, err.message);
                  return res.status(500).send('Kesalahan saat memperbarui saldo');
              }
              console.log(`✅ Saldo berhasil diperbarui untuk user_id: ${user_id}, amount: ${JSON.stringify(amount)}`);

              delete global.pendingDeposits[unique_code];

              db.get("SELECT saldo FROM users WHERE user_id = ?", [user_id], (err, row) => {
                  if (err) {
                      console.error('⚠️ Kesalahan saat mengambil saldo terbaru:', err.message);
                      return res.status(500).send('⚠️ Kesalahan saat mengambil saldo terbaru');
                  }
                  const newSaldo = row.saldo;
                  const message = `✅ Deposit berhasil!\n\n💰 Jumlah: Rp ${amount}\n💵 Saldo sekarang: Rp ${newSaldo}`;
                
                  const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
                  axios.post(telegramUrl, {
                      chat_id: user_id,
                      text: message
                  }).then(() => {
                      console.log(`✅ Pesan konfirmasi deposit berhasil dikirim ke ${user_id}`);
                      return res.status(200).send('✅ *Saldo berhasil ditambahkan*');
                  }).catch((error) => {
                      console.error(`⚠️ Kesalahan saat mengirim pesan ke Telegram untuk user_id: ${user_id}`, error.message);
                      return res.status(500).send('⚠️ *Kesalahan saat mengirim pesan ke Telegram*');
                  });
              });
          });
      } else {
          console.log(`⚠️ Penambahan saldo gagal untuk unique_code: ${unique_code}`);
          return res.status(200).send('⚠️ Penambahan saldo gagal');
      }
  } catch (error) {
      console.error('⚠️ Kesalahan saat memproses penambahan saldo:', error.message);
      return res.status(500).send('⚠️ Kesalahan saat memproses penambahan saldo');
  }
});

// Menjalankan pengecekan kuota reseller otomatis setiap 24 jam
const CHECK_RESELLER_QUOTA_INTERVAL_MS = 24 * 60 * 60 * 1000; 
setInterval(checkResellerAccountQuota, CHECK_RESELLER_QUOTA_INTERVAL_MS);
console.log(`[OTOMATIS] Pengecekan kuota reseller otomatis akan berjalan setiap 24 jam.`);

// Panggil sekali saat startup untuk menangani kasus jika bot mati lebih dari sehari
// Tambahkan delay sedikit agar bot sempat connect sebelum menjalankan check berat
setTimeout(() => {
    checkResellerAccountQuota(); 
}, 30000); // Delay 30 detik setelah startup


// ==========================================================
// KODE API UNTUK WEBSITE DASHBOARD
// Letakkan semua kode di bawah ini di file app.js Anda
// ==========================================================

// Ganti seluruh blok app.post('/api/register', ...) Anda dengan yang ini.

app.post('/api/register', async (req, res) => {
    const { telegramId, username, password } = req.body;

    if (!telegramId || !username || !password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'ID Telegram, Username, dan Password (min 6 karakter) wajib diisi.' });
    }
    
    if (isNaN(parseInt(telegramId))) {
        return res.status(400).json({ success: false, message: 'ID Telegram harus berupa angka.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Cek apakah user dengan ID Telegram ini sudah ada (pernah pakai bot)
        db.get('SELECT id, username FROM users WHERE user_id = ?', [telegramId], (err, existingUser) => {
            if (err) {
                console.error("DB Error on register check:", err);
                return res.status(500).json({ success: false, message: 'Error database.' });
            }

            if (existingUser) {
                // JIKA USER SUDAH ADA (DARI BOT), UPDATE AKUN MEREKA DENGAN USERNAME & PASSWORD WEB
                db.run('UPDATE users SET username = ?, password = ? WHERE user_id = ?', 
                    [username, hashedPassword, telegramId], function(updateErr) {
                    if (updateErr) {
                         // Kemungkinan username web sudah dipakai orang lain
                        return res.status(500).json({ success: false, message: 'Gagal menghubungkan akun. Username web ini mungkin sudah terdaftar.' });
                    }
                    res.json({ success: true, message: 'Akun Telegram berhasil dihubungkan! Silakan login.' });
                });
            } else {
                // JIKA USER BENAR-BENAR BARU, BUAT AKUN BARU
                db.run('INSERT INTO users (user_id, username, password, role) VALUES (?, ?, ?, ?)',
                    [telegramId, username, hashedPassword, 'member'], function(insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ success: false, message: 'Gagal mendaftarkan akun. Username web ini mungkin sudah terdaftar.' });
                    }
                    res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
                });
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});


// Middleware untuk memeriksa apakah pengguna sudah login
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next(); // Lanjutkan jika sudah login
    }
    // Kirim error jika belum login
    res.status(401).json({ success: false, message: 'Unauthorized: Anda harus login.' });
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
    }

    // Cari pengguna berdasarkan username yang mereka masukkan
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user || !user.password) {
            // Jangan beri tahu jika username atau password yang salah, lebih aman begini.
            return res.status(401).json({ success: false, message: 'Kombinasi username dan password salah.' });
        }

        // Bandingkan password yang diinput dengan hash di database
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // Jika cocok, simpan info user di sesi
            req.session.user = {
                id: user.id, // Primary Key dari tabel
                user_id: user.user_id, // ID asli (Telegram)
                username: user.username,
                role: user.role
            };
            // Kirim respons sukses ke browser
            res.json({ success: true, message: 'Login berhasil.' });
        } else {
            // Jika password tidak cocok
            res.status(401).json({ success: false, message: 'Kombinasi username dan password salah.' });
        }
    });
});


// ========================================================
// TAMBAHKAN DUA API BERIKUT INI DI DALAM app.js ANDA
// Letakkan di bawah API '/api/create-account'
// ========================================================

/**
 * API untuk memulai permintaan Top Up.
 * Frontend mengirim jumlah, backend merespons dengan detail pembayaran QRIS.
 */
app.post('/api/topup/request', isAuthenticated, async (req, res) => {
    const { amount } = req.body;
    const userId = req.session.user.user_id;

    const amountNumber = parseInt(amount, 10);
    if (isNaN(amountNumber) || amountNumber <= 0) {
        return res.status(400).json({ success: false, message: "Jumlah top up tidak valid." });
    }

    try {
        const minTopUp = await getMinGeneralTopUp();
        if (amountNumber < minTopUp) {
            return res.status(400).json({ success: false, message: `Jumlah top up minimal adalah Rp${minTopUp.toLocaleString('id-ID')}.` });
        }

        // Gunakan logika yang sama dengan bot untuk membuat jumlah unik
        const randomSuffix = Math.floor(Math.random() * (999 - 100 + 1) + 100);
        const uniqueAmount = amountNumber + randomSuffix;

        const base64Qris = await generateDynamicQris(uniqueAmount, QRIS_STATIS_STRING);
        
        // Tambahkan job ke antrian untuk memverifikasi pembayaran
        await topUpQueue.add({
            userId,
            amount: amountNumber,
            uniqueAmount: uniqueAmount,
            qrisMessageId: null // Tidak ada pesan Telegram untuk dihapus
        });

        // Kirim detail pembayaran kembali ke frontend
        res.json({
            success: true,
            message: "Silakan scan QRIS di bawah ini.",
            data: {
                uniqueAmount: uniqueAmount,
                qrisBase64: base64Qris,
            }
        });

    } catch (error) {
        console.error("API /api/topup/request error:", error);
        res.status(500).json({ success: false, message: error.message || "Gagal membuat permintaan top up." });
    }
});


/**
 * API untuk menghapus akun (baik langganan maupun PAYG).
 */
app.post('/api/delete-account', isAuthenticated, async (req, res) => {
    const { accountId, accountType } = req.body;
    const sessionUserId = req.session.user.user_id;

    if (!accountId || !accountType) {
        return res.status(400).json({ success: false, message: "Data akun tidak lengkap." });
    }

    try {
        if (accountType === 'fixed') {
            // Logika untuk akun langganan (dengan refund)
      const data = await new Promise((resolve, reject) => {
        const query = `
          SELECT ca.*, s.harga, s.harga_reseller, s.nama_server, s.hidden AS server_hidden, u.role
          FROM created_accounts ca 
          JOIN Server s ON ca.server_id = s.id
          JOIN users u ON ca.created_by_user_id = u.user_id
          WHERE ca.id = ?`;
        db.get(query, [accountId], (err, row) => err ? reject(err) : resolve(row));
      });

      if (!data || data.created_by_user_id !== sessionUserId) {
                return res.status(403).json({ success: false, message: "Akses ditolak. Ini bukan akun Anda." });
            }

      // Jika server tempat akun berada sedang disembunyikan, larang penghapusan lewat UI/web
      if (data.server_hidden === 1) {
        return res.status(400).json({ success: false, message: "Server ditutup sementara - penghapusan akun tidak diizinkan saat server ditutup." });
      }

            const hargaPerHari = data.role === 'reseller' ? data.harga_reseller : data.harga;
            const totalHargaAwal = calculatePrice(hargaPerHari, data.duration_days);
            const hariTerpakai = Math.max(1, Math.ceil((new Date().getTime() - new Date(data.creation_date).getTime()) / (1000 * 60 * 60 * 24)));
            const biayaTerpakai = hariTerpakai * hargaPerHari;
            let refundAmount = Math.max(0, Math.floor((totalHargaAwal - biayaTerpakai) / 100) * 100);

            await callDeleteAPI(data.protocol, data.account_username, data.server_id);
            
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run("BEGIN;");
                    if (refundAmount > 0) {
                        db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [refundAmount, sessionUserId]);
                    }
                    db.run("UPDATE Server SET total_create_akun = total_create_akun - 1 WHERE id = ? AND total_create_akun > 0", [data.server_id]);
                    db.run("DELETE FROM created_accounts WHERE id = ?", [accountId]);
                    db.run("COMMIT;", (err) => err ? reject(err) : resolve());
                });
            });
            await adjustResellerQuotaOnDelete(data);
            await sendDeleteRefundNotification(sessionUserId, data, refundAmount);

            res.json({ success: true, message: `Akun ${data.account_username} berhasil dihapus. Saldo Rp${refundAmount.toLocaleString('id-ID')} telah dikembalikan.` });

    } else if (accountType === 'payg') {
      // Untuk PAYG, cek apakah server sesi ini sedang disembunyikan; jika ya, larang penghentian via web
      const sessionInfo = await new Promise((resolve, reject) => {
        const q = `SELECT ps.*, s.hidden AS server_hidden, s.nama_server FROM payg_sessions ps JOIN Server s ON ps.server_id = s.id WHERE ps.id = ?`;
        db.get(q, [accountId], (err, row) => err ? reject(err) : resolve(row));
      });

      if (!sessionInfo) return res.status(404).json({ success: false, message: 'Sesi PAYG tidak ditemukan.' });
      if (sessionInfo.server_hidden === 1) {
        return res.status(400).json({ success: false, message: 'Server ditutup sementara - penghentian sesi PAYG via web tidak diizinkan saat server ditutup.' });
      }

      // Untuk PAYG, kita cukup panggil fungsi stopPaygSession yang sudah ada
      const success = await stopPaygSession(accountId, 'Dihentikan oleh pengguna via web');
      if (success) {
        res.json({ success: true, message: `Layanan Pay As You Go berhasil dihentikan.` });
      } else {
        throw new Error("Gagal menghentikan sesi Pay As You Go.");
      }
        } else {
            return res.status(400).json({ success: false, message: "Tipe akun tidak dikenal." });
        }
    } catch (error) {
        console.error("API /api/delete-account error:", error);
        res.status(500).json({ success: false, message: error.message || 'Gagal menghapus akun.' });
    }
});

// API untuk mendapatkan data user yang sedang login
app.get('/api/user/me', isAuthenticated, (req, res) => {
    // Ambil data terbaru dari DB untuk memastikan saldo dll update
    db.get('SELECT user_id, username, saldo, role FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        res.json({ success: true, user: user });
    });
});

// API untuk mendapatkan daftar server
app.get('/api/servers', isAuthenticated, async (req, res) => {
    try {
        // Panggil fungsi `getServerList` yang sudah ada!
        const servers = await getServerList(req.session.user.user_id);
        res.json({ success: true, data: servers });
    } catch (error) {
        console.error("API /api/servers error:", error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar server.' });
    }
});

// API untuk mendapatkan daftar akun aktif milik pengguna
app.get('/api/my-accounts', isAuthenticated, async (req, res) => {
    const userId = req.session.user.user_id;
    try {
    // Mengambil akun langganan (fixed) - sertakan status server_hidden sehingga frontend dapat menandai akun jika server disembunyikan
    const fixedAccounts = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 'fixed' as type, ca.id, ca.account_username, ca.protocol, ca.expiry_date, s.nama_server, s.hidden AS server_hidden
        FROM created_accounts ca JOIN Server s ON ca.server_id = s.id
        WHERE ca.created_by_user_id = ? AND ca.is_active = 1 AND date(ca.expiry_date) > date('now', 'localtime')
      `, [userId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

        // Mengambil akun Pay-As-You-Go (payg)
    const paygAccounts = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 'payg' as type, ps.id, ps.account_username, ps.protocol, s.nama_server, s.hidden AS server_hidden, ps.is_paused
        FROM payg_sessions ps JOIN Server s ON ps.server_id = s.id
        WHERE ps.user_id = ? AND ps.is_active = 1
      `, [userId], (err, rows) => err ? reject(err) : resolve(rows || []));
    });

        res.json({ success: true, data: [...fixedAccounts, ...paygAccounts] });
    } catch (error) {
        console.error("API /api/my-accounts error:", error);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar akun Anda.' });
    }
});

// API untuk membuat akun
// GANTI SELURUH BLOK app.post('/api/create-account', ...) LAMA ANDA DENGAN YANG INI.

app.post('/api/create-account', isAuthenticated, async (req, res) => {
    // Menambahkan 'accountType' dari body request
    const { serverId, protocol, username, password, exp, accountType } = req.body;
    const sessionUser = req.session.user;

    try {
        // Validasi input dasar
        if (!serverId || !protocol || !username || !accountType) {
            return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
        }
        if (protocol === 'ssh' && !password) {
            return res.status(400).json({ success: false, message: 'Password diperlukan untuk SSH.' });
        }

        // Ambil data user dan server
        const user = await new Promise((resolve, reject) => db.get('SELECT saldo, role FROM users WHERE id = ?', [sessionUser.id], (err, row) => err ? reject(new Error('Gagal mengambil data user')) : resolve(row)));
        const server = await new Promise((resolve, reject) => db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => err ? reject(new Error('Gagal mengambil data server')) : resolve(row)));
        
        if (!user || !server) {
            return res.status(404).json({ success: false, message: 'User atau Server tidak ditemukan.' });
        }
    // Jika server disembunyikan oleh admin, tolak operasi pembuatan akun
    if (server.hidden === 1 || server.hidden === '1') {
      return res.status(400).json({ success: false, message: 'Server yang dipilih sedang disembunyikan oleh admin. Pembuatan akun tidak diperbolehkan.' });
    }
        if (server.total_create_akun >= server.batas_create_akun) {
            return res.status(400).json({ success: false, message: 'Server yang dipilih sudah penuh.' });
        }

        // --- Logika Baru: Membedakan antara PAYG dan Langganan ---
        
        if (accountType === 'payg') {
            // == LOGIKA UNTUK PAY AS YOU GO ==
            const hargaPerHari = user.role === 'reseller' ? server.harga_reseller : server.harga;
            const hourlyRate = Math.ceil(hargaPerHari / 24);

            if (user.saldo < hourlyRate + PAYG_MINIMUM_BALANCE_THRESHOLD) {
                return res.status(400).json({ success: false, message: `Saldo tidak cukup untuk PAYG. Dibutuhkan min. Rp${(hourlyRate + PAYG_MINIMUM_BALANCE_THRESHOLD).toLocaleString('id-ID')}.` });
            }

            const createFn = { 
    ssh: createssh, 
    vmess: createvmess, 
    vless: createvless, 
    trojan: createtrojan,
    hysteria: createhysteria // <--- TAMBAHAN
}[protocol];
            const resultMessage = (protocol === 'ssh')
                ? await createFn(username, password, 3650, server.iplimit, serverId, true) // Expiry panjang, isPayg = true
                : await createFn(username, 3650, server.quota, server.iplimit, serverId, true);

            if (typeof resultMessage === 'string' && resultMessage.toLowerCase().includes("gagal")) throw new Error(resultMessage);
            
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run("BEGIN;");
                    db.run('UPDATE users SET saldo = saldo - ? WHERE id = ?', [hourlyRate, sessionUser.id]);
                    db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId]);
                    db.run('INSERT INTO payg_sessions (user_id, server_id, account_username, protocol, hourly_rate, last_billed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [sessionUser.user_id, serverId, username, protocol, hourlyRate, new Date().toISOString(), new Date().toISOString()]);
                    db.run("COMMIT;", err => err ? reject(err) : resolve());
                });
            });

            await sendPaygPurchaseNotification(sessionUser.user_id, username, protocol, server.nama_server, hourlyRate);
            res.json({ success: true, message: `Layanan Pay As You Go untuk ${username} berhasil diaktifkan!`, details: resultMessage });

        } else {
            // == LOGIKA UNTUK LANGGANAN (FIXED-TERM) - sama seperti sebelumnya ==
            const expDays = parseInt(exp, 10);
            if (!expDays || expDays <= 0) {
                 return res.status(400).json({ success: false, message: 'Durasi masa aktif tidak valid.' });
            }
            const hargaPerHari = user.role === 'reseller' ? server.harga_reseller : server.harga;
            const totalHarga = calculatePrice(hargaPerHari, expDays);

            if (user.saldo < totalHarga) {
                return res.status(400).json({ success: false, message: `Saldo tidak cukup. Dibutuhkan Rp${totalHarga.toLocaleString('id-ID')}.` });
            }

            const createFn = { 
    ssh: createssh, 
    vmess: createvmess, 
    vless: createvless, 
    trojan: createtrojan,
    hysteria: createhysteria // <--- TAMBAHAN
}[protocol];
            const resultMessage = (protocol === 'ssh')
                ? await createFn(username, password, expDays, server.iplimit, serverId)
                : await createFn(username, expDays, server.quota, server.iplimit, serverId);

            if (typeof resultMessage === 'string' && (resultMessage.toLowerCase().includes("gagal"))) throw new Error(resultMessage);
            
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + expDays);
            
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run("BEGIN;");
                    db.run('UPDATE users SET saldo = saldo - ? WHERE id = ?', [totalHarga, sessionUser.id]);
                    db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId]);
                    db.run('INSERT INTO created_accounts (server_id, account_username, protocol, created_by_user_id, expiry_date, is_active, creation_date, duration_days) VALUES (?, ?, ?, ?, ?, 1, ?, ?)', [serverId, username, protocol, sessionUser.user_id, expiryDate.toISOString(), new Date().toISOString(), expDays]);
                    db.run("COMMIT;", err => err ? reject(err) : resolve());
                });
            });

            await updateUserAccountCreation(sessionUser.user_id);
            await recordUserTransaction(sessionUser.user_id);
            res.json({ success: true, message: 'Akun berhasil dibuat!', details: resultMessage });
        }
    } catch (error) {
        console.error("API /api/create-account error:", error);
        res.status(500).json({ success: false, message: error.message || 'Terjadi kesalahan internal.' });
    }
});

app.get('/api/bugs', isAuthenticated, async (req, res) => {
    try {
        const bugs = await new Promise((resolve, reject) => {
            db.all("SELECT id, display_name FROM Bugs WHERE is_active = 1 ORDER BY display_name", [], (err, rows) => {
                if (err) return reject(new Error('Gagal mengambil data bug dari database.'));
                resolve(rows || []);
            });
        });
        res.json({ success: true, data: bugs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/inject-bug', isAuthenticated, async (req, res) => {
    const { accountLink, bugId } = req.body;

    if (!accountLink || !bugId) {
        return res.status(400).json({ success: false, message: 'Link akun dan Bug harus diisi.' });
    }

    try {
        const bug = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM Bugs WHERE id = ?", [bugId], (err, row) => err ? reject(err) : resolve(row));
        });

        if (!bug) {
            return res.status(404).json({ success: false, message: 'Data bug tidak ditemukan.' });
        }
        
        // Panggil fungsi dari generate.js untuk melakukan pekerjaan!
        const newConfig = injectBugToLink(accountLink, bug);
        
        // Kirim hasilnya ke frontend
        res.json({ success: true, newConfig: newConfig });

    } catch (error) {
        console.error("API /api/inject-bug error:", error);
        res.status(500).json({ success: false, message: error.message || 'Gagal memproses link akun. Pastikan formatnya benar.' });
    }
});



// API untuk Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Gagal untuk logout." });
        }
        res.json({ success: true, message: 'Logout berhasil.' });
    });
});

app.listen(port, () => {
  initializeDefaultSettings().then(() => { // Panggil di sini
    // Hanya jalankan bot jika BOT_TOKEN telah dikonfigurasi dengan nilai nyata
    if (typeof BOT_TOKEN === 'string' && BOT_TOKEN.length > 20 && !BOT_TOKEN.includes('ISI_DENGAN') && !BOT_TOKEN.includes('TOKEN')) {
      bot.launch().then(() => {
        // Panggil reset saat startup untuk menangani jika bot offline saat jadwal cron
        resetAccountsCreated30Days(); // Panggil tanpa forceRun
        console.log('Bot telah dimulai');
      }).catch((error) => {
        console.error('Error Kritis saat memulai bot (bot.launch()):', error);
        // Jangan keluar otomatis; beri tahu saja dan biarkan server tetap berjalan
      });
    } else {
      console.warn('BOT_TOKEN tidak terisi atau tampak placeholder; melewatkan bot.launch() — isi BOT_TOKEN di .vars.json jika ingin mengaktifkan bot.');
    }
    console.log(`Server berjalan di port ${port}`);
  }).catch(initError => {
    console.error("FATAL ERROR saat inisialisasi pengaturan default:", initError);
    process.exit(1);
  });
});

// Add is_paused column if it doesn't exist (for upgrades)
db.run("ALTER TABLE payg_sessions ADD COLUMN is_paused BOOLEAN DEFAULT 0", (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Gagal menambahkan kolom is_paused pada payg_sessions:', err.message);
  } else {
    console.log('Kolom "is_paused" untuk payg_sessions sudah diperiksa/ditambahkan.');
  }
});
