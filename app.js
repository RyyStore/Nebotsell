const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');
const topUpQueue = require('./queue');
const { initGenerateBug } = require('./generate');

const app = express();
const axios = require('axios');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { createssh, createvmess, createvless, createtrojan } = require('./modules/create');
const { trialssh, trialvmess, trialvless, trialtrojan } = require('./modules/trial');
const { renewssh, renewvmess, renewvless, renewtrojan } = require('./modules/renew');

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const PAYDISINI_KEY = vars.PAYDISINI_KEY; // Sudah di-set di VPS
const BOT_TOKEN = vars.BOT_TOKEN; // Sudah di-set di VPS
const port = vars.PORT || 50123; // Sudah di-set di VPS
const ADMIN = vars.USER_ID; // Sudah di-set di VPS
const NAMA_STORE = vars.NAMA_STORE || '@RyyStore'; // Sudah di-set di VPS
const GROUP_ID = "-1002397066993"; // Tambahkan grup ID di sini
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

// Fungsi untuk membulatkan harga khusus 30 hari
function calculatePrice(hargaPerHari, expDays) {
  if (expDays === 30) {
    return Math.floor((hargaPerHari * 30) / 100) * 100; // Bulatkan ke kelipatan 100
  }
  return hargaPerHari * expDays; // Untuk masa aktif lain, hitung normal
}

// Di bagian pembuatan tabel Server
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
  total_create_akun INTEGER,
  hidden BOOLEAN DEFAULT 0
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel Server:', err.message);
  } else {
    console.log('Server table created or already exists');
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
  CONSTRAINT unique_user_id UNIQUE (user_id)
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel users:', err.message);
  } else {
    console.log('Users table created or already exists');
  }
});
// Tambahkan di awal kode (setelah koneksi database)
db.run(`CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS created_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    account_username TEXT NOT NULL,
    protocol TEXT NOT NULL,          -- 'ssh', 'vmess', 'vless', 'trojan'
    created_by_user_id INTEGER NOT NULL,
    expiry_date TEXT NOT NULL,       -- Simpan sebagai ISO string, contoh: '2025-12-31T23:59:59.000Z'
    is_active BOOLEAN DEFAULT 1,     -- 1 untuk aktif, 0 untuk sudah diproses (expired)
    FOREIGN KEY (server_id) REFERENCES Server(id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Kesalahan membuat tabel created_accounts:', err.message);
    } else {
        console.log('Tabel created_accounts berhasil dibuat atau sudah ada.');
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

    // Hapus pesan "harap bergabung" atau pesan sebelumnya dari bot untuk user ini
    if (userMessages[userId]) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]);
            delete userMessages[userId];
        } catch (e) { /* abaikan jika gagal, mungkin pesan sudah tidak ada */ }
    }
    // Jika ini dipanggil dari callback query, coba hapus pesan callback query itu sendiri
    if (ctx.callbackQuery && (!userMessages[userId] || (userMessages[userId] && ctx.callbackQuery.message.message_id !== userMessages[userId]))) {
        try { await ctx.deleteMessage(); } catch(e) { /* abaikan */ }
    }

    const rawUsername = ctx.from.username || ctx.from.first_name || `Pengguna`;
    const username = ctx.from.username
        ? `<a href="tg://user?id=${userId}">${ctx.from.username}</a>`
        : `<a href="tg://user?id=${userId}">${rawUsername}</a>`;

    // Simpan atau update data pengguna (opsional di sini jika /start sudah melakukannya,
    // tapi baik untuk kekokohan jika fungsi ini dipanggil secara independen)
    db.serialize(() => {
        db.run(
            'INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)',
            [userId, username],
            (err) => {
                if (err) console.error('Kesalahan saat menyimpan user (tutorial display):', err.message);
            }
        );
        db.run(
            `UPDATE users SET username = ? WHERE user_id = ? AND (username IS NULL OR username != ?)`,
            [username, userId, username],
            (err) => {
                if (err) console.error('Kesalahan saat mengupdate username (tutorial display):', err.message);
            }
        );
    });

    // Keyboard persis seperti permintaan awal Anda
    const keyboardForTutorial = [
        [
          { text: 'CARA TOPUP', url: 'https://t.me/internetgratisin/21' },
          { text: 'CARA GENERATE BUG', url: 'https://t.me/internetgratisin/22' }
        ],
        [
            { text: 'CARA ORDER', url: 'https://t.me/internetgratisin/23' },
            { text: 'CARA TRIAL', url: 'https://t.me/internetgratisin/24' }
        ],
        [
            { text: 'GRUP WHATSAPP', url: 'https://chat.whatsapp.com/J8xxgw6eVJ23wY5JbluDfJ' }
        ],
        [{ text: 'MAIN MENU♻️', callback_data: 'main_menu_refresh' }] // Sesuai permintaan awal
    ];

    // Teks pesan persis seperti permintaan awal Anda
    const messageTextForTutorial = `
<code><b>═══════════════════════════════</b></code>
               ≡ <b>🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​</b> ≡
<code><b>═══════════════════════════════</b></code>
               <b>⟨ DASHBOARD TUTORIAL ⟩</b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
 <b><code>Selamat Datang</code></b> <i>${username}</i>
 <b><code>ID Anda:</code></b> <code>${userId}</code>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b><code>Jika sudah paham, bisa langsung
    ke Main Menu</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b><code>Jika ingin menjadi reseller:</code></b>
<b><code>Minimal Topup:</code></b><b><code>Rp 25.000</code></b>
<b><code>Diskon 50% dari harga normal!</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b><code>SGDO</code></b> 🇸🇬: <b><code>134/Hari</code></b> <b><code>reseller</code></b>
<b><code>SGDO</code></b> 🇸🇬: <b><code>267/Hari</code></b> <b><code>member</code></b>
<b><code>INDO</code></b>  🇮🇩: <b><code>200/Hari</code></b> <b><code>reseller</code></b>
<b><code>INDO</code></b>  🇮🇩: <b><code>334/Hari</code></b> <b><code>member</code></b>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
📞 <b><code>KESULITAN?</code></b>
👤 <b><code>Chat Owner:</code></b> <a href="tg://user?id=7251232303">RyyStore</a>
☏ <a href="https://wa.me/6287767287284">WhatsApp</a>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<b>Silakan pilih opsi layanan:</b>
`;

    try {
        const sentMessage = await ctx.replyWithHTML(messageTextForTutorial, {
            reply_markup: {
                inline_keyboard: keyboardForTutorial
            },
            disable_web_page_preview: true
        });
        userMessages[userId] = sentMessage.message_id;
    } catch (error) {
        console.error('Error saat mengirim pesan panduan (displayTutorialDashboard):', error);
        // Fallback jika gagal mengirim pesan yang kompleks
        try {
            const fallbackMsg = await ctx.reply(`Selamat datang! ID Anda: ${userId}\nSilakan gunakan tombol di bawah atau ketik /menu untuk melanjutkan.`, {
                reply_markup: {
                    inline_keyboard: [[{ text: 'MAIN MENU♻️', callback_data: 'main_menu_refresh' }]]
                }
            });
            userMessages[userId] = fallbackMsg.message_id;
        } catch (fallbackError) {
            console.error('Error mengirim pesan fallback panduan (displayTutorialDashboard):', fallbackError);
        }
    }
}

// Fungsi untuk memeriksa dan menurunkan reseller yang tidak aktif
async function checkAndDowngradeInactiveResellers() {
  const now = new Date();
  const currentDay = now.getDate();
  
  // Hanya berjalan tiap tanggal 1 jam 00:05
  if (currentDay === 1 && now.getHours() === 0 && now.getMinutes() >= 5) {
    try {
      console.log('🔄 Memulai pengecekan reseller tidak aktif...');
      
      // Ambil semua reseller yang tidak memenuhi syarat
      const inactiveResellers = await new Promise((resolve, reject) => {
        db.all(`
          SELECT user_id, username, last_topup_date, accounts_created_30days 
          FROM users 
          WHERE role = 'reseller'
            AND (
              -- Tidak pernah topup (seharusnya tidak mungkin)
              last_topup_date IS NULL 
              -- Atau sudah lebih dari 30 hari sejak topup pertama
              OR julianday('now') - julianday(last_topup_date) > 30
              -- Atau membuat kurang dari 5 akun dalam 30 hari terakhir
              OR accounts_created_30days < 5
            )
        `, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      if (inactiveResellers.length === 0) {
        console.log('✅ Tidak ada reseller yang perlu diturunkan');
        return;
      }

      // Turunkan role setiap reseller tidak aktif
      for (const reseller of inactiveResellers) {
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE users SET role = 'member' WHERE user_id = ?`,
            [reseller.user_id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        console.log(`✅ Reseller ${reseller.user_id} diturunkan ke member`);

        // Kirim notifikasi ke user
        try {
          await bot.telegram.sendMessage(
            reseller.user_id,
            `⚠️ *Perubahan Status Reseller*\n\n` +
            `Role Anda telah diturunkan menjadi member karena:\n` +
            `- Tidak membuat minimal 5 akun dalam 30 hari sejak menjadi reseller\n\n` +
            `Anda bisa kembali menjadi reseller dengan topup minimal Rp25.000`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error(`⚠️ Gagal kirim notifikasi ke user ${reseller.user_id}:`, error.message);
        }

        // Kirim notifikasi ke admin
        try {
          await bot.telegram.sendMessage(
            ADMIN,
            `⚠️ *Penurunan Role Reseller*\n\n` +
            `User: ${reseller.username || reseller.user_id}\n` +
            `ID: ${reseller.user_id}\n` +
            `Terakhir Topup: ${reseller.last_topup_date || 'Tidak ada data'}\n` +
            `Akun dibuat 30 hari: ${reseller.accounts_created_30days}`,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          console.error('⚠️ Gagal kirim notifikasi ke admin:', error.message);
        }
      }

      console.log(`✅ ${inactiveResellers.length} reseller berhasil diturunkan`);
      
    } catch (error) {
      console.error('❌ Gagal proses penurunan role:', error);
    }
  }
}

