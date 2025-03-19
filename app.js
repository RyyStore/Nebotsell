const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const crypto = require('crypto');
const { Telegraf, Scenes, session } = require('telegraf');
const topUpQueue = require('./queue');


const app = express();
const axios = require('axios');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { createssh, createvmess, createvless, createtrojan, createshadowsocks } = require('./modules/create');
const { renewssh, renewvmess, renewvless, renewtrojan, renewshadowsocks } = require('./modules/renew');

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const PAYDISINI_KEY = vars.PAYDISINI_KEY; // Sudah di-set di VPS
const BOT_TOKEN = vars.BOT_TOKEN; // Sudah di-set di VPS
const port = vars.PORT || 50123; // Sudah di-set di VPS
const ADMIN = vars.USER_ID; // Sudah di-set di VPS
const NAMA_STORE = vars.NAMA_STORE || '@RyyStore'; // Sudah di-set di VPS
const GROUP_ID = "-1002397066993"; // Tambahkan grup ID di sini
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
  total_create_akun INTEGER
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
  saldo INTEGER DEFAULT 0,
  role TEXT DEFAULT 'member',
  last_topup_date TEXT,                     -- Tanggal terakhir top-up
  transaction_count INTEGER DEFAULT 0,      -- Jumlah transaksi dalam 30 hari terakhir
  total_accounts_created INTEGER DEFAULT 0, -- Total akun yang dibuat
  last_account_creation_date TEXT,          -- Tanggal terakhir membuat akun
  last_transaction_date TEXT,               -- Tanggal transaksi terakhir (ditambahkan)
  CONSTRAINT unique_user_id UNIQUE (user_id)
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel users:', err.message);
  } else {
    console.log('Users table created or already exists');
  }
});

const userState = {};
console.log('User state initialized');

const userSessions = {}; // Simpan message_id terakhir untuk setiap user

const userMessages = {}; // Menyimpan message_id terakhir untuk setiap user

bot.command(['start', 'menu'], async (ctx) => {
  console.log('Start or Menu command received');

  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : "Tidak ada username";

  // **Hapus pesan lama jika ada**
  if (userMessages[userId]) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, userMessages[userId]);
      console.log(`Pesan lama (${userMessages[userId]}) dihapus untuk user ${userId}`);
    } catch (error) {
      console.warn(`Gagal menghapus pesan lama: ${error.message}`);
    }
  }

  // Ambil data dari database
  db.get('SELECT * FROM users WHERE user_id = ?', [userId], async (err, row) => {
    if (err) {
      console.error('Kesalahan saat memeriksa user_id:', err.message);
      return;
    }

    if (!row) {
      db.run('INSERT INTO users (user_id) VALUES (?)', [userId], (err) => {
        if (err) {
          console.error('Kesalahan saat menyimpan user_id:', err.message);
        } else {
          console.log(`User ID ${userId} berhasil disimpan`);
        }
      });
    }

    const jumlahServer = await getJumlahServer();
    const jumlahPengguna = await getJumlahPengguna();

    const keyboard = [
      [
        { text: 'CARA TOPUP', url: 'https://t.me/internetgratisin/21' },
        { text: 'CARA GENERATE BUG', url: 'https://t.me/internetgratisin/22' },
      ],
      [
        { text: 'CARA ORDER', url: 'https://t.me/internetgratisin/23' },
        { text: 'CARA RENEW AKUN', url: 'https://t.me/internetgratisin/24' },
      ],
      [
        { text: 'GRUP TELEGRAM', url: 'https://t.me/RyyStoreevpn/1' },
        { text: 'GRUP WHATSAPP', url: 'https://chat.whatsapp.com/J8xxgw6eVJ23wY5JbluDfJ' },
      ],
      [
        { text: 'MAIN MENU♻️', callback_data: 'main_menu_refresh' }
      ]
    ];

    const messageText = `* ──────────────────────────
          ≡🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​​ 🇻​​​​​🇵​​​​​🇳​ ≡
 ──────────────────────────
                 ⟨ 𝘿𝘼𝙎𝙃𝘽𝙊𝘼𝙍𝘿 𝙏𝙐𝙏𝙊𝙍𝙄𝘼𝙇 ⟩                          
 ──────────────────────────
  Sᴇʟᴀᴍᴀᴛ Dᴀᴛᴀɴɢ *_${username}_*
 𝙸𝙳 𝚊𝚗𝚍𝚊: *_${userId}_*
 ──────────────────────────
 
Jika sudah paham
Bisa langsung ke MainMenu♻️

🟩𝙅𝙄𝙆𝘼 𝙄𝙉𝙂𝙄𝙉 𝙍𝙀𝙎𝙀𝙇𝙇𝙀𝙍 𝙏𝙊𝙋𝙐𝙋
𝙈𝙄𝙉𝙄𝙈𝘼𝙇 25000
𝘿𝙄𝙎𝙆𝙊𝙉 50% 𝘿𝘼𝙍𝙄 𝙃𝘼𝙍𝙂𝘼 𝙉𝙊𝙍𝙈𝘼𝙇✅

──────────────────────────
Lɪsᴛ Hᴀʀɢᴀ Sᴇʀᴠᴇʀ Tᴇʀᴍᴜʀᴀʜ✴️
SGDO 🇸🇬    : 134/Hᴀʀɪ reseller
INDO  🇮🇩    : 334/Hᴀʀɪ 
──────────────────────────
๑۞๑ 𝗞𝗘𝗦𝗨𝗹𝗜𝗧𝗔𝗡❓𝘾𝙃𝘼𝙏 𝙊𝙒𝙉𝙀𝙍 @RyyStorevp1*
   ☏ [WhatsApp](https://wa.me/6287767287284)
 ──────────────────────────
*Sɪʟᴀᴋᴀɴ ᴘɪʟɪʜ ᴏᴘsɪ ʟᴀʏᴀɴᴀɴ:*`;

    try {
      const sentMessage = await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

      // **Simpan message_id baru untuk nanti dihapus saat /menu dipanggil lagi**
      userMessages[userId] = sentMessage.message_id;
      console.log(`Pesan baru disimpan dengan ID: ${sentMessage.message_id}`);
    } catch (error) {
      console.error('Error saat mengirim menu utama:', error);
    }
  });
});

