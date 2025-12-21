const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// --- 1. CREATE SSH ---
async function createssh(username, password, exp, iplimit, serverId, isPayAsYouGo = false) {
  console.log(`Creating SSH account for ${username}, PAYG: ${isPayAsYouGo}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('Error fetching server:', err ? err.message : 'Server not found');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const { domain, auth } = server;
      const param = `:5888/createssh?user=${username}&password=${password}&exp=${exp}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;

      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const sshData = response.data.data;
            const statusText = isPayAsYouGo ? `Model    : \`Pay As You Go\`` : `Expiry   : \`${sshData.expired}\``;

            const msg = `
──────────────────────
*CREATE SSH SUCCESS*
──────────────────────
*Informasi Akun*
┌─────────────────────
│ *Username* : \`${sshData.username}\`
│ *Password* : \`${sshData.password}\`
│ *Domain* : \`${sshData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *OpenSSH* : \`22\`
│ *UdpSSH* : \`1-65535\`
└─────────────────────
*Link dan Payload*
───────────────────────
Format Account WS: 
\`${sshData.domain}:80@${sshData.username}:${sshData.password}\`
Format Account TLS: 
\`${sshData.domain}:443@${sshData.username}:${sshData.password}\`
Format Account UDP: 
\`${sshData.domain}:1-65535@${sshData.username}:${sshData.password}\`
───────────────────────
┌─────────────────────
│ ${statusText}
│ IP Limit: \`${sshData.ip_limit}\`
└─────────────────────
Terimakasih Telah Menggunakan layanan kami!
`;
            return resolve(msg);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('Error SSH:', error);
          return resolve('❌ Terjadi kesalahan saat membuat SSH.');
        });
    });
  });
}

// --- 2. CREATE VMESS ---
async function createvmess(username, exp, quota, iplimit, serverId, isPayAsYouGo = false) {
  console.log(`Creating VMess account for ${username}, PAYG: ${isPayAsYouGo}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const { domain, auth } = server;
      const param = `:5888/createvmess?user=${username}&exp=${exp}&quota=${quota}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vmessData = response.data.data;
            const statusText = isPayAsYouGo ? `Model    : \`Pay As You Go\`` : `Expiry   : \`${vmessData.expired}\``;

            const msg = `
──────────────────────
*CREATE VMESS SUCCESS*
──────────────────────
*Informasi Akun*
┌─────────────────────
│ *Username* : \`${vmessData.username}\`
│ *Domain* : \`${vmessData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Alter ID* : \`0\`
│ *Security* : \`Auto\`
└─────────────────────
*URL VMESS TLS*
\`${vmessData.vmess_tls_link}\`
──────────────────────
*URL VMESS HTTP*
\`${vmessData.vmess_nontls_link}\`
──────────────────────
*UUID*: \`${vmessData.uuid}\`
┌─────────────────────
│ ${statusText}
│ Quota: \`${vmessData.quota === '0 GB' ? 'Unlimited' : vmessData.quota}\`
│ IP Limit: \`${vmessData.ip_limit === '0' ? 'Unlimited' : vmessData.ip_limit} \`
└─────────────────────
`;
            return resolve(msg);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('Error VMess:', error);
          return resolve('❌ Terjadi kesalahan saat membuat VMess.');
        });
    });
  });
}

// --- 3. CREATE VLESS ---
async function createvless(username, exp, quota, iplimit, serverId, isPayAsYouGo = false) {
  console.log(`Creating VLESS account for ${username}, PAYG: ${isPayAsYouGo}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const { domain, auth } = server;
      const param = `:5888/createvless?user=${username}&exp=${exp}&quota=${quota}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vlessData = response.data.data;
            const statusText = isPayAsYouGo ? `Model    : \`Pay As You Go\`` : `Expiry   : \`${vlessData.expired}\``;

            const msg = `
──────────────────────
*CREATE VLESS SUCCESS*
──────────────────────
*Informasi Akun*
┌─────────────────────
│ *Username* : \`${vlessData.username}\`
│ *Domain* : \`${vlessData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Security* : \`Auto\`
└─────────────────────
*URL VLESS TLS*
\`${vlessData.vless_tls_link}\`
──────────────────────
*URL VLESS HTTP*
\`${vlessData.vless_nontls_link}\`
──────────────────────
*UUID*: \`${vlessData.uuid}\`
┌─────────────────────
│ ${statusText}
│ Quota: \`${vlessData.quota === '0 GB' ? 'Unlimited' : vlessData.quota}\`
│ IP Limit: \`${vlessData.ip_limit === '0' ? 'Unlimited' : vlessData.ip_limit}\`
└─────────────────────
`;
            return resolve(msg);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('Error VLESS:', error);
          return resolve('❌ Terjadi kesalahan saat membuat VLESS.');
        });
    });
  });
}

