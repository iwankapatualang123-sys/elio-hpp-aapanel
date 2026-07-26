// Jalankan interaktif di server (`npm run set-pin`) untuk mengatur PIN
// bersama HPP. Script ini TIDAK menulis ke .env sendiri (supaya tidak
// mengutak-atik file secara diam-diam) -- cukup cetak hash-nya, tempel
// manual ke HPP_PIN_HASH di backend/.env, lalu restart backend.
import * as readline from 'readline';
import { hashPin } from '../src/lib/auth';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  console.log('Atur PIN bersama untuk HPP Elio.\n');
  const pin = await ask('Ketik PIN baru: ');
  const confirm = await ask('Ketik ulang untuk konfirmasi: ');

  if (!pin.trim()) {
    console.error('\nPIN tidak boleh kosong.');
    process.exit(1);
  }
  if (pin !== confirm) {
    console.error('\nPIN tidak sama. Jalankan ulang `npm run set-pin`.');
    process.exit(1);
  }

  const hash = await hashPin(pin.trim());
  console.log('\nBerhasil. Tempel baris ini ke backend/.env (ganti baris HPP_PIN_HASH yang sudah ada):\n');
  console.log(`HPP_PIN_HASH=${hash}\n`);
  console.log('Lalu restart backend: pm2 restart elio-hpp-backend');
}

main();