async function getUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT saldo FROM users WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.saldo : 0);
        }
      }
    );
  });
}

// Fungsi untuk mendapatkan jumlah server
async function getJumlahServer() {
  // Implementasi query ke database atau sumber data lainnya
  return 10; // Contoh nilai
}

// Fungsi untuk mendapatkan jumlah pengguna
async function getJumlahPengguna() {
  // Implementasi query ke database atau sumber data lainnya
  return 100; // Contoh nilai
}


async function checkAndAddBonusSaldo(userId) {
  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT transaction_count, last_transaction_date FROM users WHERE user_id = ?', [userId], (err, row) => {
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

    const { transaction_count, last_transaction_date } = user;

    // Hitung selisih hari sejak transaksi terakhir
    const currentDate = new Date();
    const lastTransactionDate = new Date(last_transaction_date);
    const diffTime = currentDate - lastTransactionDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Selisih dalam hari

    // Jika dalam 30 hari dan transaksi >= 10, berikan bonus saldo
    if (diffDays <= 30 && transaction_count >= 10) {
      const bonusAmount = 10000; // Bonus saldo 10.000
      await updateUserSaldo(userId, bonusAmount);

      console.log(`✅ Bonus saldo sebesar Rp${bonusAmount} diberikan ke pengguna ${userId}.`);

      // Kirim notifikasi ke pengguna
      await bot.telegram.sendMessage(userId, `🎉 Selamat! Anda mendapatkan bonus saldo sebesar Rp${bonusAmount} karena telah menyelesaikan 10 transaksi dalam 30 hari.`, { parse_mode: 'Markdown' });

      // Reset jumlah transaksi
      db.run('UPDATE users SET transaction_count = 0 WHERE user_id = ?', [userId], (err) => {
        if (err) {
          console.error('🚫 Gagal mereset jumlah transaksi:', err.message);
        }
      });
    }
  } catch (error) {
    console.error('🚫 Gagal memeriksa dan menambahkan bonus saldo:', error);
  }
}

// Fungsi untuk memeriksa dan mengupdate role pengguna berdasarkan transaksi
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
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET role = ? WHERE user_id = ?', ['reseller', userId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      console.log(`✅ Role pengguna ${userId} diubah menjadi reseller.`);

      // **Ambil username pengguna**
      const chat = await bot.telegram.getChat(userId);
      const username = chat.username ? `@${chat.username}` : `User ID: ${userId}`;

      // **Kirim notifikasi ke pengguna**
      await bot.telegram.sendMessage(userId, '🎉 Selamat! Anda sekarang menjadi reseller.', { parse_mode: 'Markdown' });

      // **Kirim notifikasi ke admin**
      await bot.telegram.sendMessage(ADMIN, `🎉 Pengguna ${username} telah diupgrade menjadi reseller.`, { parse_mode: 'Markdown' });

      // **Kirim notifikasi ke grup**
      const groupId = GROUP_ID; // Ganti dengan ID grup Telegram
      await bot.telegram.sendMessage(groupId, `🎉 Pengguna ${username} telah diupgrade menjadi *reseller*!`, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('🚫 Gagal memeriksa dan mengupdate role pengguna:', error);
  }
}


async function sendUserNotificationTopup(userId, amount, uniqueAmount) {
  const userMessage = `
──────────────────────
⟨ STATUS TOPUP SUCCESS ⟩
──────────────────────
➥ *Saldo Ditambahkan:* Rp${amount.toLocaleString('id-ID')}
➥ *Kode Transaksi:* TRX-${Math.floor(100000 + Math.random() * 900000)}
➥ *Total Pembayaran:* Rp${uniqueAmount.toLocaleString('id-ID')}
➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}
──────────────────────
Terima kasih telah melakukan top-up di RyyStore!
`;

  try {
    await bot.telegram.sendMessage(userId, userMessage, { parse_mode: 'Markdown' });
    console.log(`✅ Notifikasi top-up berhasil dikirim ke pengguna ${userId}`);
  } catch (error) {
    console.error('🚫 Gagal mengirim notifikasi top-up ke pengguna:', error.message);
  }
}

