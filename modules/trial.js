const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// Fungsi untuk mengirim notifikasi ke bot Telegram
async function sendTelegramNotification(chatId, botToken, message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const params = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML' // Pastikan menggunakan parse_mode HTML
  };

  try {
    const response = await axios.post(url, params);
    if (response.data.ok) {
      console.log('Notifikasi berhasil dikirim');
    } else {
      console.error('Gagal mengirim notifikasi:', response.data.description);
    }
  } catch (error) {
    console.error('Error mengirim notifikasi:', error.response ? error.response.data : error.message);
  }
}
/*
function calculatePrice(duration, iplimit, quota) {
  // Jika kuota = 0 (unlimited), harga adalah 334 per hari
  if (quota === 0 || quota === '0 GB') {
    return 334 * duration;
  }

  // Jika kuota > 0, hitung harga berdasarkan jumlah IP
  const pricePerDay = {
    1: 134, // Harga per hari untuk 1 IP
    2: 200, // Harga per hari untuk 2 IP
    3: 500, // Harga per hari untuk 3 IP
  };

  // Harga tambahan untuk 600 per hari
  const additionalPricePerDay = {
    1: 134, // Harga tambahan per hari untuk 1 IP
    2: 200, // Harga tambahan per hari untuk 2 IP
    3: 600, // Harga tambahan per hari untuk 3 IP
  };

  // Pastikan iplimit valid (1, 2, atau 3)
  if (![1, 2, 3].includes(iplimit)) {
    throw new Error('Jumlah IP tidak valid. Harus 1, 2, atau 3.');
  }

  // Hitung harga total berdasarkan pilihan harga
  let price;
  if (duration === 30) {
    // Jika durasi 30 hari (1 bulan), hitung harga bulanan
    price = additionalPricePerDay[iplimit] * duration;
  } else {
    // Jika durasi bukan 30 hari, hitung harga harian
    price = pricePerDay[iplimit] * duration;
  }

  return price;
}*/