// Fungsi untuk reset counter akun 30 hari dan cek reseller tidak aktif
const resetAccountsCreated30Days = async () => {
  const now = new Date();
  const currentDay = now.getDate();
  
  // Cek tanggal reset terakhir
  const lastReset = await new Promise((resolve) => {
    db.get('SELECT value FROM system_settings WHERE key = ?', ['last_reset_date'], (err, row) => {
      resolve(row ? new Date(row.value) : null);
    });
  });

  // Jika sudah reset bulan ini, skip
  if (lastReset && lastReset.getMonth() === now.getMonth() && lastReset.getFullYear() === now.getFullYear()) {
    console.log('Reset sudah dilakukan bulan ini');
    return;
  }

  // Proses reset tiap tanggal 1 jam 00:05
  if (currentDay === 1 && now.getHours() === 0 && now.getMinutes() >= 5) {
    try {
      console.log('🔄 Memulai reset otomatis...');
      
      // Reset counter akun 30 hari
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET accounts_created_30days = 0', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Cek dan turunkan reseller tidak aktif
      await checkAndDowngradeInactiveResellers();

      // Simpan tanggal reset terakhir
      await new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', 
          ['last_reset_date', now.toISOString()], 
          (err) => {
            if (err) return reject(err);
            resolve();
          });
      });

      console.log('✅ Reset otomatis berhasil');
      
      // Kirim notifikasi
      await bot.telegram.sendMessage(
        GROUP_ID,
        `🔄 *RESET OTOMATIS* 30 hari\n` +
        `📅 Tanggal: ${now.toLocaleDateString('id-ID')}\n` +
        `⏰ Waktu: ${now.toLocaleTimeString('id-ID')}\n` +
        `🔽 Reseller tidak aktif telah diturunkan ke member`
      );
    } catch (error) {
      console.error('❌ Gagal reset otomatis:', error);
    }
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

// Fungsi untuk upgrade ke reseller
async function checkAndUpdateUserRole(userId) {
  try {
    // Ambil data pengguna dari database
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (!user) {
      console.error('🚫 Pengguna tidak ditemukan.');
      return;
    }

    const { saldo, role } = user;

    // Jika saldo >= 25.000 dan role bukan reseller, ubah role ke reseller
    if (saldo >= 25000 && role !== 'reseller') {
      const today = new Date().toISOString().split('T')[0];
      
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET role = ?, last_topup_date = ? WHERE user_id = ?', 
          ['reseller', today, userId], 
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      console.log(`✅ Role pengguna ${userId} diubah menjadi reseller.`);

      // **Ambil username pengguna**
      const chat = await bot.telegram.getChat(userId);
      const username = chat.username ? `@${chat.username}` : `User ID: ${userId}`;

      // **Kirim notifikasi ke pengguna**
      await bot.telegram.sendMessage(
        userId,
        `🎉 *Selamat! Anda sekarang menjadi reseller.*\n\n` +
        `──────────────────────\n` +
        `➥ *Role Baru:* Reseller\n` +
        `➥ *Tanggal Mulai:* ${today}\n` +
        `➥ *Syarat:* Buat minimal 5 akun dalam 30 hari untuk mempertahankan status\n` +
        `──────────────────────`,
        { parse_mode: 'Markdown' }
      );

      // **Kirim notifikasi ke admin**
      await bot.telegram.sendMessage(
        ADMIN,
        `🎉 *Notifikasi Upgrade Reseller*\n\n` +
        `──────────────────────\n` +
        `➥ *Username:* [${username}](tg://user?id=${userId})\n` +
        `➥ *User ID:* ${userId}\n` +
        `➥ *Role Baru:* Reseller\n` +
        `➥ *Tanggal Mulai:* ${today}\n` +
        `──────────────────────`,
        { parse_mode: 'Markdown' }
      );

      // **Kirim notifikasi ke grup**
      await bot.telegram.sendMessage(
        GROUP_ID,
        `🎉 *Notifikasi Upgrade Reseller*\n\n` +
        `──────────────────────\n` +
        `➥ *Username:* [${username}](tg://user?id=${userId})\n` +
        `➥ *User ID:* ${userId}\n` +
        `➥ *Role Baru:* Reseller\n` +
        `➥ *Tanggal Mulai:* ${today}\n` +
        `──────────────────────`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('🚫 Gagal memeriksa dan mengupdate role pengguna:', error);
  }
}

async function sendUserNotificationTopup(userId, amount, uniqueAmount, bonusAmount = 0) {
  const userOriginalTopup = amount; // Simpan jumlah asli yang ditopup user
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
    await bot.telegram.sendMessage(userId, userMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi top-up berhasil dikirim ke pengguna ${userId}`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi top-up ke pengguna:', error.message);
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
// ... (sisa fungsi)
  try {
    await bot.telegram.sendMessage(ADMIN, adminMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi top-up berhasil dikirim ke admin`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi top-up ke admin:', error.message);
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

  const serverId = args[1];

  db.run("UPDATE Server SET hidden = 1 WHERE id = ?", [serverId], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat menyembunyikan server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat menyembunyikan server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Server dengan ID \`${serverId}\` berhasil disembunyikan.`, { parse_mode: 'Markdown' });
  });
});

bot.command('showserver', async (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('⚠️ Format salah. Gunakan: `/showserver <server_id>`', { parse_mode: 'Markdown' });
  }

  const serverId = args[1];

  db.run("UPDATE Server SET hidden = 0 WHERE id = ?", [serverId], function(err) {
    if (err) {
      console.error('⚠️ Kesalahan saat menampilkan server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat menampilkan server.', { parse_mode: 'Markdown' });
    }

    if (this.changes === 0) {
      return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
    }

    ctx.reply(`✅ Server dengan ID \`${serverId}\` berhasil ditampilkan kembali.`, { parse_mode: 'Markdown' });
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
async function sendMainMenu(ctx) {
  try {
    const userId = ctx.from.id;
    const isAdmin = adminIds.includes(userId);
    // console.log(`Memulai sendMainMenu untuk userId: ${userId}`);

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
          if (err) reject(err);
          else resolve(row ? row.count : 0);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.count : 0);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row || { saldo: 0, role: 'member' });
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT SUM(accounts_created_30days) as total_30days, SUM(total_accounts_created) as total_global FROM users', (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_30days: 0, total_global: 0 });
        });
      }),
      getAccountCreationRanking(), // Pastikan fungsi ini terdefinisi
      new Promise((resolve, reject) => {
        db.get('SELECT trial_count, last_trial_date FROM users WHERE user_id = ?', [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row || { trial_count: 0, last_trial_date: null });
        });
      })
    ]);

    const rawUsername = ctx.from.username || ctx.from.first_name || `User${userId}`;
    const usernameLink = `<a href="tg://user?id=${userId}">${rawUsername}</a>`;
    const formattedSaldo = userData.saldo.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isReseller = userData.role === 'reseller';
    const dailyLimit = isReseller ? 20 : 5;
    
    let usedTrials = 0;
    if (trialData.last_trial_date === today) {
      usedTrials = trialData.trial_count;
    }

    let rankingText = '⚠️ Tidak ada data ranking.';
    if (ranking && ranking.length > 0) {
      rankingText = ranking.map((user, index) => {
        const cleanedUser = cleanUsername(user.username) || `ID:${user.user_id}`; // Pastikan cleanUsername terdefinisi
        if (index === 0) return `🥇 ${cleanedUser}: ${user.accounts_created_30days} akun`;
        if (index === 1) return `🥈 ${cleanedUser}: ${user.accounts_created_30days} akun`;
        if (index === 2) return `🥉 ${cleanedUser}: ${user.accounts_created_30days} akun`;
        return `➥ ${cleanedUser}: ${user.accounts_created_30days} akun`;
      }).join('\n');
    }

   // Di dalam fungsi sendMainMenu(ctx)

    const keyboard = [
      [ // Baris pertama dengan dua tombol utama
        { text: 'PANEL SERVER', callback_data: 'panel_server_start' },
        { text: 'TOPUP [QRIS]', callback_data: 'topup_saldo' }
      ],
      [ // Baris kedua untuk tombol Refresh
        { text: 'REFRESH', callback_data: 'refresh_menu' }
      ]
    ];

    if (isAdmin) { // isAdmin harus sudah terdefinisi di dalam sendMainMenu
      keyboard.push([ // Tombol admin tetap di baris terpisah
        { text: '⚙️ ADMIN', callback_data: 'admin_menu' },
        { text: '💹 CEK SALDO', callback_data: 'cek_saldo_semua' }
      ]);
    }

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
  <code><b>ID Anda:</b></code> <code>${userId}</code>
  <code><b>Status:</b></code> <code><b>${userData.role === 'reseller' ? 'Reseller ' : 'Member 👤'}</b></code>
