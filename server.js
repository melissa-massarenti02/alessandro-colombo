const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const app = express();

// --- CONFIGURAZIONE FIREBASE ---
// Usiamo path.join per essere sicuri di trovare il file nella cartella corretta
const serviceAccountPath = path.join(__dirname, 'firebase-key.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ ERRORE: Il file firebase-key.json non è stato trovato nella cartella!");
    process.exit(1); // Ferma il server se manca la chiave
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const ordersCollection = db.collection('orders');
const statsDoc = db.doc('settings/slot_stats');

// --- CONFIGURAZIONE FILE UPLOADS ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, 'ricevuta-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Funzione di calcolo slot su Firebase
async function getGlobalSlotStatus() {
    try {
        const doc = await statsDoc.get();
        if (doc.exists) {
            return doc.data().totalPieces || 0;
        }
        return 0;
    } catch (err) {
        console.error("Errore recupero stats Firebase:", err);
        return 0;
    }
}

// Rotta Status
app.get('/api/slot-status', async (req, res) => {
    const total = await getGlobalSlotStatus();
    res.json({ total });
});

app.post('/api/preordine', upload.single('receipt'), async (req, res) => {
    try {
        console.log("--- NUOVO ORDINE (FIREBASE MODE) ---");
        console.log("Dati ricevuti:", req.body);

        const { name, payment } = req.body;

        // NORMALIZZAZIONE: Gestisce sia array che valori singoli (risolve bug quantità)
        const sizes = req.body['size[]'] || req.body.size;
        const colors = req.body['color[]'] || req.body.color;
        const qtys = req.body['qty[]'] || req.body.qty;

        const sArray = Array.isArray(sizes) ? sizes : (sizes ? [sizes] : []);
        const cArray = Array.isArray(colors) ? colors : (colors ? [colors] : []);
        const qArray = Array.isArray(qtys) ? qtys : (qtys ? [qtys] : []);

        const orderId = 'SN-' + Math.floor(100000 + Math.random() * 900000);
        const orderItems = [];
        let totalPiecesInThisOrder = 0;

        sArray.forEach((size, i) => {
            const q = parseInt(qArray[i]) || 0;
            if (q > 0) {
                totalPiecesInThisOrder += q;
                orderItems.push({
                    productId: `${orderId}-${i}`,
                    taglia: size,
                    colore: cArray[i] || 'Standard',
                    quantita: q
                });
            }
        });

        if (totalPiecesInThisOrder === 0) {
            console.log("⚠️ Blocca: Nessuna quantità valida trovata.");
            return res.status(400).json({ success: false, message: "Quantità non valida." });
        }

        // SALVATAGGIO SU FIREBASE
        // 1. Salviamo l'ordine nella collezione 'orders'
        await ordersCollection.doc(orderId).set({
            orderId,
            cliente: name,
            metodo_pagamento: payment,
            ricevuta: req.file ? req.file.filename : null,
            prodotti: orderItems,
            pezzi_totali: totalPiecesInThisOrder,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Aggiorniamo il contatore globale (Atomico)
        await statsDoc.set({
            totalPieces: admin.firestore.FieldValue.increment(totalPiecesInThisOrder)
        }, { merge: true });

        const currentTotal = await getGlobalSlotStatus();
        console.log(`✅ Registrato! Totale slot: ${currentTotal}/10`);

        res.json({ 
            success: true, 
            orderId: orderId,
            totalPieces: currentTotal,
            message: "Ordine salvato su Firebase!" 
        });

    } catch (error) {
        console.error("❌ Errore critico server (Firebase):", error);
        res.status(500).json({ success: false, message: "Errore interno del server" });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server Racing pronto su http://localhost:${PORT}`);
});