// --- 4. CREATE TROJAN ---
async function createtrojan(username, exp, quota, iplimit, serverId, isPayAsYouGo = false) {
  console.log(`Creating Trojan account for ${username}, PAYG: ${isPayAsYouGo}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const { domain, auth } = server;
      const param = `:5888/createtrojan?user=${username}&exp=${exp}&quota=${quota}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const trojanData = response.data.data;
            const statusText = isPayAsYouGo ? `Model    : \`Pay As You Go\`` : `Expiry   : \`${trojanData.expired}\``;

            const msg = `
──────────────────────
*CREATE TROJAN SUCCESS*
──────────────────────
*Informasi Akun*
┌─────────────────────
│ *Username* : \`${trojanData.username}\`
│ *Domain* : \`${trojanData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Security* : \`Auto\`
└─────────────────────
*URL TROJAN TLS*
\`${trojanData.trojan_tls_link}\`
──────────────────────
*URL TROJAN HTTP*
\`${trojanData.trojan_nontls_link1}\`
──────────────────────
*PASSWORD*: \`${trojanData.uuid}\`
┌─────────────────────
│ ${statusText}
│ Quota: \`${trojanData.quota === '0 GB' ? 'Unlimited' : trojanData.quota}\`
│ IP Limit: \`${trojanData.ip_limit === '0' ? 'Unlimited' : trojanData.ip_limit}\`
└─────────────────────
`;
            return resolve(msg);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('Error Trojan:', error);
          return resolve('❌ Terjadi kesalahan saat membuat Trojan.');
        });
    });
  });
}

// --- 5. CREATE HYSTERIA 2 ---
// ... kode atas tetap sama ...

// --- 5. CREATE HYSTERIA 2 ---
async function createhysteria(username, exp, quota, iplimit, serverId, isPayAsYouGo = false) {
  console.log(`Creating Hysteria account for ${username}, PAYG: ${isPayAsYouGo}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const { domain, auth } = server;
      // Kita tidak kirim password, biarkan server generate acak (sesuai script bash di atas)
      const param = `:5888/createhysteria?user=${username}&exp=${exp}&quota=${quota}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const hy2Data = response.data.data;
            const statusText = isPayAsYouGo ? `Model    : \`Pay As You Go\`` : `Expiry   : \`${hy2Data.expired}\``;
            
            // Ambil link
            const hyLink = hy2Data.hysteria_link || hy2Data.vmess_tls_link || "Link tidak tersedia";

            // PERBAIKAN TAMPILAN DI SINI:
            const msg = `
──────────────────────
*CREATE HYSTERIA 2 SUCCESS*
──────────────────────
*Informasi Akun*
┌─────────────────────
│ *Username* : \`${hy2Data.username}\`
│ *Password* : \`${hy2Data.password}\`
│ *Domain* : \`${hy2Data.domain}\`
│ *Port* : \`10000-65535\`
│ *Protocol* : \`UDP (QUIC)\`
│ *Obfs* : \`Salamander\`
└─────────────────────
*LINK HYSTERIA 2*
\`${hyLink}\`
──────────────────────
┌─────────────────────
│ ${statusText}
│ Quota: \`${hy2Data.quota === '0 GB' ? 'Unlimited' : hy2Data.quota}\`
│ IP Limit: \`${hy2Data.ip_limit === '0' ? 'Unlimited' : hy2Data.ip_limit} IP\`
└─────────────────────
Terimakasih Telah Menggunakan Layanan Kami!✿
`;
            return resolve(msg);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error('Error Hysteria:', error);
          return resolve('❌ Terjadi kesalahan saat membuat Hysteria.');
        });
    });
  });
}

module.exports = { createssh, createvmess, createvless, createtrojan, createhysteria };
