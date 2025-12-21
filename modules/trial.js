const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function sendTelegramNotification(chatId, botToken, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await axios.post(url, { chat_id: chatId, text: message, parse_mode: 'HTML' });
  } catch (error) {
    console.error('⚠️ Error mengirim notifikasi:', error.message);
  }
}

// 1. TRIAL SSH
async function trialssh(serverId) {
  console.log(`🔄 Membuat akun Trial SSH...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const url = `http://${server.domain}:5888/trialssh?auth=${server.auth}`;
      axios.get(url).then(response => {
        if (response.data.status === "success") {
          const d = response.data.data;
          const msg = `*TRIAL SSH BERHASIL*\nUser: \`${d.username}\`\nPass: \`${d.password}\`\nHost: \`${d.domain}\`\nExpired: 30 Menit`;
          return resolve(msg);
        } else return resolve(`❌ Error: ${response.data.message}`);
      }).catch(e => resolve('❌ Gagal membuat trial SSH.'));
    });
  });
}

// 2. TRIAL VMESS
async function trialvmess(serverId) {
  console.log(`🔄 Membuat akun Trial VMess...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const url = `http://${server.domain}:5888/trialvmess?auth=${server.auth}`;
      axios.get(url).then(response => {
        if (response.data.status === "success") {
          const d = response.data.data;
          const msg = `*TRIAL VMESS BERHASIL*\nUser: \`${d.username}\`\nLink TLS: \`${d.vmess_tls_link}\`\nExpired: 30 Menit`;
          return resolve(msg);
        } else return resolve(`❌ Error: ${response.data.message}`);
      }).catch(e => resolve('❌ Gagal membuat trial VMess.'));
    });
  });
}

// 3. TRIAL VLESS
async function trialvless(serverId) {
  console.log(`🔄 Membuat akun Trial VLESS...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const url = `http://${server.domain}:5888/trialvless?auth=${server.auth}`;
      axios.get(url).then(response => {
        if (response.data.status === "success") {
          const d = response.data.data;
          const msg = `*TRIAL VLESS BERHASIL*\nUser: \`${d.username}\`\nLink: \`${d.vless_tls_link}\`\nExpired: 30 Menit`;
          return resolve(msg);
        } else return resolve(`❌ Error: ${response.data.message}`);
      }).catch(e => resolve('❌ Gagal membuat trial VLESS.'));
    });
  });
}

// 4. TRIAL TROJAN
async function trialtrojan(serverId) {
  console.log(`🔄 Membuat akun Trial Trojan...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const url = `http://${server.domain}:5888/trialtrojan?auth=${server.auth}`;
      axios.get(url).then(response => {
        if (response.data.status === "success") {
          const d = response.data.data;
          const msg = `*TRIAL TROJAN BERHASIL*\nUser: \`${d.username}\`\nLink: \`${d.trojan_tls_link}\`\nExpired: 30 Menit`;
          return resolve(msg);
        } else return resolve(`❌ Error: ${response.data.message}`);
      }).catch(e => resolve('❌ Gagal membuat trial Trojan.'));
    });
  });
}

// 5. TRIAL HYSTERIA 2
// --- 5. TRIAL HYSTERIA 2 ---
async function trialhysteria(serverId) {
  console.log(`🔄 Membuat akun Trial Hysteria...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('❌ Error mengambil server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const param = `:5888/trialhysteria?auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const d = response.data.data;
            // Ambil link dari output API (Link Hy2)
            const hyLink = d.hysteria_link || d.vmess_tls_link; 

            const msg = `
╔══════════════════════════╗
       *TRIAL HYSTERIA 2*
╚══════════════════════════╝
*INFORMASI AKUN*
┌──────────────────────────
│    *Username*: \`${d.username}\`
│    *Password*: \`${d.password}\`
│    *Domain*: \`${d.domain}\`
│    *Port*: \`10000-65535\`
│    *Obfs*: \`Salamander\`
└──────────────────────────

*LINK KONFIGURASI*
\`${hyLink}\`

*MASA AKTIF*: \`30 Menit\`
*QUOTA*: \`1 GB\`
*IP LIMIT*: \`1 IP\`

Terima kasih telah menggunakan layanan kami!
`;
            console.log('✅ Akun Trial Hysteria berhasil dibuat');
            return resolve(msg);
          } else {
            console.log('❌ Gagal membuat akun Trial Hysteria');
            return resolve(`❌ Error: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('⚠️ Error saat membuat Trial Hysteria:', error);
          return resolve('❌ Gagal membuat akun Hysteria. Silakan coba lagi nanti.');
        });
    });
  });
}

module.exports = { trialssh, trialvmess, trialvless, trialtrojan, trialhysteria, sendTelegramNotification };
