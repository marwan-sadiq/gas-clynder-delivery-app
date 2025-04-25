const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const sampleDrivers = [
  {
    phone: '07701234567',
    password: 'pass123',
    code: 'DRIVER123',
    carNumber: 'KRD-823',
    name: 'Ahmad',
  },
  {
    phone: '07509876543',
    password: 'secret456',
    code: 'GASMAN99',
    carNumber: 'SLE-777',
    name: 'Baran',
  },
];

const pricingConfig = {
  smallCylinder: 5000,
  mediumCylinder: 7500,
  largeCylinder: 10000,
};

async function seedDrivers() {
  const batch = db.batch();

  sampleDrivers.forEach((driver) => {
    const ref = db.collection('drivers').doc(driver.id); // ✅ Use phone as ID
    batch.set(ref, driver);
  });

  await batch.commit();
  console.log('✅ Drivers inserted successfully!');
}

async function seedPricingConfig() {
  await db.collection('config').doc('pricing').set(pricingConfig);
  console.log('✅ Pricing config inserted successfully!');
}

async function runSeed() {
  await seedDrivers();
  await seedPricingConfig();
}

runSeed().catch((err) => {
  console.error('❌ Failed to seed data:', err);
});