<blockquote><code><b>SALDO ANDA:</b></code> Rp <code>${formattedSaldo}</code></blockquote>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<blockquote><code>🏆</code> <code><b>TOP 3 CREATE AKUN (30 HARI)</b></code></blockquote><code>${rankingText}</code>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
<code><b>CHAT OWNER:</b></code> <a href="tg://user?id=7251232303">RyyStore</a>
☏ <a href="https://wa.me/6287767287284">WhatsApp</a>
<b>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</b>
Silakan pilih opsi layanan:`;

    let sentMessageInfo;
    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true
    };

    if (ctx.callbackQuery) { 
        try {
            sentMessageInfo = await ctx.editMessageText(messageText, messageOptions);
        } catch (e) {
            if (userMessages[userId]) {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch (delErr) {}
            }
            sentMessageInfo = await ctx.reply(messageText, messageOptions);
        }
    } else { 
        if (userMessages[userId]) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch (error) {}
        }
        sentMessageInfo = await ctx.reply(messageText, messageOptions);
    }
    
    if (sentMessageInfo) {
        userMessages[userId] = sentMessageInfo.message_id;
    }

  } catch (error) {
    console.error('Error di sendMainMenu:', error.stack);
    try {
        await ctx.reply('Terjadi kesalahan. Coba /menu lagi.', {
        reply_markup: {
            inline_keyboard: [
            [{ text: 'PANEL SERVER', callback_data: 'panel_server_start' }],
            [{ text: 'REFRESH', callback_data: 'refresh_menu' }]
            ]
        }
        });
    } catch (e) {
        console.error("Gagal mengirim fallback menu:", e.message)
    }
  }
}

bot.command('forceresetnow', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('⚠️ Hanya admin yang bisa melakukan reset manual');
  }

  try {
    // 1. Reset counter
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET accounts_created_30days = 0', (err) => {
        if (err) return reject(err);
        console.log('Counter direset');
        resolve();
      });
    });

    // 2. Simpan tanggal reset
    const resetDate = new Date();
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`, 
        ['last_reset_date', resetDate.toISOString()], 
        (err) => {
          if (err) return reject(err);
          resolve();
        });
    });

    // 3. Kirim laporan
    const successMsg = 
      `✅ Reset manual berhasil!\n\n` +
      `📅 Tanggal: ${resetDate.toLocaleDateString('id-ID')}\n` +
      `⏰ Waktu: ${resetDate.toLocaleTimeString('id-ID')}\n` +
      `🔄 Reset berikutnya: 1 Mei 2025`;

    await ctx.reply(successMsg);
    await bot.telegram.sendMessage(GROUP_ID, `♻️ ADMIN MELAKUKAN RESET MANUAL\n${successMsg}`);

  } catch (error) {
    const errorMsg = `❌ Gagal reset manual:\n${error.message}`;
    console.error(errorMsg);
    await ctx.reply(errorMsg);
    await bot.telegram.sendMessage(ADMIN, `⚠️ ERROR RESET MANUAL\n${error.stack}`);
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
├─────────────────────────────
│ <b>MANAJEMEN RESELLER</b>                
├─────────────────────────────
│ <code>/listreseller</code> - Lihat daftar reseller
│ <code>/addsaldo</code> - Tambah saldo user        
│ <code>/hapussaldo</code> - Kurangi saldo user     
│ <code>/changerole</code> - Ubah role user         
│ <code>/upgrade_reseller</code> - Upgrade ke resell
├─────────────────────────────
│ <b>BROADCAST & KONTAK</b>               
├─────────────────────────────
│ <code>/broadcast</code> - Kirim pesan ke semua    
│ <code>/send</code> - Kirim pesan ke user tertentu 
├─────────────────────────────
│ <b>PENGATURAN SISTEM</b>                
├─────────────────────────────
│ <code>/setbonus</code> - Atur bonus top-up     
│ <code>/viewbonus</code> - Lihat status bonus  
│ <code>/clearbonus</code> - Hapus/nonaktifkan bonus
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

<b>🔧 FITUR BARU</b>
- Contact Top Reseller
- Broadcast ke Reseller
- Export Data Reseller (CSV)
- Statistik Lengkap Reseller

<b>📌 CONTOH PENGGUNAAN:</b>
<code>/addsaldo 12345678 50000</code> - Tambah saldo Rp50.000 ke user ID 12345678  
<code>/changerole 12345678 reseller</code> - Ubah role user ke reseller  
<code>/broadcast Pesan penting</code> - Kirim broadcast ke semua user

Gunakan perintah di atas dengan format yang benar.
`;

  ctx.reply(helpMessage, { 
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Contoh Penggunaan', callback_data: 'admin_examples' }],
        [{ text: '🔄 Refresh', callback_data: 'refresh_help' }]
      ]
    }
  });
});


// Tambahkan handler untuk tombol
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

// Command untuk admin mengubah role pengguna
bot.command('changerole', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply('🚫 Format: /changerole <user_id> <new_role>', { parse_mode: 'Markdown' });
  }

  const targetUserId = args[1];
  const newRole = args[2];

  if (!['member', 'reseller'].includes(newRole)) {
    return ctx.reply('🚫 Role tidak valid. Gunakan "member" atau "reseller".', { parse_mode: 'Markdown' });
  }

  await new Promise((resolve, reject) => {
    db.run('UPDATE users SET role = ? WHERE user_id = ?', [newRole, targetUserId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  await ctx.reply(`✅ Role pengguna dengan ID ${targetUserId} berhasil diubah menjadi ${newRole}.`, { parse_mode: 'Markdown' });

  // Kirim notifikasi ke pengguna
  try {
    await ctx.telegram.sendMessage(targetUserId, `🔄 Role Anda telah diubah menjadi ${newRole} oleh admin.`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi ke pengguna:', error);
  }

  // Kirim notifikasi ke grup
  const username = await getUsernameById(targetUserId);
  const groupMessage = `🔄 *Notifikasi Perubahan Role*\n\n` +
                       `➥ *Username:* [${username}](tg://user?id=${targetUserId})\n` +
                       `➥ *User ID:* ${targetUserId}\n` +
                       `➥ *Role Baru:* ${newRole}\n` +
                       `➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}\n` +
                       `──────────────────────`;

  try {
    await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi perubahan role berhasil dikirim ke grup`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi ke grup:', error.message);
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
    const currentMessage = ctx.message; // Pesan yang berisi perintah /broadcast

    let commandTextSource = "";
    if (currentMessage.text) {
        commandTextSource = currentMessage.text;
    } else if (currentMessage.caption) {
        commandTextSource = currentMessage.caption; // Jika gambar/video dikirim dengan perintah sbg caption
    }
    console.log('[BROADCAST DEBUG] commandTextSource:', commandTextSource);

    const commandParts = commandTextSource.split(' ');
    const targetGroup = commandParts[1] ? commandParts[1].toLowerCase() : null;
    const textFollowingCommand = commandParts.slice(2).join(' '); 

    console.log('[BROADCAST DEBUG] Target Group:', targetGroup);
    console.log('[BROADCAST DEBUG] Text Following Command:', textFollowingCommand);
    if (repliedMessage) {
        console.log('[BROADCAST DEBUG] Ada repliedMessage. Tipe:', repliedMessage.text ? 'text' : repliedMessage.photo ? 'photo' : repliedMessage.video ? 'video' : 'lainnya');
        if (repliedMessage.caption) console.log('[BROADCAST DEBUG] Replied Message Caption:', repliedMessage.caption);
    } else {
        console.log('[BROADCAST DEBUG] Tidak ada repliedMessage.');
    }
    if (currentMessage.photo) console.log('[BROADCAST DEBUG] currentMessage memiliki foto.');
    if (currentMessage.video) console.log('[BROADCAST DEBUG] currentMessage memiliki video.');


    if (!targetGroup || !['all', 'reseller', 'member'].includes(targetGroup)) {
        console.log('[BROADCAST DEBUG] Target group tidak valid:', targetGroup);
        return ctx.reply(
            '⚠️ Format perintah broadcast salah.\n' +
            'Gunakan:\n' +
            '`/broadcast all [pesan/caption]`\n' +
            '`/broadcast reseller [pesan/caption]`\n' +
            '`/broadcast member [pesan/caption]`\n\n' +
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

    if (repliedMessage) { 
        console.log('[BROADCAST DEBUG] Menentukan konten dari repliedMessage.');
        captionForMedia = textFollowingCommand || repliedMessage.caption || ''; 
        if (repliedMessage.photo && repliedMessage.photo.length > 0) {
            messageType = 'photo';
            fileIdToSend = repliedMessage.photo[repliedMessage.photo.length - 1].file_id;
            console.log('[BROADCAST DEBUG] Tipe: photo (reply), fileId:', fileIdToSend, 'Caption:', captionForMedia);
        } else if (repliedMessage.video) {
            messageType = 'video';
            fileIdToSend = repliedMessage.video.file_id;
            console.log('[BROADCAST DEBUG] Tipe: video (reply), fileId:', fileIdToSend, 'Caption:', captionForMedia);
        } else if (repliedMessage.text) {
            messageType = 'text';
            messageToSend = textFollowingCommand || repliedMessage.text; 
            console.log('[BROADCAST DEBUG] Tipe: text (reply), Pesan:', messageToSend);
        } else { 
            if (textFollowingCommand) { 
                messageType = 'text';
                messageToSend = textFollowingCommand;
                console.log('[BROADCAST DEBUG] Tipe: text (dari textFollowingCommand, reply ke media tidak didukung), Pesan:', messageToSend);
            } else {
                console.log('[BROADCAST DEBUG] Tipe reply tidak didukung dan tidak ada teks tambahan.');
                return ctx.reply('⚠️ Tipe pesan yang direply tidak didukung untuk broadcast dengan caption, atau tidak ada teks broadcast tambahan yang diberikan.');
            }
        }
    } else if (currentMessage.photo && currentMessage.photo.length > 0) { 
        console.log('[BROADCAST DEBUG] Menentukan konten dari currentMessage (ada foto).');
        messageType = 'photo';
        fileIdToSend = currentMessage.photo[currentMessage.photo.length - 1].file_id;
        captionForMedia = textFollowingCommand; 
        console.log('[BROADCAST DEBUG] Tipe: photo (bersama command), fileId:', fileIdToSend, 'Caption:', captionForMedia);
    } else if (currentMessage.video) { 
        console.log('[BROADCAST DEBUG] Menentukan konten dari currentMessage (ada video).');
        messageType = 'video';
        fileIdToSend = currentMessage.video.file_id;
        captionForMedia = textFollowingCommand; 
        console.log('[BROADCAST DEBUG] Tipe: video (bersama command), fileId:', fileIdToSend, 'Caption:', captionForMedia);
    } else { 
        console.log('[BROADCAST DEBUG] Menentukan konten sebagai teks biasa (tidak ada reply/media bersama command).');
        if (textFollowingCommand) {
            messageType = 'text';
            messageToSend = textFollowingCommand;
            console.log('[BROADCAST DEBUG] Tipe: text (biasa), Pesan:', messageToSend);
        } else {
            console.log('[BROADCAST DEBUG] Tidak ada pesan untuk di-broadcast (teks biasa).');
            return ctx.reply('⚠️ Tidak ada pesan untuk di-broadcast. Sertakan pesan setelah target (`all`/`reseller`/`member`).');
        }
    }
    
    if (!messageType) {
        console.log('[BROADCAST DEBUG] messageType tidak terdefinisi setelah semua pengecekan.');
        return ctx.reply('⚠️ Konten broadcast tidak dapat ditentukan. Pastikan format perintah benar.');
    }
    if (messageType === 'text' && (messageToSend === null || messageToSend.trim() === '')) {
         console.log('[BROADCAST DEBUG] Pesan teks kosong.');
         return ctx.reply('⚠️ Tidak ada pesan teks yang valid untuk di-broadcast.');
    }
    if ((messageType === 'photo' || messageType === 'video') && !fileIdToSend) {
         console.log('[BROADCAST DEBUG] File ID untuk media tidak ditemukan.');
         return ctx.reply('⚠️ Gagal mendapatkan file ID dari media yang akan dikirim.');
    }
    
    console.log(`[BROADCAST DEBUG] Siap mengirim. Tipe: ${messageType}, Target: ${targetGroup}`);

    let successCount = 0;
    let failureCount = 0;
    let totalUsers = 0;
    const loadingMsg = await ctx.reply(`⏳ Mempersiapkan broadcast untuk target: ${targetGroup}...`);
    console.log(`[BROADCAST DEBUG] Pesan loading awal dikirim, ID: ${loadingMsg.message_id}`);


    let sqlQuery = "SELECT user_id FROM users";
    if (targetGroup === 'reseller') {
        sqlQuery = "SELECT user_id FROM users WHERE role = 'reseller'";
    } else if (targetGroup === 'member') {
        sqlQuery = "SELECT user_id FROM users WHERE role = 'member'";
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
        try { await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⏳ Mengirim broadcast ke ${totalUsers} pengguna (${targetGroup})... (0%)`); } catch(e) {}

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

            if ((i + 1) % 5 === 0 || (i + 1) === totalUsers) { // Update setiap 5 pengguna atau di akhir
                const percentage = Math.round(((i + 1) / totalUsers) * 100);
                console.log(`[BROADCAST DEBUG] Update progress: ${percentage}%`);
                try {
                   await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⏳ Broadcast ke ${targetGroup} (${percentage}%)...\nBerhasil: ${successCount}, Gagal: ${failureCount} dari ${totalUsers}`);
                } catch(editErr){ console.warn("[BROADCAST DEBUG] Gagal update progress broadcast:", editErr.message); }
            }
            if (i < rows.length -1) {
                 await new Promise(resolve => setTimeout(resolve, 500)); // delay 500ms
            }
        }
        console.log('[BROADCAST DEBUG] Pengiriman selesai.');
        try {
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `✅ Broadcast Selesai (${targetGroup}).\nTotal: ${totalUsers}, Berhasil: ${successCount}, Gagal: ${failureCount}`);
        } catch(e) {
             console.warn("[BROADCAST DEBUG] Gagal update pesan hasil akhir broadcast:", e.message);
             // Mungkin kirim pesan baru jika edit gagal
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
  const userId = ctx.message.from.id;
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

  if (amount < 0) {
    return ctx.reply('⚠️ Jumlah saldo tidak boleh negatif.', { parse_mode: 'Markdown' });
  }

  try {
    // Tambahkan saldo ke pengguna
    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], async (err) => {
      if (err) {
        console.error('Kesalahan saat menambahkan saldo:', err.message);
        return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
      }

      // Cek dan upgrade ke reseller jika saldo >= 25.000
      if (amount >= 25000) {
        await checkAndUpdateUserRole(targetUserId);
      }

      // Notifikasi ke pengguna
      await ctx.telegram.sendMessage(targetUserId, `✅ Saldo sebesar Rp${amount} telah ditambahkan ke akun Anda.`, { parse_mode: 'Markdown' });

      // Notifikasi ke admin
      await ctx.reply(`✅ Saldo sebesar Rp${amount} berhasil ditambahkan ke user dengan ID ${targetUserId}.`, { parse_mode: 'Markdown' });

      // Notifikasi ke grup
      const username = await getUsernameById(targetUserId);
      await sendGroupNotificationTopup(username, targetUserId, amount, amount);
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat menambahkan saldo:', error);
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

initGenerateBug(bot);

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
    const servers = await getServerList(userId); // Pastikan getServerList terdefinisi

    const messageOptions = {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
    };

    if (servers.length === 0) {
      messageOptions.reply_markup.inline_keyboard.push([{ text: '🔙 Kembali ke Menu', callback_data: 'kembali' }]);
      const noServerMsg = '⚠️ Tidak ada server yang tersedia saat ini.';
      // Coba edit dulu, jika gagal (misal pesan tidak ada), kirim baru
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
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1); // Halaman saat ini, pastikan valid
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
    // Perhatikan callback_data untuk navigasi di sini: 'panel_server_page_NOMORHALAMAN'
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

    let messageText = `<code><b>══════════════════════════════</b></code>\n  <code>   <b>PANEL PREMIUM RYYSTORE</b></code>\n<code><b>══════════════════════════════</b></code>\n📌 <code><b>PILIH SERVER (Hal ${currentPage + 1}/${totalPages})</b></code>\n\n<pre>`;
    currentServers.forEach((server) => {
      const hargaPer30Hari = calculatePrice(server.harga, 30); 
      const status = server.total_create_akun >= server.batas_create_akun ? '❌ PENUH' : '✅ TERSEDIA';
      messageText += `🚀 ${server.nama_server}\n`;
      messageText += `💰 HARGA     : Rp${server.harga}/hari\n`;
      messageText += `🗓️ 30 HARI   : Rp${hargaPer30Hari.toLocaleString('id-ID')}\n`;
      messageText += `📦 QUOTA     : ${server.quota}GB\n`;
      messageText += `🔒 IP LIMIT  : ${server.iplimit}\n`;
      messageText += `👤 PENGGUNA  : ${server.total_create_akun}/${server.batas_create_akun} ${status}\n`;
      messageText += '─'.repeat(30) + '\n';
    });
    messageText += '</pre>\nSilakan pilih server:';

    let sentMessageInfo;
    if (ctx.callbackQuery) { // Jika dipanggil dari callback (navigasi atau kembali dari protokol)
      try {
        sentMessageInfo = await ctx.editMessageText(messageText, messageOptions);
      } catch (e) { // Gagal edit, mungkin pesan sudah lama atau tidak ada
        console.warn("Gagal editMessageText di startSelectServerForAction, mengirim pesan baru.", e.message);
        // Hapus state lama agar tidak terjebak jika ada
        delete userState[userId]; 
        if (userMessages[userId]) { try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch(delErr){} }
        sentMessageInfo = await ctx.reply(messageText, messageOptions);
      }
    } else { // Panggilan pertama dari panel_server_start
      if (userMessages[userId]) { // Hapus pesan menu utama sebelumnya
          try { await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]); } catch(e){}
      }
      sentMessageInfo = await ctx.reply(messageText, messageOptions);
    }

    if (sentMessageInfo) { 
        userMessages[userId] = sentMessageInfo.message_id || (sentMessageInfo.result && sentMessageInfo.result.message_id);
    }
     userState[userId] = { ...userState[userId], step: 'selecting_server_for_action', currentPage: currentPage };


  } catch (error) {
    console.error('Error di startSelectServerForAction:', error);
    delete userState[userId]; // Hapus state jika error
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
        else resolve(row);
      });
    });

    if (!serverDetails) {
      await ctx.editMessageText("⚠️ Server tidak ditemukan.", { 
        parse_mode: 'Markdown', 
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]] } 
      });
      return;
    }

    const role = userDbData.role; // Menggunakan userDbData untuk role
    const hargaPerHari = role === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
    const hargaBulanan = calculatePrice(hargaPerHari, 30); 

    // Logika baru untuk menampilkan nama pengguna
    let displayName;
    if (ctx.from.username) {
        displayName = ctx.from.username; // Username tanpa "@"
    } else if (ctx.from.first_name) {
        displayName = ctx.from.first_name;
    } else {
        displayName = `User ${userId}`; // Fallback jika tidak ada username atau nama depan
    }
    // Membuat nama yang bisa diklik
    const userClickableDisplay = `<a href="tg://user?id=${userId}">${displayName}</a>`;
    
    const userSaldoFormatted = userDbData.saldo.toLocaleString('id-ID'); // Menggunakan userDbData untuk saldo

    let city = 'Unknown';
    const serverNameLower = serverDetails.nama_server.toLowerCase();
    if (serverNameLower.includes('sg') || serverNameLower.includes('singapore')) {
        city = 'Singapore 🇸🇬';
    } else if (serverNameLower.includes('id') || serverNameLower.includes('indo') || serverNameLower.includes('indonesia')) {
        city = 'Indonesia 🇮🇩';
    } else if (serverNameLower.includes('us')) {
        city = 'United States 🇺🇸';
    }

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

    const protocols = ['SSH', 'VMESS', 'VLESS', 'TROJAN'];
    protocols.forEach(p => {
        message += `\n<blockquote><b>${p.toUpperCase()}</b></blockquote>`;
        message += `  • Harian  : <code>Rp${hargaPerHari.toLocaleString('id-ID')}</code>\n`;
        message += `  • Bulanan : <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>`;
    });
    
    message += `
<b>─────────────────────</b>
Silakan pilih jenis protokol layanan:`;

    const keyboard = [
      [{ text: 'SSH', callback_data: `protocol_selected_for_action_ssh` }, { text: 'VMESS', callback_data: `protocol_selected_for_action_vmess` }],
      [{ text: 'VLESS', callback_data: `protocol_selected_for_action_vless` }, { text: 'TROJAN', callback_data: `protocol_selected_for_action_trojan` }],
      [{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]
    ];

    await ctx.editMessageText(message, { 
      parse_mode: 'HTML', 
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true
    });

  } catch (error) {
    console.error('Error di server_selected_for_action (pemilihan protokol):', error);
    await ctx.editMessageText("⚠️ Terjadi kesalahan saat menampilkan detail server dan protokol. Silakan coba lagi.", {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]] }
    });
  }
});

bot.action(/protocol_selected_for_action_(ssh|vmess|vless|trojan)/, async (ctx) => {
  const protocol = ctx.match[1];
  const userId = ctx.from.id;

  if (!userState[userId] || !userState[userId].serverId) {
    await ctx.editMessageText("⚠️ Sesi Anda tidak valid atau server belum dipilih. Silakan ulangi dari awal.", { 
        parse_mode: 'Markdown', 
        reply_markup: { inline_keyboard: [[{ text: '🔙 Menu Utama', callback_data: 'kembali' }]] } 
    });
    return;
  }

  const serverId = userState[userId].serverId;
  userState[userId].protocol = protocol; 
  userState[userId].step = 'choosing_final_action_create_or_trial'; 

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row || { saldo: 0, role: 'member' });
      });
    });

    const serverDetails = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!serverDetails) {
      await ctx.editMessageText("⚠️ Server tidak ditemukan.", { 
        parse_mode: 'Markdown', 
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]] } 
      });
      return;
    }

    const role = user.role;
    const hargaPerHari = role === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
    const hargaBulanan = calculatePrice(hargaPerHari, 30); 

    let city = 'Unknown';
    const serverNameLower = serverDetails.nama_server.toLowerCase();
    if (serverNameLower.includes('sg') || serverNameLower.includes('singapore')) {
        city = 'Singapore 🇸🇬';
    } else if (serverNameLower.includes('id') || serverNameLower.includes('indo') || serverNameLower.includes('indonesia')) {
        city = 'Indonesia 🇮🇩';
    } else if (serverNameLower.includes('us')) {
        city = 'United States 🇺🇸';
    }

    const saldoFormatted = user.saldo.toLocaleString('id-ID');
    const protocolUpperCase = protocol.toUpperCase();

    // Format pesan yang disesuaikan dengan contoh Anda
    const messageText = `
<b>PANEL KONFIRMASI ${protocolUpperCase}</b>
──────────────────────
Chat ID : <code>${userId}</code>
Saldo   : <code>Rp${saldoFormatted}</code>
──────────────────────
Server  : <code>${serverDetails.nama_server}</code>
Kota    : <code>${city}</code>
Kuota   : <code>${serverDetails.quota} GB</code>
IP Limit: <code>${serverDetails.iplimit}</code>
──────────────────────
 HARGA ${protocolUpperCase} ${role === 'reseller' ? 'Reseller' : 'Member'}
 Harian  : <code>Rp${hargaPerHari.toLocaleString('id-ID')}</code>
 Bulanan : <code>Rp${hargaBulanan.toLocaleString('id-ID')}</code>
──────────────────────
<i>Premium Panel ${protocolUpperCase} ${NAMA_STORE}</i>
──────────────────────
Silakan pilih aksi Anda:`;

    const keyboard = [
      [{ text: 'BUAT AKUN', callback_data: 'action_do_create_final' }, { text: 'TRIAL AKUN', callback_data: 'action_do_trial_final' }],
      [{ text: '🔙 Kembali Pilih Protokol', callback_data: `server_selected_for_action_${serverId}` }]
    ];

    await ctx.editMessageText(messageText, { 
      parse_mode: 'HTML', 
      reply_markup: { inline_keyboard: keyboard },
      disable_web_page_preview: true 
    });

  } catch (error) {
    console.error('Error di protocol_selected_for_action (pemilihan aksi):', error);
    await ctx.editMessageText("⚠️ Terjadi kesalahan saat memproses. Silakan coba lagi.", {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali Pilih Server', callback_data: 'panel_server_start' }]] }
    });
  }
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

bot.action(/(create|trial)_(ssh|vmess|vless|trojan)_(.+)/, async (ctx) => {
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
    const trialFunctions = { ssh: trialssh, vmess: trialvmess, vless: trialvless, trojan: trialtrojan };
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

  if (!state || !state.step) {
    return;
  }

  // ALUR TOP UP SALDO VIA INPUT TEKS
  if (state.step === 'topup_enter_amount') {
    const amountText = ctx.message.text.trim();
    let userTypedAmountMessageId = ctx.message.message_id;
    let botPromptMessageId = userState[userId] ? userState[userId].lastBotMessageId : null;

    if (botPromptMessageId) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botPromptMessageId); } catch (e) { /* Abaikan error jika gagal hapus */ }
    }
    if (userTypedAmountMessageId) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, userTypedAmountMessageId); } catch (e) { /* Abaikan error jika gagal hapus */ }
    }
    
    if (!/^\d+$/.test(amountText)) {
      delete userState[userId];
      await ctx.reply('⚠️ Jumlah top-up tidak valid. Hanya masukkan angka.\nSilakan ulangi dari menu /menu.');
      return sendMainMenu(ctx);
    }

    const amount = parseInt(amountText, 10);

    if (amount < 10000) {
      delete userState[userId]; 
      await ctx.reply('⚠️ Jumlah top-up minimal adalah Rp10.000.\nSilakan ulangi dari menu /menu.');
      return sendMainMenu(ctx);
    }
    if (amount > 5000000) {
        delete userState[userId];
        await ctx.reply('⚠️ Jumlah top-up maksimal adalah Rp5.000.000.\nSilakan ulangi dari menu /menu.');
        return sendMainMenu(ctx);
    }

    const randomSuffix = Math.floor(Math.random() * (999 - 100 + 1) + 100);
    const uniqueAmount = amount + randomSuffix;
    const usernameForDisplay = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || `User${userId}`);

     const qrisCaption = `
<b>TOP UP SALDO VIA QRIS</b>
──────────────────────
ID User     : <code>${userId}</code>
Username    : ${usernameForDisplay}
Nominal Anda: <code>Rp ${amount.toLocaleString('id-ID')}</code>
──────────────────────
❗️ <b>JUMLAH HARUS DIBAYAR TEPAT</b> ❗️
      <code><b>Rp ${uniqueAmount.toLocaleString('id-ID')}</b></code>
      <i>(Nominal Rp ${amount.toLocaleString('id-ID')} + Kode Unik ${randomSuffix})</i>
──────────────────────
<b>PENTING:</b>
Transfer <b>WAJIB SESUAI</b> dengan nominal unik di atas (<code>Rp ${uniqueAmount.toLocaleString('id-ID')}</code>).
Jika jumlah transfer berbeda, saldo <b>TIDAK AKAN MASUK OTOMATIS</b> dan memerlukan pengecekan manual oleh Admin.

Batas Bayar : <code>${new Date(Date.now() + 4 * 60000).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})} WIB</code>
Kode Transaksi: <code>TRX-${Date.now().toString().slice(-6)}</code>
──────────────────────
Silakan scan Kode QRIS di atas.
Terima kasih.`;

    try {
      const qrisPhotoMessage = await ctx.replyWithPhoto(
        { source: './qris.png' },
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
      
      userState[userId] = { 
        step: 'topup_waiting_payment', 
        uniqueAmount: uniqueAmount, 
        baseAmount: amount,
        qrisMessageId: qrisPhotoMessage.message_id,
        timeout: Date.now() + (4 * 60 * 1000) 
      };

      await topUpQueue.add({ 
          userId, 
          amount: amount, 
          uniqueAmount: uniqueAmount, 
          qrisMessageId: qrisPhotoMessage.message_id 
      });

    } catch (error) {
      console.error("Error mengirim QRIS Topup:", error);
      await ctx.reply("🚫 Terjadi kesalahan saat menampilkan QRIS. Mohon coba lagi atau hubungi admin.");
      delete userState[userId];
      return sendMainMenu(ctx);
    }
  }
  // ALUR PEMBUATAN AKUN PENGGUNA
  else if (state.step.startsWith('username_create_')) { 
    if (!state.action || state.action !== 'create' || !state.type || !state.serverId) {
      console.error("State tidak lengkap atau salah untuk input username (create flow):", state);
      delete userState[userId];
      await ctx.reply("⚠️ Terjadi kesalahan sesi. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
      return sendMainMenu(ctx);
    }
    state.username = ctx.message.text.trim();
    if (state.username.length < 3 || state.username.length > 20 || /[^a-zA-Z0-9]/.test(state.username)) {
      await ctx.reply('🚫 *Username tidak valid (3-20 karakter, alfanumerik, tanpa spasi).*', { parse_mode: 'Markdown' });
      return; 
    }
    userState[userId].lastBotMessageId = ctx.message.message_id; // Simpan ID input user, mungkin akan dihapus nanti

    let nextPromptMessage;
    if (state.type === 'ssh') { 
      state.step = `password_create_${state.type}`; 
      nextPromptMessage = await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
    } else {
      state.step = `exp_create_${state.type}`;
      nextPromptMessage = await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    }
    userState[userId].lastBotMessageId = nextPromptMessage.message_id; // Update ke ID pesan prompt bot terakhir

  } else if (state.step.startsWith('password_create_')) {
    if (!state.action || state.action !== 'create' || state.type !== 'ssh' || !state.serverId || !state.username) {
      console.error("State tidak lengkap atau salah untuk input password (create flow):", state);
      delete userState[userId];
      await ctx.reply("⚠️ Terjadi kesalahan sesi. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
      return sendMainMenu(ctx);
    }
    state.password = ctx.message.text.trim();
    if (state.password.length < 6 || /[^a-zA-Z0-9]/.test(state.password)) {
      await ctx.reply('🚫 *Password tidak valid (min 6 karakter, alfanumerik, tanpa spasi).*', { parse_mode: 'Markdown' });
      return;
    }
    userState[userId].lastUserInputMessageId = ctx.message.message_id; // Simpan ID input password

    state.step = `exp_create_${state.type}`;
    const nextPromptMessage = await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    userState[userId].lastBotMessageId = nextPromptMessage.message_id; // Update

  } else if (state.step.startsWith('exp_create_')) {
    if (!state.action || state.action !== 'create' || !state.type || !state.serverId || !state.username) {
      console.error("State tidak lengkap atau salah untuk input masa aktif (create flow):", state);
      delete userState[userId];
      await ctx.reply("⚠️ Terjadi kesalahan sesi. Silakan ulangi dari awal.", { parse_mode: 'Markdown' });
      return sendMainMenu(ctx);
    }
    const expInput = ctx.message.text.trim();
    if (!/^\d+$/.test(expInput) || parseInt(expInput, 10) <= 0 || parseInt(expInput, 10) > 365) {
      await ctx.reply('🚫 *Masa aktif tidak valid (1-365 hari).*', { parse_mode: 'Markdown' });
      return; 
    }
    state.exp = parseInt(expInput, 10);

    const { username, password, exp, serverId, type } = state; 
    let loadingMessage; 
    let currentMessageId = ctx.message.message_id; // ID pesan input masa aktif dari user
    let prevBotPromptId = userState[userId].lastBotMessageId; // ID pesan "Masukkan masa aktif" dari bot

    try {
      // Hapus pesan prompt terakhir dari bot dan input terakhir dari user
      if (prevBotPromptId) { try { await ctx.telegram.deleteMessage(ctx.chat.id, prevBotPromptId); } catch(e){} }
      if (currentMessageId) { try { await ctx.telegram.deleteMessage(ctx.chat.id, currentMessageId); } catch(e){} }
      
      loadingMessage = await ctx.reply('⏳ Validasi data & persiapan akun...');
      
      const serverDetails = await new Promise((resolve, reject) => {
        db.get('SELECT quota, iplimit, harga, harga_reseller, nama_server, batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], (err, row) => {
          if (err) reject(new Error("Gagal ambil detail server."));
          else if (!row) reject(new Error("Server tidak ditemukan."));
          else resolve(row);
        });
      });

      if (serverDetails.total_create_akun >= serverDetails.batas_create_akun) {
        throw new Error(`Server ${serverDetails.nama_server} penuh.`);
      }

      const userRole = await getUserRole(userId);
      const hargaPerHari = userRole === 'reseller' ? serverDetails.harga_reseller : serverDetails.harga;
      const totalHarga = calculatePrice(hargaPerHari, exp);

      const user = await new Promise((resolve, reject) => {
          db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
              if (err) reject(new Error("Gagal ambil saldo user."));
              else if (!row) reject(new Error("User tidak ditemukan."));
              else resolve(row);
          });
      });
      
      if (user.saldo < totalHarga) {
        throw new Error(`Saldo (Rp${user.saldo.toLocaleString('id-ID')}) tidak cukup. Harga Rp${totalHarga.toLocaleString('id-ID')}.`);
      }

      await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, '⏳ Mengurangi saldo & menghubungi server...');

      await new Promise((resolve, reject) => {
          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], function(err) {
              if (err) reject(new Error("Gagal update saldo."));
              else if (this.changes === 0) reject(new Error("Update saldo gagal (user?)."));
              else resolve();
          });
      });
      
      await recordUserTransaction(userId);
      await new Promise((resolve, reject) => {
          db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], (err) => {
              if (err) console.error('⚠️ Gagal update total_create_akun:', err.message); 
              resolve(); // Tetap resolve meski gagal update counter server
          });
      });
      await updateUserAccountCreation(userId);

      let msg;
      const createFunctions = { ssh: createssh, vmess: createvmess, vless: createvless, trojan: createtrojan };
      if (createFunctions[type]) {
        msg = (type === 'ssh')
          ? await createFunctions[type](username, password, exp, serverDetails.iplimit, serverId)
          : await createFunctions[type](username, exp, serverDetails.quota, serverDetails.iplimit, serverId);
      } else { 
        throw new Error("Tipe layanan tidak valid."); 
      }
      
      try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch(e) {}

      await sendGroupNotificationPurchase(ctx.from.username || `User ${userId}`, userId, type, serverDetails.nama_server, exp);
      await ctx.reply(msg, { parse_mode: 'Markdown' });

    } catch (error) { 
      console.error('Error pembuatan akun (exp_create_):', error.message);
      const finalErrorMessage = `🚫 Gagal: ${error.message || 'Proses tidak berhasil.'}`;
      if (loadingMessage && loadingMessage.message_id) { 
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, loadingMessage.message_id, undefined, finalErrorMessage, {parse_mode: 'Markdown'});
        } catch (editError) {
          await ctx.reply(finalErrorMessage, { parse_mode: 'Markdown' });
        }
      } else { 
        await ctx.reply(finalErrorMessage, { parse_mode: 'Markdown' });
      }
    } finally { 
      delete userState[userId]; 
      await sendMainMenu(ctx); 
    }
  }
  // ALUR PENAMBAHAN SERVER OLEH ADMIN 
  else if (state.step === 'addserver_domain') {
    const domain = ctx.message.text.trim();
    if (!domain) { await ctx.reply('⚠️ *Domain tidak boleh kosong.* Masukkan domain server.', { parse_mode: 'Markdown' }); return; }
    state.domain = domain; state.step = 'addserver_auth';
    await ctx.reply('🔑 *Masukkan auth server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_auth') {
    const auth = ctx.message.text.trim();
    if (!auth) { await ctx.reply('⚠️ *Auth tidak boleh kosong.* Masukkan auth server.', { parse_mode: 'Markdown' }); return; }
    state.auth = auth; state.step = 'addserver_nama_server';
    await ctx.reply('🏷️ *Masukkan nama server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_nama_server') {
    const nama_server = ctx.message.text.trim();
    if (!nama_server) { await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Masukkan nama server.', { parse_mode: 'Markdown' }); return; }
    state.nama_server = nama_server; state.step = 'addserver_quota';
    await ctx.reply('📊 *Masukkan quota server (GB), contoh: 50*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_quota') {
    const quotaInput = ctx.message.text.trim();
    if (!/^\d+$/.test(quotaInput) || parseInt(quotaInput, 10) <=0) {
        await ctx.reply('⚠️ *Quota tidak valid.* Masukkan angka positif (GB).', { parse_mode: 'Markdown' }); return;
    }
    state.quota = parseInt(quotaInput, 10); state.step = 'addserver_iplimit';
    await ctx.reply('🔢 *Masukkan limit IP server, contoh: 2*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_iplimit') {
    const iplimitInput = ctx.message.text.trim();
    if (!/^\d+$/.test(iplimitInput) || parseInt(iplimitInput, 10) <=0) {
        await ctx.reply('⚠️ *Limit IP tidak valid.* Masukkan angka positif.', { parse_mode: 'Markdown' }); return;
    }
    state.iplimit = parseInt(iplimitInput, 10); state.step = 'addserver_batas_create_akun';
    await ctx.reply('🔢 *Masukkan batas maksimal pembuatan akun di server ini, contoh: 100*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_batas_create_akun') {
    const batasCreateInput = ctx.message.text.trim();
     if (!/^\d+$/.test(batasCreateInput) || parseInt(batasCreateInput, 10) <=0) {
        await ctx.reply('⚠️ *Batas create akun tidak valid.* Masukkan angka positif.', { parse_mode: 'Markdown' }); return;
    }
    state.batas_create_akun = parseInt(batasCreateInput, 10); state.step = 'addserver_harga';
    await ctx.reply('💰 *Masukkan harga server per hari (untuk member), contoh: 300*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga') {
    const hargaInput = ctx.message.text.trim();
    if (!/^\d+$/.test(hargaInput) || parseInt(hargaInput, 10) <=0) { 
        await ctx.reply('⚠️ *Harga tidak valid.* Masukkan angka integer positif.', { parse_mode: 'Markdown' }); return;
    }
    state.harga = parseInt(hargaInput); 
    state.step = 'addserver_harga_reseller';
    await ctx.reply('💰 *Masukkan harga server per hari (untuk reseller), contoh: 150*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga_reseller') {
    const hargaResellerInput = ctx.message.text.trim();
    if (!/^\d+$/.test(hargaResellerInput) || parseInt(hargaResellerInput, 10) <=0) {
        await ctx.reply('⚠️ *Harga reseller tidak valid.* Masukkan angka integer positif.', { parse_mode: 'Markdown' }); return;
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
            `- Domain: ${domain}\n- Auth: ${auth}\n` +
            `- Quota: ${quota}GB, IP Limit: ${iplimit}\n` +
            `- Batas Akun: ${batas_create_akun}\n` +
            `- Harga Member: Rp${harga}/hr, Reseller: Rp${harga_reseller}/hr`, { parse_mode: 'Markdown' });
        }
        delete userState[userId]; 
      }
    );
  }
  else {
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
    await ctx.answerCbQuery(); // Jawab callback button dulu
    const userId = ctx.from.id;
    console.log(`User ${userId} memulai proses top-up saldo via teks.`);

    // Hapus pesan menu sebelumnya tempat tombol topup ditekan
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.deleteMessage();
        }
    } catch (e) {
        console.warn("Gagal menghapus pesan menu topup:", e.message);
    }
    
    userState[userId] = { step: 'topup_enter_amount' };

    const promptMessage = await ctx.reply('Silakan ketikkan jumlah nominal saldo yang ingin Anda top-up.\n\nMinimal: Rp10.000\nContoh: `10000`', {
      parse_mode: 'Markdown',
      reply_markup: { // Tambahkan tombol batal jika pengguna ingin kembali
          inline_keyboard: [
              [{ text: '❌ Batal & Kembali ke Menu', callback_data: 'kembali' }]
          ]
      }
    });
    // Simpan ID pesan prompt agar bisa dihapus nanti
    if (userState[userId]) { // Pastikan state masih ada
        userState[userId].lastBotMessageId = promptMessage.message_id;
    }

  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses top-up saldo via teks:', error);
    await ctx.reply('🚫 Gagal memulai proses top-up. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
    // Jika error, pastikan state dibersihkan
    if (ctx.from && ctx.from.id) {
        delete userState[ctx.from.id];
    }
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  // Pastikan state pengguna ada dan sedang dalam proses input jumlah
  if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
    let currentAmount = global.depositState[userId].amount;

    try {
      if (data === 'delete') {
        // Hapus digit terakhir
        currentAmount = currentAmount.slice(0, -1);
      } else if (data === 'confirm') {
        // Validasi jumlah
        if (currentAmount.length === 0) {
          return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
        }
        if (parseInt(currentAmount) < 10000) {
          return await ctx.answerCbQuery('⚠️ Jumlah minimal 10.000!', { show_alert: true });
        }

        // Buat nominal unik
        const randomSuffix = Math.floor(10 + Math.random() * 90);
        const uniqueAmount = parseInt(currentAmount) + randomSuffix;

        // Kirim QRIS Pembayaran
        const message = await ctx.replyWithPhoto({ source: './qris.png' }, {
  caption: `
<b>══════════════════════</b>
                <b>OPEN TOPUP</b>       
<b>══════════════════════</b>
✧ <b>User</b>: @${ctx.from.username}
✧ <b>ID</b>: ${userId}
✧ <b>Amount</b>: Rp ${parseInt(currentAmount).toLocaleString('id-ID')}
<b>══════════════════════</b>
            <b>DETAIL PEMBAYARAN</b>    
<b>══════════════════════</b>
✧ <b>Kode Pembayaran</b>: <code>TRX-${Math.floor(100000 + Math.random() * 900000)}</code>
✧ <b>JUMLAH YANG HARUS DIBAYAR</b>:<code><b> 
   <u>Rp ${uniqueAmount.toLocaleString('id-ID')}</u></b></code>
⏳ <b>Status</b>: <code>Pending</code>
⌛ <b>Batas Waktu</b>: <code>${new Date(Date.now() + 3 * 60000).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</code>
📅 <b>Tanggal</b>: ${new Date().toLocaleString('id-ID')}

<blockquote>⚠️ <b>PERHATIAN</b> ⚠️
• Bayar <b>TEPAT</b> sesuai jumlah di atas
• Jangan kurangi atau tambahkan nominal
• Transaksi akan gagal jika nominal tidak sesuai
• Hubungi admin jika ada masalah</blockquote>
`,
  parse_mode: 'HTML'
});

        // Simpan ID pesan QR untuk dihapus nanti
        global.depositState[userId] = { uniqueAmount, userId, messageId: message.message_id };

        // Tambahkan pekerjaan ke queue
        await topUpQueue.add({ userId, amount: parseInt(currentAmount), uniqueAmount });

        return;
      } else {
        // Tambahkan digit ke jumlah saat ini
        if (currentAmount.length < 12) {
          currentAmount += data;
        } else {
          return await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true });
        }
      }

      // Update state dan tampilkan jumlah saat ini
      global.depositState[userId].amount = currentAmount;
      const newMessage = `*jumlah nominal saldo [Minimal 10.000]:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
      if (newMessage !== ctx.callbackQuery.message.text) {
        await ctx.editMessageText(newMessage, {
          reply_markup: { inline_keyboard: keyboard_nomor() },
          parse_mode: 'Markdown',
        });
      }
    } catch (error) {
      console.error('🚫 Kesalahan saat memproses top-up:', error);
      await ctx.reply('🚫 Gagal memproses top-up. Silakan coba lagi.', { parse_mode: 'Markdown' });
    }
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

  try {
    let pembayaranDiterima = false;
    const userCurrentState = userState[userId];
    const timeout = (userCurrentState && userCurrentState.step === 'topup_waiting_payment' && userCurrentState.uniqueAmount === uniqueAmount) 
                    ? userCurrentState.timeout 
                    : Date.now() + (3.8 * 60 * 1000);

    while (Date.now() < timeout) {
      if (userState[userId]?.step !== 'topup_waiting_payment' || userState[userId]?.uniqueAmount !== uniqueAmount) {
          console.log(`Proses topup untuk User ${userId} (${uniqueAmount}) dihentikan karena state berubah atau dibatalkan.`);
          return; 
      }
      const transaksi = await cekMutasi(uniqueAmount); 
      if (transaksi) {
        console.log(`✅ Pembayaran OkeConnect diterima: ${transaksi.buyer_reff || 'N/A'}, amount: ${transaksi.amount}`);
        
        if (qrisMessageId) {
            try { await bot.telegram.deleteMessage(userId, qrisMessageId); } catch (e) { console.warn("Gagal hapus QRIS msg:", e.message); }
        }
        
        // --- AWAL LOGIKA BONUS ---
        const amountActuallyPaidByUser = parseInt(transaksi.amount); // Ambil dari mutasi, ini adalah uniqueAmount
        // `amount` dari job.data adalah baseAmount sebelum kode unik.
        const baseAmountToppedUp = amount; // Ini adalah jumlah yang diketik user sebelum kode unik

        let bonusAmountApplied = 0;
        const bonusConfig = await getActiveBonusConfig();

        if (bonusConfig && baseAmountToppedUp >= bonusConfig.min_topup_amount) {
            bonusAmountApplied = calculateBonusAmount(baseAmountToppedUp, bonusConfig);
        }
        // --- AKHIR LOGIKA BONUS ---

        const totalAmountToCredit = baseAmountToppedUp + bonusAmountApplied;

        await new Promise((resolve, reject) => {
            db.run("UPDATE users SET saldo = saldo + ?, last_topup_date = datetime('now', 'localtime') WHERE user_id = ?", 
            [totalAmountToCredit, userId], 
            (err) => { if(err) reject(err); else resolve(); });
        });
        
        await checkAndUpdateUserRole(userId);
        await recordUserTransaction(userId);

        const userInfo = await bot.telegram.getChat(userId);
        const username = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || `User ${userId}`);
        
        // Kirim notifikasi dengan info bonus
        await sendUserNotificationTopup(userId, baseAmountToppedUp, amountActuallyPaidByUser, bonusAmountApplied);
        await sendAdminNotificationTopup(username, userId, baseAmountToppedUp, amountActuallyPaidByUser, bonusAmountApplied);
        await sendGroupNotificationTopup(username, userId, baseAmountToppedUp, amountActuallyPaidByUser, bonusAmountApplied);

        pembayaranDiterima = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10000)); 
    }

    // ... (sisa fungsi tidak berubah) ...
    if (!pembayaranDiterima) {
      if (userState[userId]?.step === 'topup_waiting_payment' && userState[userId]?.uniqueAmount === uniqueAmount) {
        console.log(`🚫 Pembayaran OkeConnect tidak ditemukan user ${userId}, unique: ${uniqueAmount} (TIMEOUT SERVER)`);
        if (qrisMessageId) {
            try { await bot.telegram.deleteMessage(userId, qrisMessageId); } catch (e) { console.warn("Gagal hapus QRIS msg (timeout server):", e.message); }
        }
        await bot.telegram.sendMessage(userId, '🚫 TopUp QRIS Gagal karena melewati batas waktu pembayaran. Saldo unik Anda (jika terlanjur transfer) akan dicek manual oleh admin dalam 1x24 jam.', { parse_mode: 'Markdown' });
      }
    }
  } catch (error) {
    console.error('🚫 Kesalahan proses top-up OkeConnect:', error);
    if (qrisMessageId && userId) { 
        try {
            await bot.telegram.sendMessage(userId, '🚫 Terjadi kesalahan sistem saat topup. Hubungi Admin.', { parse_mode: 'Markdown' });
        } catch(e){}
    }
  } finally {
    if (userState[userId] && userState[userId].uniqueAmount === uniqueAmount) {
      delete userState[userId];
    }
  }
});



