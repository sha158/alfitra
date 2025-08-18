// src/config/firebaseAdmin.js
const admin = require('firebase-admin');

const initializeFirebaseAdmin = () => {
  try {
<<<<<<< HEAD
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Parse from environment variable (JSON string)
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log("Using Firebase service account from environment variable");
    } else {
      // Fallback: use local file
      serviceAccount = require('./serviceAccountKey.json');
      console.log("Using Firebase service account from local file");
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    console.log('✅ Firebase Admin SDK initialized successfully');
=======
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully');
>>>>>>> 5ec1f4e (initial changes)
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
};

module.exports = { initializeFirebaseAdmin, admin };
