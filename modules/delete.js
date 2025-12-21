const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

/**
 * Fungsi untuk memanggil API penghapusan di server autoscript.
 * @param {string} protocol - Tipe protokol (ssh, vmess, vless, trojan, hysteria).
 * @param {string} username - Username akun yang akan dihapus.
 * @param {number} serverId - ID server tempat akun berada.
 */
async function callDeleteAPI(protocol, username, serverId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT domain, auth FROM Server WHERE id = ?', [serverId], (err, server) => {
            if (err || !server) {
                console.error(`[DELETE] Gagal menemukan server ID: ${serverId}`);
                return reject(new Error('Server tidak ditemukan di database.'));
            }
            
            // URL dinamis: http://domain:5888/delete[protocol]
            // Contoh: /deletehysteria, /deletessh
            const url = `http://${server.domain}:5888/delete${protocol}?user=${username}&auth=${server.auth}`;
            
            console.log(`[DELETE] Memanggil API: ${url}`);

            axios.get(url, { timeout: 15000 })
                .then(response => {
                    if (response.data && response.data.status === "success") {
                        console.log(`[DELETE] Sukses:`, response.data.message);
                        resolve(response.data.message);
                    } else {
                        console.error(`[DELETE] Gagal:`, response.data.message);
                        reject(new Error(response.data.message || 'Gagal menghapus akun di server.'));
                    }
                })
                .catch(error => {
                    console.error(`[DELETE] Error koneksi:`, error.message);
                    reject(new Error('Gagal menghubungi server API untuk penghapusan.'));
                });
        });
    });
}

module.exports = { callDeleteAPI };