// Fungsi untuk membuat akun SSH
async function trialssh(serverId, usernameTelegram) {
  console.log(`Creating Trial SSH account`);
/*  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }



  // Hitung harga berdasarkan durasi dan jumlah IP
  let price;
  try {
    price = calculatePrice(exp, iplimit);
  } catch (error) {
    return `❌ ${error.message}`;
  }
*/
  // Ambil domain dan city dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
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
/*            const quota = sshData.quota || 0; // Ambil quota dari respons API, default 0 jika tidak ada

            // Hitung harga berdasarkan durasi, jumlah IP, dan quota
            let price;
            try {
              price = calculatePrice(exp, iplimit, quota);
            } catch (error) {
              return resolve(`❌ ${error.message}`);
            }*/
            const msg = `
──────────────────────
✿ *CREATE TRIAL SSH SUCCESS*✿
──────────────────────
🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${sshData.username}\`
│ *Password* : \`${sshData.password}\`
│ *Domain*   : \`${sshData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *OpenSSH*  : \`22\`
│ *UdpSSH*   : \`1-65535\`
│ *DNS*      : \`443, 53, 22\`
│ *Dropbear* : \`443, 109\`
│ *SSH WS*   : \`80\`
│ *SSH SSL WS*: \`443\`
│ *SSL/TLS*  : \`443\`
│ *OVPN SSL* : \`443\`
│ *OVPN TCP* : \`1194\`
│ *OVPN UDP* : \`2200\`
│ *BadVPN UDP*: \`7100, 7300, 7300\`
└─────────────────────
🔗 *Link dan Payload*
───────────────────────
Payload      : 
\`
GET / HTTP/1.1
Host: ${sshData.domain}
Upgrade: websocket
\`
Format Account WS: 
\`
${sshData.domain}:80@${sshData.username}:${sshData.password}
\`
Format Account TLS: 
\`
${sshData.domain}:443@${sshData.username}:${sshData.password}
\`
Format Account UDP: 
\`
${sshData.domain}:1-65535@${sshData.username}:${sshData.password}
\`
───────────────────────
┌─────────────────────
│ Expires: \`${sshData.expired}\`
│ IP Limit: \`${sshData.ip_limit}\`
└─────────────────────

✿Terimakasih Telah Menggunakan layanan kami!✿
`;
              console.log('SSH account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating SSH account');
              return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat SSH:', error);
          return resolve('❌ Terjadi kesalahan saat membuat SSH. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun VMess
async function trialvmess(serverId, usernameTelegram) {
  console.log(`Creating Trial VMess account`);
/*  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }


  // Hitung harga berdasarkan durasi dan jumlah IP
  let price;
  try {
    price = calculatePrice(exp, iplimit);
  } catch (error) {
    return `❌ ${error.message}`;
  }
*/
  // Ambil domain dan city dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
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
/*            const quota = vmessData.quota || 0; // Ambil quota dari respons API, default 0 jika tidak ada

            // Hitung harga berdasarkan durasi, jumlah IP, dan quota
            let price;
            try {
              price = calculatePrice(exp, iplimit, quota);
            } catch (error) {
              return resolve(`❌ ${error.message}`);
            }*/
            const msg = `
──────────────────────
✿ *CREATE TRIAL VMESS SUCCESS*✿
──────────────────────
🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${vmessData.username}\`
│ *Domain*   : \`${vmessData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Alter ID* : \`0\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vmess\`
│ *Path GRPC*: \`vmess-grpc\`
└─────────────────────
✿ *URL VMESS TLS*
\`
${vmessData.vmess_tls_link}
\`
──────────────────────
✿ *URL VMESS HTTP*
\`
${vmessData.vmess_nontls_link}
\`
──────────────────────
✿ *URL VMESS GRPC*
\`
${vmessData.vmess_grpc_link}
\`
──────────────────────
✿ *UUID*
\`
${vmessData.uuid}
\`
┌─────────────────────
│ Expiry: \`${vmessData.expired}\`
│ Quota: \`${vmessData.quota === '0 GB' ? 'Unlimited' : vmessData.quota}\`
│ IP Limit: \`${vmessData.ip_limit === '0' ? 'Unlimited' : vmessData.ip_limit} \`
└─────────────────────
Save Account Link: [Save Account](https://${vmessData.domain}:81/vmess-${vmessData.username}.txt)
✿Terimakasih Telah Menggunakan Layanan Kami!✿
`;
              console.log('VMess account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VMess account');
              return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VMess:', error);
          return resolve('❌ Terjadi kesalahan saat membuat VMess. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun VLESS
async function trialvless(serverId, usernameTelegram) {
  console.log(`Creating Trial VLESS account `);
/*  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  // Hitung harga berdasarkan durasi dan jumlah IP
  let price;
  try {
    price = calculatePrice(exp, iplimit);
  } catch (error) {
    return `❌ ${error.message}`;
  }
*/
  // Ambil domain dan city dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
/*      const quota = server.quota || 0; // Ambil quota dari database, default 0 jika tidak ada

      // Hitung harga berdasarkan durasi, jumlah IP, dan quota
      let price;
      try {
        price = calculatePrice(exp, iplimit, quota);
      } catch (error) {
        return resolve(`❌ ${error.message}`);
      }*/
      const param = `:5888/trialvless?auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vlessData = response.data.data;
            const quota = vlessData.quota || 0; // Ambil quota dari respons API, default 0 jika tidak ada

/*            // Hitung harga berdasarkan durasi, jumlah IP, dan quota
            let price;
            try {
              price = calculatePrice(exp, iplimit, quota);
            } catch (error) {
              return resolve(`❌ ${error.message}`);
            }*/
            const msg = `
──────────────────────
✿ *CREATE TRIAL VLESS SUCCESS*✿
──────────────────────
🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${vlessData.username}\`
│ *Domain*   : \`${vlessData.domain}\`
│ *NS*       : \`${vlessData.ns_domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/vless\`
│ *Path GRPC*: \`vless-grpc\`
└─────────────────────
✿ *URL VLESS TLS*
\`
${vlessData.vless_tls_link}
\`
──────────────────────
✿ *URL VLESS HTTP*
\`
${vlessData.vless_nontls_link}
\`
──────────────────────
✿ *URL VLESS GRPC*
\`
${vlessData.vless_grpc_link}
\`
──────────────────────
✿ *UUID*
\`
${vlessData.uuid}
\`
┌─────────────────────
│ Expiry: \`${vlessData.expired}\`
│ Quota: \`${vlessData.quota === '0 GB' ? 'Unlimited' : vlessData.quota}\`
│ IP Limit: \`${vlessData.ip_limit === '0' ? 'Unlimited' : vlessData.ip_limit} IP\`
└─────────────────────
Save Account Link: [Save Account](https://${vlessData.domain}:81/vless-${vlessData.username}.txt)
✿Terimakasih Telah Menggunakan Layanan Kami!✿
`;
              console.log('VLESS account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VLESS account');
              return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VLESS:', error);
          return resolve('❌ Terjadi kesalahan saat membuat VLESS. Silakan coba lagi nanti.');
        });
    });
  });
}