async function sendAdminNotificationTopup(username, userId, amount, uniqueAmount) {
  const adminMessage = `
──────────────────────
⟨ NOTIFIKASI TOPUP ⟩
──────────────────────
➥ *Username:* [${username}](tg://user?id=${userId})
➥ *User ID:* ${userId}
➥ *Jumlah Top-up:* Rp${amount.toLocaleString('id-ID')}
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

async function sendGroupNotificationTopup(username, userId, amount, uniqueAmount) {
  const groupMessage = `
──────────────────────
⟨ NOTIFIKASI TOPUP ⟩
──────────────────────
➥ *Username:* [${username}](tg://user?id=${userId})
➥ *User ID:* ${userId}
➥ *Jumlah Top-up:* Rp${amount.toLocaleString('id-ID')}
➥ *Kode Transaksi:* TRX-${Math.floor(100000 + Math.random() * 900000)}
➥ *Tanggal:* ${new Date().toLocaleString('id-ID')}
──────────────────────
`;

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

async function handlePurchase(userId, amount) {
  try {
    // Kurangi saldo pengguna
    await updateUserSaldo(userId, -amount);

    // Catat transaksi pengurangan saldo sebagai pembuatan akun
    const currentDate = new Date().toISOString();
    db.run(
      'INSERT INTO transactions (user_id, amount, transaction_type, transaction_date) VALUES (?, ?, ?, ?)',
      [userId, amount, 'create_account', currentDate],
      (err) => {
        if (err) {
          console.error('Error recording transaction:', err.message);
        } else {
          console.log(`Transaction recorded for user ${userId}`);
        }
      }
    );

    console.log(`✅ Pembelian berhasil diproses untuk user ${userId}.`);
  } catch (error) {
    console.error('🚫 Gagal memproses pembelian:', error);
    throw error;
  }
}

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

  const servers = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM Server', [], (err, rows) => {
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
bot.command('admin', async (ctx) => {
  console.log('Admin menu requested');
  
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

bot.action('main_menu_refresh', async (ctx) => {
  console.log('Tombol MAIN MENU♻️ diklik oleh:', ctx.from.id);

  try {
    console.log('Mencoba menghapus pesan...');
    await ctx.deleteMessage();
    console.log('Pesan berhasil dihapus.');
  } catch (deleteError) {
    console.warn('Tidak dapat menghapus pesan:', deleteError.message);
  }

  try {
    console.log('Mencoba menampilkan menu utama...');
    await sendMainMenu(ctx);
    console.log('Menu utama berhasil ditampilkan.');
  } catch (menuError) {
    console.error('Gagal menampilkan menu utama:', menuError);
    await ctx.reply('🚫 Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi.', { parse_mode: 'Markdown' });
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


   async function sendMainMenu(ctx) {
  const keyboard = [
    [
      { text: 'CREATE AKUN', callback_data: 'service_create' },
      { text: 'RENEW AKUN', callback_data: 'service_renew' }
    ],
    [
      { text: 'TOPUP SALDO [QRIS]', callback_data: 'topup_saldo' },
    ],
    [
      { text: 'REFRESH', callback_data: 'refresh_menu' }
    ],
  ];

  const uptime = os.uptime();
  const days = Math.floor(uptime / (60 * 60 * 24));

  let jumlahServer = 0;
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    jumlahServer = row.count;
  } catch (err) {
    console.error('Kesalahan saat mengambil jumlah server:', err.message);
  }

  let jumlahPengguna = 0;
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    jumlahPengguna = row.count;
  } catch (err) {
    console.error('Kesalahan saat mengambil jumlah pengguna:', err.message);
  }

  const username = ctx.from.username ? `@${ctx.from.username}` : "Tidak ada username";
  const userId = ctx.from.id;

  // Ambil saldo dan role pengguna dari database
  let saldo = 0;
  let role = 'member'; // Default role adalah 'member'
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    if (row) {
      saldo = row.saldo;
      role = row.role || 'member'; // Jika role tidak ada, default ke 'member'
    }
  } catch (err) {
    console.error('Kesalahan saat mengambil saldo atau role pengguna:', err.message);
  }

  // Tampilkan status role di messageText
  const messageText = `* ──────────────────────────
         ≡🇷​​​​​🇾​​​​​🇾​​​​​🇸​​​​​🇹​​​​​🇴​​​​​🇷​​​​​🇪​​​​​ 🇻​​​​​🇵​​​​​🇳​ ≡
 ──────────────────────────
 Sᴇʟᴀᴍᴀᴛ Dᴀᴛᴀɴɢ *_${username}_*
 𝙸𝙳 𝚊𝚗𝚍𝚊: *_${userId}_*
 ──────────────────────────
 ᴋᴇᴍʙᴀʟɪ ᴋᴇ Dᴀsʜʙᴏᴀʀᴅ Tᴜᴛᴏʀɪᴀʟ:
/menu   
 ──────────────────────────
 
🟩𝙅𝙄𝙆𝘼 𝙄𝙉𝙂𝙄𝙉 𝙍𝙀𝙎𝙀𝙇𝙇𝙀𝙍 𝙏𝙊𝙋𝙐𝙋
𝙈𝙄𝙉𝙄𝙈𝘼𝙇 25000
𝘿𝙄𝙎𝙆𝙊𝙉 50% 𝘿𝘼𝙍𝙄 𝙃𝘼𝙍𝙂𝘼 𝙉𝙊𝙍𝙈𝘼𝙇✅
                       
 ──────────────────────────
 
Lɪsᴛ Hᴀʀɢᴀ Sᴇʀᴠᴇʀ Tᴇʀᴍᴜʀᴀʜ✴️
SGDO 🇸🇬    : 134/Hᴀʀɪ
INDO  🇮🇩    : 334/Hᴀʀɪ

──────────────────────────

Sᴇᴍᴜᴀ sᴇʀᴠᴇʀ Dɪᴊᴀᴍɪɴ Bᴇʀɢᴀʀᴀɴsɪ 
Sᴇsᴜᴀɪ Dᴜʀᴀsɪ ʏᴀɴɢ ᴅɪᴘɪʟɪʜ
 𝙆𝙚𝙘𝙪𝙖𝙡𝙞 𝙈𝙚𝙡𝙖𝙣𝙜𝙜𝙖𝙧 𝘼𝙩𝙪𝙧𝙖𝙣
  
 ──────────────────────────
🏷️ *Status:* ${role === 'reseller' ? 'Reseller 🛒' : 'Member 👤'}
☁ *Sᴇʀᴠᴇʀ ᴛᴇʀsᴇᴅɪᴀ:* ${jumlahServer}
유 *Tᴏᴛᴀʟ Usᴇʀ:* ${jumlahPengguna}
💳 *Sᴀʟᴅᴏ:* Rp${saldo}
──────────────────────────
๑۞๑ 𝙊𝙒𝙉𝙀𝙍 𝘽𝙊𝙏 @RyyStorevp1*
   ☏ [WhatsApp](https://wa.me/6287767287284)
 ──────────────────────────
*Sɪʟᴀᴋᴀɴ ᴘɪʟɪʜ ᴏᴘsɪ ʟᴀʏᴀɴᴀɴ*`;

  try {
    await ctx.reply(messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    console.log('Main menu sent');
  } catch (error) {
    console.error('Error saat mengirim menu utama:', error);
  }
}
bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const helpMessage = `
*📋 Daftar Perintah Admin:*

1. /addserver - Menambahkan server baru.
2. /addsaldo - Menambahkan saldo ke akun pengguna.
3. /ceksaldo - Melihat saldo semua akun pengguna.
4. /editharga - Mengedit harga layanan.
5. /editnama - Mengedit nama server.
6. /editdomain - Mengedit domain server.
7. /editauth - Mengedit auth server.
8. /editlimitquota - Mengedit batas quota server.
9. /editlimitip - Mengedit batas IP server.
10. /editlimitcreate - Mengedit batas pembuatan akun server.
11. /edittotalcreate - Mengedit total pembuatan akun server.
12. /broadcast - Mengirim pesan siaran ke semua pengguna.
13. /hapussaldo -Menghapus saldo
14. /listserver - melihat server
15. /detailserver - melihat detail server


Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;

  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
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
  const userId = ctx.message.from.id;
  console.log(`Broadcast command received from user_id: ${userId}`);
  if (!adminIds.includes(userId)) {
      console.log(`⚠️ User ${userId} tidak memiliki izin untuk menggunakan perintah ini.`);
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const message = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : ctx.message.text.split(' ').slice(1).join(' ');
  if (!message) {
      console.log('⚠️ Pesan untuk disiarkan tidak diberikan.');
      return ctx.reply('⚠️ Mohon berikan pesan untuk disiarkan.', { parse_mode: 'Markdown' });
  }

  db.all("SELECT user_id FROM users", [], (err, rows) => {
      if (err) {
          console.error('⚠️ Kesalahan saat mengambil daftar pengguna:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengambil daftar pengguna.', { parse_mode: 'Markdown' });
      }

      rows.forEach((row) => {
          const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
          axios.post(telegramUrl, {
              chat_id: row.user_id,
              text: message
          }).then(() => {
              console.log(`✅ Pesan siaran berhasil dikirim ke ${row.user_id}`);
          }).catch((error) => {
              console.error(`⚠️ Kesalahan saat mengirim pesan siaran ke ${row.user_id}`, error.message);
          });
      });

      ctx.reply('✅ Pesan siaran berhasil dikirim.', { parse_mode: 'Markdown' });
  });
});

global.broadcastMessages = {}; // Penyimpanan sementara pesan yang akan dikirim

bot.command('send', async (ctx) => {
    const userId = ctx.message.from.id;
    if (!adminIds.includes(userId)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }

    const args = ctx.message.text.split(' ').slice(0);
    const message = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : args.slice(1).join(' ');

    if (!message) {
        return ctx.reply('⚠️ Mohon berikan pesan untuk disiarkan.', { parse_mode: 'Markdown' });
    }

    if (args.length > 0 && !isNaN(args[0])) {
        // Jika admin memasukkan user_id langsung
        const targetUserId = args[0];
        sendMessageToUser(targetUserId, message, ctx);
    } else {
        // Jika tidak ada user_id, tampilkan daftar user untuk dipilih
        db.all("SELECT user_id FROM users", [], async (err, rows) => {
            if (err) {
                console.error('⚠️ Kesalahan saat mengambil daftar pengguna:', err.message);
                return ctx.reply('⚠️ Kesalahan saat mengambil daftar pengguna.', { parse_mode: 'Markdown' });
            }

            if (rows.length === 0) {
                return ctx.reply('⚠️ Tidak ada pengguna dalam database.', { parse_mode: 'Markdown' });
            }

            const buttons = [];
            for (let i = 0; i < rows.length; i += 2) {
                const row = [];

                // Buat ID unik untuk pesan ini
                const messageId = crypto.randomUUID();
                global.broadcastMessages[messageId] = message;

                const username1 = await getUsernameById(rows[i].user_id);
                row.push({ text: username1, callback_data: `broadcast_${rows[i].user_id}_${messageId}` });

                if (i + 1 < rows.length) {
                    const messageId2 = crypto.randomUUID();
                    global.broadcastMessages[messageId2] = message;

                    const username2 = await getUsernameById(rows[i + 1].user_id);
                    row.push({ text: username2, callback_data: `broadcast_${rows[i + 1].user_id}_${messageId2}` });
                }

                buttons.push(row);
            }

            ctx.reply('📢 Pilih pengguna untuk menerima Pesan:', {
                reply_markup: { inline_keyboard: buttons }
            });
        });
    }
});

bot.action('main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

bot.action(/^broadcast_(\d+)_(.+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match) return;
    const userId = match[1];
    const messageId = match[2];

    const message = global.broadcastMessages[messageId];
    if (!message) {
        return ctx.reply('⚠️ Pesan tidak ditemukan atau telah kadaluarsa.');
    }

    delete global.broadcastMessages[messageId]; // Hapus dari cache setelah digunakan
    sendMessageToUser(userId, message, ctx);
});

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

  // Hitung total harga berdasarkan masa aktif
  const totalHarga = hargaPerHari * expDays; // Total harga = harga per hari * masa aktif

  // Format tanggal saat ini
  const currentDate = new Date().toLocaleString('id-ID');

  const groupMessage = `
──────────────────────
⟨ TRX PAYVPN BOT ⟩
──────────────────────
THANKS TO
➥ User  : [${username}](tg://user?id=${userId})
➥ Role  : ${userRole === 'reseller' ? 'Reseller 🛒' : 'Member 👤'}
──────────────────────
➥ Layanan : ${serviceType}
➥ Server : ${serverName}
➥ Harga per Hari : Rp${hargaPerHari.toLocaleString('id-ID')}
➥ Masa Aktif : ${expDays} Hari
➥ Total Harga : Rp${totalHarga.toLocaleString('id-ID')}
➥ Tanggal : ${currentDate}
──────────────────────
Notifikasi Pembelian detail di bawah.
`;

  try {
    await bot.telegram.sendMessage(GROUP_ID, groupMessage, { parse_mode: 'Markdown' });
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
        await checkAndUpdateUserRole(targetUserId, amount);
      }

      // Notifikasi ke pengguna
      await ctx.telegram.sendMessage(targetUserId, `✅ Saldo sebesar Rp${amount} telah ditambahkan ke akun Anda.`, { parse_mode: 'Markdown' });

      // Notifikasi ke admin
      await ctx.reply(`✅ Saldo sebesar Rp${amount} berhasil ditambahkan ke user dengan ID ${targetUserId}.`, { parse_mode: 'Markdown' });
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
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <domain> <harga>`', { parse_mode: 'Markdown' });
  }

  const [domain, harga] = args.slice(1);

  if (!/^\d+$/.test(harga)) {
      return ctx.reply('⚠️ `harga` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET harga = ? WHERE domain = ?", [parseInt(harga), domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit harga server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Harga server \`${domain}\` berhasil diubah menjadi \`${harga}\`.`, { parse_mode: 'Markdown' });
  });
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

bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <domain> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, batas_create_akun] = args.slice(1);

  if (!/^\d+$/.test(batas_create_akun)) {
      return ctx.reply('⚠️ `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET batas_create_akun = ? WHERE domain = ?", [parseInt(batas_create_akun), domain], function(err) {
      if (err) {
          console.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit batas_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Batas create akun server \`${domain}\` berhasil diubah menjadi \`${batas_create_akun}\`.`, { parse_mode: 'Markdown' });
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

async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'create') {
    keyboard = [
      [
        { text: 'SSH', callback_data: 'create_ssh' },
        { text: 'VMESS', callback_data: 'create_vmess' }
      ],
      [
        { text: 'VLESS', callback_data: 'create_vless' },
        { text: 'TROJAN', callback_data: 'create_trojan' }
      ],
      [{ text: 'KEMBALI', callback_data: 'kembali' }] // Tombol Kembali
    ];
  } else if (action === 'renew') {
    keyboard = [
      [
        { text: 'RENEW SSH', callback_data: 'renew_ssh' },
        { text: 'RENEW VMESS', callback_data: 'renew_vmess' }
      ],
      [
        { text: 'RENEW VLESS', callback_data: 'renew_vless' },
        { text: 'RENEW TROJAN', callback_data: 'renew_trojan' }
      ],
      [{ text: '🔙 Kembali', callback_data: 'kembali' }] // Tombol Kembali
    ];
  }

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    console.log(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      // Jika pesan tidak dapat diedit, kirim pesan baru
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      console.log(`${action} service menu sent as new message`);
    } else {
      console.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

bot.action('kembali', async (ctx) => {
  console.log('Tombol Kembali diklik oleh:', ctx.from.id);

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
      { text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' },
      { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }
    ],
    [
      { text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' },
      { text: '📋 List Server', callback_data: 'listserver' }
    ],
    [
      { text: '♻️ Reset Server', callback_data: 'resetdb' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    [
      { text: '🔙 Kembali', callback_data: 'send_main_menu' }
    ]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    console.log('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      // Jika pesan tidak dapat diedit, kirim pesan baru
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
bot.action('service_create', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'create');
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

bot.action('create_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'ssh');
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

bot.action('renew_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('🚫 *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'ssh');
});
async function startSelectServer(ctx, action, type, page = 0) {
  try {
    console.log(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);

    // Ambil list server dengan harga yang sesuai berdasarkan role pengguna
    const servers = await getServerList(ctx.from.id);

    if (servers.length === 0) {
      console.log('Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini. Coba lagi nanti!*', { parse_mode: 'Markdown' });
    }

    const serversPerPage = 6; // Jumlah server per halaman
    const totalPages = Math.ceil(servers.length / serversPerPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = currentPage * serversPerPage;
    const end = start + serversPerPage;
    const currentServers = servers.slice(start, end);

    // Buat tombol untuk setiap server
    const keyboard = [];
    for (let i = 0; i < currentServers.length; i += 2) {
      const row = [];
      const server1 = currentServers[i];
      const server2 = currentServers[i + 1];
      const server1Text = `${server1.nama_server}`;
      row.push({ text: server1Text, callback_data: `${action}_username_${type}_${server1.id}` });

      if (server2) {
        const server2Text = `${server2.nama_server}`;
        row.push({ text: server2Text, callback_data: `${action}_username_${type}_${server2.id}` });
      }
      keyboard.push(row);
    }

    // Tombol navigasi (Next/Back)
    const navButtons = [];
    if (totalPages > 1) {
      if (currentPage > 0) {
        navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
      }
      if (currentPage < totalPages - 1) {
        navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
      }
    }
    if (navButtons.length > 0) {
      keyboard.push(navButtons);
    }

    // Tombol Kembali ke Menu Utama
    keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

    // Format pesan list server
    const serverList = currentServers.map(server => {
      const hargaPer30Hari = server.harga * 30;
      const isFull = server.total_create_akun >= server.batas_create_akun;
      return `🌍 *${server.nama_server}*\n` +
             `💵 Harga per hari: Rp${server.harga}\n` +
             `🏷️ Harga per 30 hari: Rp${hargaPer30Hari}\n` +
             `❇️ Quota: ${server.quota}GB\n` +
             `🔐 Limit IP: ${server.iplimit} IP\n` +
             (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`) +  
             `\n*──────────────────────*`;
    }).join('\n\n');

    // Kirim pesan list server
    if (ctx.updateType === 'callback_query') {
      ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    } else {
      ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    }

    // Simpan state untuk navigasi
    userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
  } catch (error) {
    console.error(`🚫 Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`🚫 *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*`, { parse_mode: 'Markdown' });
  }
}

bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});
bot.action(/(create|renew)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];
  userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

  db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      console.error('⚠️ Error fetching server details:', err.message);
      return ctx.reply('🚫 *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
    }

    if (!server) {
      return ctx.reply('🚫 *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const batasCreateAkun = server.batas_create_akun;
    const totalCreateAkun = server.total_create_akun;

    if (totalCreateAkun >= batasCreateAkun) {
      return ctx.reply('🚫 *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
    }

    await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
  });
});
bot.on('text', async (ctx) => {
  const state = userState[ctx.chat.id];

  if (!state) return; 

  if (state.step.startsWith('username_')) {
    state.username = ctx.message.text.trim();
    if (!state.username) {
      return ctx.reply('🚫 *Username tidak valid. Masukkan username yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.username.length < 3 || state.username.length > 20) {
      return ctx.reply('🚫 *Username harus terdiri dari 3 hingga 20 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.username)) {
      return ctx.reply('🚫 *Username tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
    }
    const { username, serverId, type, action } = state;
    if (action === 'create') {
      if (type === 'ssh') {
        state.step = `password_${state.action}_${state.type}`;
        await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
      } else {
        state.step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
      }
    } else if (action === 'renew') {
      state.step = `exp_${state.action}_${state.type}`;
      await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    }
  } else if (state.step.startsWith('password_')) {
    state.password = ctx.message.text.trim();
    if (!state.password) {
      return ctx.reply('🚫 *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.password.length < 6) {
      return ctx.reply('🚫 *Password harus terdiri dari minimal 6 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.password)) {
      return ctx.reply('🚫 *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
    }
    state.step = `exp_${state.action}_${state.type}`;
    await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
  } else if (state.step.startsWith('exp_')) {
    const expInput = ctx.message.text.trim();
    if (!/^\d+$/.test(expInput)) {
      return ctx.reply('🚫 *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    const exp = parseInt(expInput, 10);
    if (isNaN(exp) || exp <= 0) {
      return ctx.reply('🚫 *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    if (exp > 365) {
      return ctx.reply('🚫 *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
    }
    state.exp = exp;

    db.get('SELECT quota, iplimit FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
      if (err) {
        console.error('⚠️ Error fetching server details:', err.message);
        return ctx.reply('🚫 *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
      }

      if (!server) {
        return ctx.reply('🚫 *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      state.quota = server.quota;
      state.iplimit = server.iplimit;

      const { username, password, exp, quota, iplimit, serverId, type, action } = state;
      let msg;

      db.get('SELECT harga FROM Server WHERE id = ?', [serverId], async (err, server) => {
        if (err) {
          console.error('⚠️ Error fetching server price:', err.message);
          return ctx.reply('🚫 *Terjadi kesalahan saat mengambil harga server.*', { parse_mode: 'Markdown' });
        }

        if (!server) {
          return ctx.reply('🚫 *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
        }

        const harga = server.harga;
        const totalHarga = harga * state.exp; 

        db.get('SELECT saldo FROM users WHERE user_id = ?', [ctx.from.id], async (err, user) => {
          if (err) {
            console.error('⚠️ Kesalahan saat mengambil saldo pengguna:', err.message);
            return ctx.reply('🚫 *Terjadi kesalahan saat mengambil saldo pengguna.*', { parse_mode: 'Markdown' });
          }

          if (!user) {
            return ctx.reply('🚫 *Pengguna tidak ditemukan.*', { parse_mode: 'Markdown' });
          }

          const saldo = user.saldo;

          if (saldo < totalHarga) {
            return ctx.reply('🚫 *Saldo Anda tidak mencukupi untuk melakukan transaksi ini.*', { parse_mode: 'Markdown' });
          }
          // Contoh di bagian create_vmess, create_vless, create_trojan, create_shadowsocks, atau create_ssh
if (action === 'create') {
  if (type === 'vmess') {
    msg = await createvmess(username, exp, quota, iplimit, serverId);
  } else if (type === 'vless') {
    msg = await createvless(username, exp, quota, iplimit, serverId);
  } else if (type === 'trojan') {
    msg = await createtrojan(username, exp, quota, iplimit, serverId);
  } else if (type === 'shadowsocks') {
    msg = await createshadowsocks(username, exp, quota, iplimit, serverId);
  } else if (type === 'ssh') {
    msg = await createssh(username, password, exp, iplimit, serverId);
  }

  // Kirim notifikasi ke grup setelah akun berhasil dibuat
  const server = await new Promise((resolve, reject) => {
    db.get('SELECT nama_server FROM Server WHERE id = ?', [serverId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });


  if (server) {
    await sendGroupNotificationPurchase(ctx.from.username, ctx.from.id, type, server.nama_server, exp);
  }
}else if (action === 'renew') {
            if (type === 'vmess') {
              msg = await renewvmess(username, exp, quota, iplimit, serverId);
            } else if (type === 'vless') {
              msg = await renewvless(username, exp, quota, iplimit, serverId);
            } else if (type === 'trojan') {
              msg = await renewtrojan(username, exp, quota, iplimit, serverId);
            } else if (type === 'shadowsocks') {
              msg = await renewshadowsocks(username, exp, quota, iplimit, serverId);
            } else if (type === 'ssh') {
              msg = await renewssh(username, exp, iplimit, serverId);
            }
          }
          // Kurangi saldo pengguna
          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, ctx.from.id], (err) => {
            if (err) {
              console.error('⚠️ Kesalahan saat mengurangi saldo pengguna:', err.message);
              return ctx.reply('🚫 *Terjadi kesalahan saat mengurangi saldo pengguna.*', { parse_mode: 'Markdown' });
            }
          });
          // Tambahkan total_create_akun
          db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], (err) => {
            if (err) {
              console.error('⚠️ Kesalahan saat menambahkan total_create_akun:', err.message);
              return ctx.reply('🚫 *Terjadi kesalahan saat menambahkan total_create_akun.*', { parse_mode: 'Markdown' });
            }
          });

          await ctx.reply(msg, { parse_mode: 'Markdown' });
          delete userState[ctx.chat.id];
        });
      });
    });
  } else if (state.step === 'addserver_domain') {
    const domain = ctx.message.text.trim();
    if (!domain) {
      await ctx.reply('⚠️ *Domain tidak boleh kosong.* Silakan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_auth';
    state.domain = domain;
    await ctx.reply('🔑 *Silakan masukkan auth server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_auth') {
    const auth = ctx.message.text.trim();
    if (!auth) {
      await ctx.reply('⚠️ *Auth tidak boleh kosong.* Silakan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_nama_server';
    state.auth = auth;
    await ctx.reply('🏷️ *Silakan masukkan nama server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_nama_server') {
    const nama_server = ctx.message.text.trim();
    if (!nama_server) {
      await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silakan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_quota';
    state.nama_server = nama_server;
    await ctx.reply('📊 *Silakan masukkan quota server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_quota') {
    const quota = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(quota)) {
      await ctx.reply('⚠️ *Quota tidak valid.* Silakan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_iplimit';
    state.quota = quota;
    await ctx.reply('🔢 *Silakan masukkan limit IP server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_iplimit') {
    const iplimit = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(iplimit)) {
      await ctx.reply('⚠️ *Limit IP tidak valid.* Silakan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_batas_create_akun';
    state.iplimit = iplimit;
    await ctx.reply('🔢 *Silakan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_batas_create_akun') {
    const batas_create_akun = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(batas_create_akun)) {
      await ctx.reply('⚠️ *Batas create akun tidak valid.* Silakan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_harga';
    state.batas_create_akun = batas_create_akun;
    await ctx.reply('💰 *Silakan masukkan harga server (harga member):*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga') {
    const harga = parseFloat(ctx.message.text.trim());
    if (isNaN(harga) || harga <= 0) {
      await ctx.reply('⚠️ *Harga tidak valid.* Silakan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.harga = harga;
    state.step = 'addserver_harga_reseller';
    await ctx.reply('💰 *Silakan masukkan harga reseller:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga_reseller') {
    const harga_reseller = parseFloat(ctx.message.text.trim());
    if (isNaN(harga_reseller) || harga_reseller <= 0) {
      await ctx.reply('⚠️ *Harga reseller tidak valid.* Silakan masukkan harga reseller yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    const { domain, auth, nama_server, quota, iplimit, batas_create_akun, harga } = state;

    try {
      db.run(
        'INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, harga_reseller, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, harga_reseller, 0],
        function (err) {
          if (err) {
            console.error('Error saat menambahkan server:', err.message);
            ctx.reply('🚫 *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
          } else {
            ctx.reply(
              `✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n` +
              `- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
        }
      });
    } catch (error) {
      console.error('Error saat menambahkan server:', error);
      await ctx.reply('🚫 *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
  }
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
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    console.log(`🔍 User ${userId} memulai proses top-up saldo.`);

    // Inisialisasi state jika belum ada
    if (!global.depositState) {
      global.depositState = {};
    }
    global.depositState[userId] = { action: 'request_amount', amount: '' };

    // Tampilkan keyboard numerik
    const keyboard = keyboard_nomor();
    await ctx.reply('*jumlah nominal saldo [Minimal 10.000]:*', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('🚫 Kesalahan saat memulai proses top-up saldo:', error);
    await ctx.reply('🚫 Gagal memulai proses top-up. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
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
──────────────────────
*Open TopUp Transaction Success*
──────────────────────
✧ *User*  : ${ctx.from.username}
✧ *ID*    : ${userId}
──────────────────────
✧ *Code*  : TRX-${Math.floor(100000 + Math.random() * 900000)}
✧ *Pay*   : Rp ${uniqueAmount.toLocaleString('id-ID')}
✧ *Info*  : ⏳ Pending
✧ *Exp*   : ${new Date(Date.now() + 3 * 60000).toLocaleTimeString('id-ID')}
✧ *Date*  : ${new Date().toLocaleString('id-ID')}
──────────────────────
BAYAR SESUAI YANG TERTERA DI PAY
──────────────────────`,
          parse_mode: 'Markdown',
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
}

async function handleTopUp(userId, amount) {
  try {
    // Tambah saldo pengguna
    await updateUserSaldo(userId, amount);

    // Catat transaksi top-up
    const currentDate = new Date().toISOString();
    db.run(
      'INSERT INTO transactions (user_id, amount, transaction_type, transaction_date) VALUES (?, ?, ?, ?)',
      [userId, amount, 'topup', currentDate],
      (err) => {
        if (err) {
          console.error('Error recording top-up transaction:', err.message);
        } else {
          console.log(`Top-up transaction recorded for user ${userId}`);
        }
      }
    );

    console.log(`✅ Top-up berhasil diproses untuk user ${userId}.`);
  } catch (error) {
    console.error('🚫 Gagal memproses top-up:', error);
    throw error;
  }
}

async function handleDepositState(ctx, userId, data) {
  let currentAmount = global.depositState[userId].amount;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }
    if (parseInt(currentAmount) < 10000) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal adalah 10Ribu!', { show_alert: true });
    }
    global.depositState[userId].action = 'confirm_amount';
    await processDeposit(ctx, currentAmount);
    return;
  } else {
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true });
    }
  }


  global.depositState[userId].amount = currentAmount;
  const newMessage = `*Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda [Minimal 10.000]:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

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
async function updateUserSaldo(userId, amount) {
  const currentDate = new Date().toISOString(); // Tanggal transaksi

  try {
    // Kurangi saldo pengguna
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET saldo = saldo - ? WHERE user_id = ?',
        [amount, userId],
        function (err) {
          if (err) {
            console.error('Error updating user saldo:', err.message);
            reject(err);
          } else {
            console.log(`Saldo berhasil dikurangi untuk user ${userId}.`);
            resolve();
          }
        }
      );
    });

    // Update jumlah transaksi dan tanggal transaksi terakhir
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET transaction_count = transaction_count + 1, last_transaction_date = ? WHERE user_id = ?',
        [currentDate, userId],
        function (err) {
          if (err) {
            console.error('Error updating transaction count:', err.message);
            reject(err);
          } else {
            console.log(`Jumlah transaksi diupdate untuk user ${userId}.`);
            resolve();
          }
        }
      );
    });

    // Cek dan tambahkan bonus saldo jika memenuhi syarat
    await checkAndAddBonusSaldo(userId);

    // Cek dan downgrade reseller jika memenuhi syarat
    await checkAndDowngradeReseller(userId);

  } catch (error) {
    console.error('🚫 Gagal mengupdate saldo:', error);
    throw error;
  }
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
  const { userId, amount, uniqueAmount } = job.data;

  try {
    console.log(`🔍 Memproses top-up untuk user ${userId} sebesar Rp${amount}`);

    let pembayaranDiterima = false;
    const timeout = Date.now() + 180000; // 3 menit

    while (Date.now() < timeout) {
      const transaksi = await cekMutasi(uniqueAmount);
      if (transaksi) {
        console.log(`✅ Pembayaran diterima dari ${transaksi.buyer_reff} sebesar ${transaksi.amount}`);

        // Hapus QR karena pembayaran diterima
        await bot.telegram.deleteMessage(userId, global.depositState[userId].messageId);

        const userDbId = await getUserIdFromTelegram(userId);
        if (!userDbId) {
          console.error(`🚫 User ID tidak ditemukan dalam database untuk Telegram ID: ${userId}`);
          throw new Error('User ID tidak ditemukan dalam database');
        }

        await updateUserSaldo(userDbId, parseInt(transaksi.amount));
        console.log(` Pengguna Ke ${userDbId} Melakukan Deposit Sebesar *Rp${transaksi.amount}*`);

        // **Cek dan upgrade ke reseller jika saldo >= 25.000**
        if (transaksi.amount >= 25000) {
          await checkAndUpdateUserRole(userId);
        }
        
         // **Notifikasi ke pengguna**
        await sendUserNotificationTopup(userId, transaksi.amount, uniqueAmount);

        // **Notifikasi ke admin dan grup**
        const user = await bot.telegram.getChat(userId); // Ambil info pengguna
        const username = user.username || `User ID: ${userId}`; // Gunakan username atau ID jika username tidak ada
        
        console.log("Mengirim notifikasi top-up ke admin...");
        await sendAdminNotificationTopup(username, userId, transaksi.amount, uniqueAmount);

        console.log("Mengirim notifikasi top-up ke grup...");
        await sendGroupNotificationTopup(username, userId, transaksi.amount, uniqueAmount);

        console.log("Notifikasi top-up selesai diproses.");
        
        // Catat transaksi
        await recordUserTransaction(userId);
        
        pembayaranDiterima = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 10000)); // Tunggu 10 detik sebelum cek ulang
    }

    if (!pembayaranDiterima) {
      console.log(`🚫 Pembayaran tidak ditemukan untuk User ${userId}`);

      // Hapus QR setelah 3 menit jika pembayaran tidak ditemukan
      await bot.telegram.deleteMessage(userId, global.depositState[userId].messageId);

      await bot.telegram.sendMessage(userId, '🚫 Status TopUp Canceled. Melebihi batas waktu. Silahkan ulangi kembali', { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('🚫 Kesalahan saat memproses top-up saldo:', error);
    await bot.telegram.sendMessage(userId, '✅ *SUCCESS*', { parse_mode: 'Markdown' });
  } finally {
    delete global.depositState[userId];
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
        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.status === 'success' && Array.isArray(response.data.data)) {
          console.log(`🔎 Mencocokkan transaksi dengan nominal unik: Rp${expectedAmount}`);
          response.data.data.forEach(item => {
            console.log(`🔹 Transaksi ditemukan: Type: ${item.type}, Amount: ${item.amount}, Buyer Reff: ${item.buyer_reff}`);
          });

          const mutasiTerbaru = response.data.data.find(item => 
            item.type === 'CR' && 
            parseInt(item.amount) === parseInt(expectedAmount)
          );

          if (mutasiTerbaru) {
            console.log(`✅ Pembayaran ditemukan: Rp${mutasiTerbaru.amount}, Buyer Reff: ${mutasiTerbaru.buyer_reff}`);
            return mutasiTerbaru;
          } else {
            console.log(`🚫 Tidak ada transaksi yang cocok dengan nominal: Rp${expectedAmount}`);
          }
        }
      } catch (err) {
        console.error('🚫 Gagal mengambil mutasi:', err.message);
      }

      console.log('🔄 Menunggu pembayaran...');
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log(`🚫 Pembayaran tidak ditemukan untuk Rp${expectedAmount}`);
    return null;

  } catch (error) {
    console.error('🚫 Kesalahan saat mengambil mutasi:', error);
    return null;
  }
}




function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
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



function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789@';
  const buttons = [];
  
  // Membuat tombol dengan 4 karakter per baris
  for (let i = 0; i < alphabet.length; i += 4) {
    const row = alphabet.slice(i, i + 4).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }

  // Tambahan tombol kontrol
  buttons.push([
    { text: '⌫ Hapus', callback_data: 'delete' },
    { text: '✅ Konfirmasi', callback_data: 'confirm' }
  ]);
  buttons.push([
    { text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }
  ]);

  return buttons;
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

app.listen(port, () => {
    bot.launch().then(() => {
        console.log('Bot telah dimulai');
    }).catch((error) => {
        console.error('Error saat memulai bot:', error);
    });
    console.log(`Server berjalan di port ${port}`);
});
