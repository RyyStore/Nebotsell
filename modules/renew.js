const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// Helper function untuk request renew generic
async function renewGeneric(username, exp, limitip, serverId, type, endpoint) {
  console.log(`Renewing ${type} for ${username}, exp: ${exp}, server: ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const { domain, auth } = server;
      // Parameter URL disesuaikan dengan api.js
      const param = `:5888/${endpoint}?user=${username}&exp=${exp}&iplimit=${limitip}&quota=0&auth=${auth}`;
      const url = `http://${domain}${param}`;

      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            return resolve(`✅ Akun ${type} ${username} berhasil diperbarui.`);
          } else {
            return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
          }
        })
        .catch(error => {
          console.error(`Error renew ${type}:`, error);
          return resolve(`❌ Terjadi kesalahan saat memperbarui ${type}.`);
        });
    });
  });
}

// 1. Renew SSH
async function renewssh(username, exp, limitip, serverId) {
  return renewGeneric(username, exp, limitip, serverId, 'SSH', 'renewssh');
}

// 2. Renew VMess
async function renewvmess(username, exp, quota, limitip, serverId) {
  return renewGeneric(username, exp, limitip, serverId, 'VMess', 'renewvmess');
}

// 3. Renew VLESS
async function renewvless(username, exp, quota, limitip, serverId) {
  return renewGeneric(username, exp, limitip, serverId, 'VLess', 'renewvless');
}

// 4. Renew Trojan
async function renewtrojan(username, exp, quota, limitip, serverId) {
  return renewGeneric(username, exp, limitip, serverId, 'Trojan', 'renewtrojan');
}

// 5. Renew Hysteria 2
async function renewhysteria(username, exp, limitip, serverId) {
  return renewGeneric(username, exp, limitip, serverId, 'Hysteria', 'renewhysteria');
}

module.exports = { renewssh, renewvmess, renewvless, renewtrojan, renewhysteria };