// Fungsi untuk mengecek mutasi transaksi dari OkeConnect
async function cekMutasi(expectedAmount, maxWaitTime = 140000, interval = 5000) {
  try {
    const startTime = Date.now();
    const apiKey = vars.OKE_API_KEY;
    const IdMerch = vars.OKE_API_BASE;
    const url = `https://gateway.okeconnect.com/api/mutasi/qris/${IdMerch}/${apiKey}`;

    console.log(`🔄 Mengakses API: ${url}`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(url, { 
          timeout: 10000,
          validateStatus: function (status) {
            return status >= 200 && status < 500; // Terima semua response < 500
          }
        });

        if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
          const mutasiTerbaru = response.data.data.find(item => 
            item.type === 'CR' && 
            parseInt(item.amount) === parseInt(expectedAmount)
          );

          if (mutasiTerbaru) {
            console.log(`✅ Pembayaran ditemukan: Rp${mutasiTerbaru.amount}`);
            return mutasiTerbaru;
          }
        }
      } catch (err) {
        console.error('🚫 Gagal mengambil mutasi:', err.message);
        // Tidak throw error, tapi lanjutkan loop
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    return null;
  } catch (error) {
    console.error('🚫 Kesalahan fatal saat mengambil mutasi:', error);
    return null;
  }
}





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

// Fungsi untuk memvalidasi link

app.listen(port, () => {
    bot.launch().then(() => {
        console.log('Bot telah dimulai');
    }).catch((error) => {
        console.error('Error Kritis saat memulai bot (bot.launch()):', error);
        // Pastikan bot keluar dengan kode error agar systemd bisa merestart
        process.exit(1); // <<< BARIS INI SANGAT PENTING
    });
    console.log(`Server berjalan di port ${port}`);
});
