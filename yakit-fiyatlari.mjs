
import * as cheerio from 'cheerio';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const url = 'https://www.petrolofisi.com.tr/akaryakit-fiyatlari';

const response = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0' },
  signal: AbortSignal.timeout(30000)
});

if (!response.ok) {
  throw new Error(`Petrol Ofisi HTTP hatası: ${response.status}`);
}

const html = await response.text();
const $ = cheerio.load(html);

const ankara = $('tr.price-row').filter((_, tr) =>
  $(tr).find('td').first().text().trim()
    .toLocaleUpperCase('tr-TR') === 'ANKARA'
).first();

if (!ankara.length) {
  throw new Error('Ankara fiyat satırı bulunamadı.');
}

const fiyatlar = ankara.find('td').slice(1).map((_, td) => {
  const fiyat = $(td).find('.with-tax').first().text().trim();
  return Number(fiyat.replace(',', '.'));
}).get();

const kayitlar = {
  benzin: fiyatlar[0],
  motorin: fiyatlar[1],
  lpg: fiyatlar[5]
};

for (const [tur, fiyat] of Object.entries(kayitlar)) {
  if (!Number.isFinite(fiyat) || fiyat <= 0) {
    throw new Error(`${tur} fiyatı geçersiz.`);
  }
}

console.log('Ankara yakıt fiyatları:', kayitlar);

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'taksianaliz'
});

const db = getFirestore(app);
const batch = db.batch();
const tarih = new Date().toISOString().slice(0, 10);

for (const [kind, price] of Object.entries(kayitlar)) {
  batch.set(db.collection('fuelPrices').doc(kind), {
    kind,
    price,
    source: 'Petrol Ofisi - Ankara',
    source_date: tarih,
    updatedAt: new Date()
  });
}

await batch.commit();
console.log('Firebase yakıt fiyatları güncellendi.');