// Fungsi untuk membuat akun Trojan
async function trialtrojan(serverId, usernameTelegram) {
  console.log(`Creating Trial Trojan account `);
 /* 
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }


  // Hitung harga berdasarkan durasi dan jumlah IP
  let price;
  try {
    price = calculatePrice(exp, iplimit);
  } catch (error) {
    return `❌ ${error.message}`;
  }
*/
  // Ambil domain dan city dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      
      const quota = server.quota || 0; // Ambil quota dari database, default 0 jika tidak ada

/*      // Hitung harga berdasarkan durasi, jumlah IP, dan quota
      let price;
      try {
        price = calculatePrice(exp, iplimit, quota);
      } catch (error) {
        return resolve(`❌ ${error.message}`);
      }
 */     
      const param = `:5888/trialtrojan?auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const trojanData = response.data.data;
            const quota = trojanData.quota || 0; // Ambil quota dari respons API, default 0 jika tidak ada

/*            // Hitung harga berdasarkan durasi, jumlah IP, dan quota
            let price;
            try {
              price = calculatePrice(exp, iplimit, quota);
            } catch (error) {
              return resolve(`❌ ${error.message}`);
            }*/
            const msg = `
──────────────────────
✿ *CREATE TRIAL TROJAN SUCCESS*✿
──────────────────────
🔹 *Informasi Akun*
┌─────────────────────
│ *Username* : \`${trojanData.username}\`
│ *Domain*   : \`${trojanData.domain}\`
│ *Port TLS* : \`443\`
│ *Port HTTP*: \`80\`
│ *Security* : \`Auto\`
│ *Network*  : \`Websocket (WS)\`
│ *Path*     : \`/trojan-ws\`
│ *Path GRPC*: \`trojan-grpc\`
└─────────────────────
✿ *URL TROJAN TLS*
\`
${trojanData.trojan_tls_link}
\`
──────────────────────
✿ *URL TROJAN HTTP*
\`
${trojanData.trojan_nontls_link1}
\`
──────────────────────
✿ *URL TROJAN GRPC*
\`
${trojanData.trojan_grpc_link}
\`
──────────────────────
✿ *PASSWORD*
\`
${trojanData.uuid}
\`
┌─────────────────────
│ Expiry: \`${trojanData.expired}\`
│ Quota: \`${trojanData.quota === '0 GB' ? 'Unlimited' : trojanData.quota}\`
│ IP Limit: \`${trojanData.ip_limit === '0' ? 'Unlimited' : trojanData.ip_limit} \`
└─────────────────────
Save Account Link: [Save Account](https://${trojanData.domain}:81/trojan-${trojanData.username}.txt)
✿Terimakasih  Telah menggunakan layanan kami!✿
`;
              console.log('Trojan account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Trojan account');
              return resolve(`❌ Terjadi kesalahan: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Trojan:', error);
          return resolve('❌ Terjadi kesalahan saat membuat Trojan. Silakan coba lagi nanti.');
        });
    });
  });
}


module.exports = { trialssh, trialvmess, trialvless, trialtrojan };