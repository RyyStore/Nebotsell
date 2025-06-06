// File: /root/Nebotsell/modules/delete.js

const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

/**
 * Fungsi untuk memanggil API penghapusan di server autoscript.
 * @param {string} protocol - Tipe protokol (ssh, vmess, vless, trojan).
 * @param {string} username - Username akun yang akan dihapus.
 * @param {number} serverId - ID server tempat akun berada.
 * @returns {Promise<string>} - Pesan sukses dari API.
 * @throws {Error} - Pesan error jika gagal.
 */
async function callDeleteAPI(protocol, username, serverId) {
    return new Promise((resolve, reject) => {
        // 1. Ambil detail domain dan auth dari database bot
        db.get('SELECT domain, auth FROM Server WHERE id = ?', [serverId], (err, server) => {
            if (err || !server) {
                console.error(`[DELETE] Gagal menemukan server dengan ID: ${serverId} di DB.`);
                return reject(new Error('Server tidak ditemukan di database.'));
            }
            
            // 2. Buat URL API yang lengkap
            const url = `http://${server.domain}:5888/delete${protocol}?user=${username}&auth=${server.auth}`;
            
            console.log(`[DELETE] Memanggil API: ${url}`);

            // 3. Lakukan panggilan menggunakan axios
            axios.get(url, { timeout: 15000 }) // Timeout 15 detik
                .then(response => {
                    // Cek jika API server merespon dengan status sukses
                    if (response.data && response.data.status === "success") {
                        console.log(`[DELETE] Sukses dari API:`, response.data.data);
                        resolve(response.data.data); // Kirim kembali pesan sukses dari skrip .sh
                    } else {
                        // Jika status dari API bukan sukses
                        console.error(`[DELETE] Pesan error dari API:`, response.data.message);
                        reject(new Error(response.data.message || 'Gagal menghapus akun di server.'));
                    }
                })
                .catch(error => {
                    // Jika terjadi error koneksi (misal: timeout, server tidak ditemukan)
                    console.error(`[DELETE] Error koneksi Axios:`, error.message);
                    reject(new Error('Gagal menghubungi server API untuk penghapusan.'));
                });
        });
    });
}

module.exports = { callDeleteAPI };