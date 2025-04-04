const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// Fungsi untuk mengirim notifikasi ke bot Telegram
async function sendTelegramNotification(chatId, botToken, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const params = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  };

  try {
    const response = await axios.post(url, params);
    if (response.data.ok) {
      console.log('✅ Notifikasi berhasil dikirim');
    } else {
      console.error('❌ Gagal mengirim notifikasi:', response.data.description);
    }
  } catch (error) {
    console.error('⚠️ Error mengirim notifikasi:', error.response ? error.response.data : error.message);
  }
}

// Fungsi untuk membuat akun SSH
async function trialssh(serverId, usernameTelegram) {
  console.log(`🔄 Membuat akun Trial SSH...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('❌ Error mengambil server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const param = `:5888/trialssh?auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const sshData = response.data.data;
            const msg = `
╔══════════════════════════╗
               *TRIAL SSH BERHASIL* 
╚══════════════════════════╝

*INFORMASI AKUN*
┌──────────────────────────
│     *Username*: \`${sshData.username}\`
│     *Password*: \`${sshData.password}\`
│     *Domain*: \`${sshData.domain}\`
│     *Ports*:
│     - TLS: \`443\`
│     - HTTP: \`80\`
│     - OpenSSH: \`22\`
│     - UDP: \`1-65535\`
│     - Dropbear: \`443, 109\`
│     - WS: \`80\`
│     - SSL WS: \`443\`
│     - OVPN SSL: \`443\`
│     - OVPN TCP: \`1194\`
│     - OVPN UDP: \`2200\`
│     - BadVPN: \`7100, 7300\`
└──────────────────────────

*LINK & PAYLOAD*
┌──────────────────────────
│    *Payload WS*:
       \`GET / HTTP/1.1
       Host: ${sshData.domain}
      Upgrade: websocket\`

│    *Format Akun*:
│     - WS: \`${sshData.domain}:80@${sshData.  username}:${sshData.password}\`
│     - TLS: \`${sshData.domain}:443@${sshData.  username}:${sshData.password}\`
│     - UDP: \`${sshData.domain}:1-65535@${sshData.  username}:${sshData.password}\`
└──────────────────────────

*MASA AKTIF*: \`${sshData.expired}\`
*IP LIMIT*: \`${sshData.ip_limit}\`

 Terima kasih telah menggunakan layanan kami!
`;
            console.log('✅ Akun SSH berhasil dibuat');
            return resolve(msg);
          } else {
            console.log('❌ Gagal membuat akun SSH');
            return resolve(`❌ Error: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('⚠️ Error saat membuat SSH:', error);
          return resolve('❌ Gagal membuat akun SSH. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun VMess
async function trialvmess(serverId, usernameTelegram) {
  console.log(`🔄 Membuat akun Trial VMess...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('❌ Error mengambil server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const param = `:5888/trialvmess?auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vmessData = response.data.data;
            const msg = `
╔══════════════════════════╗
            *TRIAL VMESS BERHASIL*  
╚══════════════════════════╝

*INFORMASI AKUN*
┌──────────────────────────
│     *Username*: \`${vmessData.username}\`
│     *Domain*: \`${vmessData.domain}\`
│     *Ports*:
│     - TLS: \`443\`
│     - HTTP: \`80\`
│     *Settings*:
│     - Alter ID: \`0\`
│     - Security: \`Auto\`
│     - Network: \`Websocket (WS)\`
│     - Path: \`/vmess\`
│     - GRPC Path: \`vmess-grpc\`
└──────────────────────────

*LINK KONFIGURASI*
┌──────────────────────────
│     *VMESS TLS*:
\`${vmessData.vmess_tls_link}\`

│     *VMESS HTTP*:
\`${vmessData.vmess_nontls_link}\`

│     *VMESS GRPC*:
\`${vmessData.vmess_grpc_link}\`

│     *UUID*:
\`${vmessData.uuid}\`
└──────────────────────────

*MASA AKTIF*: \`${vmessData.expired}\`
*QUOTA*: \`${vmessData.quota === '0 GB' ? 'Unlimited' : vmessData.quota}\`
*IP LIMIT*: \`${vmessData.ip_limit === '0' ? 'Unlimited' : vmessData.ip_limit}\`
 
Terima kasih telah menggunakan layanan kami!
`;
            console.log('✅ Akun VMess berhasil dibuat');
            return resolve(msg);
          } else {
            console.log('❌ Gagal membuat akun VMess');
            return resolve(`❌ Error: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('⚠️ Error saat membuat VMess:', error);
          return resolve('❌ Gagal membuat akun VMess. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun VLESS
async function trialvless(serverId, usernameTelegram) {
  console.log(`🔄 Membuat akun Trial VLESS...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('❌ Error mengambil server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const param = `:5888/trialvless?auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vlessData = response.data.data;
            const msg = `
╔══════════════════════════╗
            *TRIAL VLESS BERHASIL* 
╚══════════════════════════╝

*INFORMASI AKUN*
┌──────────────────────────
│     *Username*: \`${vlessData.username}\`
│     *Domain*: \`${vlessData.domain}\`
│     *NS Domain*: \`${vlessData.ns_domain}\`
│     *Ports*:
│     - TLS: \`443\`
│     - HTTP: \`80\`
│     *Settings*:
│     - Security: \`Auto\`
│     - Network: \`Websocket (WS)\`
│     - Path: \`/vless\`
│     - GRPC Path: \`vless-grpc\`
└──────────────────────────

*LINK KONFIGURASI*
┌──────────────────────────
│     *VLESS TLS*:
\`${vlessData.vless_tls_link}\`

│     *VLESS HTTP*:
\`${vlessData.vless_nontls_link}\`

│     *VLESS GRPC*:
\`${vlessData.vless_grpc_link}\`

│     *UUID*:
\`${vlessData.uuid}\`
└──────────────────────────

*MASA AKTIF*: \`${vlessData.expired}\`
*QUOTA*: \`${vlessData.quota === '0 GB' ? 'Unlimited' : vlessData.quota}\`
*IP LIMIT*: \`${vlessData.ip_limit === '0' ? 'Unlimited' : vlessData.ip_limit} IP\`


Terima kasih telah menggunakan layanan kami!
`;
            console.log('✅ Akun VLESS berhasil dibuat');
            return resolve(msg);
          } else {
            console.log('❌ Gagal membuat akun VLESS');
            return resolve(`❌ Error: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('⚠️ Error saat membuat VLESS:', error);
          return resolve('❌ Gagal membuat akun VLESS. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun Trojan
async function trialtrojan(serverId, usernameTelegram) {
  console.log(`🔄 Membuat akun Trial Trojan...`);
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('❌ Error mengambil server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const param = `:5888/trialtrojan?auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const trojanData = response.data.data;
            const msg = `
╔══════════════════════════╗
          *TRIAL TROJAN BERHASIL* 
╚══════════════════════════╝

*INFORMASI AKUN*
┌──────────────────────────
│     *Username*: \`${trojanData.username}\`
│     *Domain*: \`${trojanData.domain}\`
│     *Ports*:
│     - TLS: \`443\`
│     - HTTP: \`80\`
│     *Settings*:
│     - Security: \`Auto\`
│     - Network: \`Websocket (WS)\`
│     - Path: \`/trojan-ws\`
│     - GRPC Path: \`trojan-grpc\`
└──────────────────────────

*LINK KONFIGURASI*
┌──────────────────────────
│     *TROJAN TLS*:
\`${trojanData.trojan_tls_link}\`

│     *TROJAN HTTP*:
\`${trojanData.trojan_nontls_link1}\`

│     *TROJAN GRPC*:
\`${trojanData.trojan_grpc_link}\`

│     *Password*:
\`${trojanData.uuid}\`
└──────────────────────────

*MASA AKTIF*: \`${trojanData.expired}\`
*QUOTA*: \`${trojanData.quota === '0 GB' ? 'Unlimited' : trojanData.quota}\`
*IP LIMIT*: \`${trojanData.ip_limit === '0' ? 'Unlimited' : trojanData.ip_limit}\`


Terima kasih telah menggunakan layanan kami!
`;
            console.log('✅ Akun Trojan berhasil dibuat');
            return resolve(msg);
          } else {
            console.log('❌ Gagal membuat akun Trojan');
            return resolve(`❌ Error: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('⚠️ Error saat membuat Trojan:', error);
          return resolve('❌ Gagal membuat akun Trojan. Silakan coba lagi nanti.');
        });
    });
  });
}

module.exports = { 
  trialssh, 
  trialvmess, 
  trialvless, 
  trialtrojan,
  sendTelegramNotification
};