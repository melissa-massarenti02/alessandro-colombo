const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const cors = require('cors'); // AGGIUNTO: Necessario per GitHub Pages
const nodemailer = require('nodemailer');
const app = express();
// --- CONFIGURAZIONE EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'alessandrocolombo.rally@gmail.com',
        pass: 'whuphqayaajdvoos' // <--- METTI QUI LA PASSWORD APP DI 16 LETTERE
    }
});

// --- CONFIGURAZIONE FIREBASE (DINAMICA PER RENDER/LOCALE) ---
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Se siamo su Render, leggiamo dalla variabile d'ambiente
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("✅ Firebase: Inizializzato tramite Variabile d'Ambiente");
    } catch (err) {
        console.error("❌ Errore nel parsing della variabile FIREBASE_SERVICE_ACCOUNT:", err);
        process.exit(1);
    }
} else {
    // Se siamo in locale, cerchiamo il file fisico
    const localKeyPath = path.join(__dirname, 'firebase-key.json');
    if (fs.existsSync(localKeyPath)) {
        serviceAccount = require(localKeyPath);
        console.log("✅ Firebase: Inizializzato tramite file locale");
    } else {
        console.error("❌ ERRORE: Chiave Firebase non trovata né in locale né in ambiente!");
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const ordersCollection = db.collection('orders');
const statsDoc = db.doc('settings/slot_stats');

// --- MIDDLEWARE ---
app.use(cors()); // AGGIUNTO: Permette chiamate da domini diversi (es. GitHub -> Render)
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CONFIGURAZIONE FILE UPLOADS ---
// Nota: Su Render i file in 'uploads' spariranno al riavvio, ma l'ordine su Firebase resterà.
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, 'ricevuta-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

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
        
        const { name, payment } = req.body;

        // NORMALIZZAZIONE QUANTITÀ
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
            return res.status(400).json({ success: false, message: "Quantità non valida." });
        }

        // SALVATAGGIO SU FIREBASE
        await ordersCollection.doc(orderId).set({
            orderId,
            cliente: name,
            metodo_pagamento: payment,
            ricevuta: req.file ? req.file.filename : "nessuna-ricevuta",
            prodotti: orderItems,
            pezzi_totali: totalPiecesInThisOrder,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Aggiorniamo il contatore globale
        await statsDoc.set({
            totalPieces: admin.firestore.FieldValue.increment(totalPiecesInThisOrder)
        }, { merge: true });

        // INVIO EMAIL DI BACKUP
        try {
            if (req.file) {
                const mailOptions = {
                    from: '"Sito Merch" <alessandrocolombo.rally@gmail.com>',
                    to: 'alessandrocolombo.rally@gmail.com',
                    subject: `🏎️ NUOVO ORDINE: ${name} (${orderId})`,
                    text: `Dettagli ordine:\n\nCliente: ${name}\nID Ordine: ${orderId}\nMetodo: ${payment}\nPezzi Totali: ${totalPiecesInThisOrder}\n\nLa ricevuta è in allegato.`,
                    attachments: [
                        {
                            filename: req.file.originalname,
                            path: req.file.path // Prende il file dalla cartella uploads/ di Render
                        }
                    ]
                };
                await transporter.sendMail(mailOptions);
                console.log("✅ Email inviata con successo!");
            }
        } catch (mailError) {
            // Logghiamo l'errore ma non blocchiamo la risposta al cliente
            console.error("❌ Errore invio email:", mailError);
        }

        const currentTotal = await getGlobalSlotStatus();
        
        res.json({ 
            success: true, 
            orderId: orderId,
            totalPieces: currentTotal
        });

    } catch (error) {
        console.error("❌ Errore server:", error);
        res.status(500).json({ success: false, message: "Errore interno del server" });
    }
});

// Porta dinamica per Render o 3000 per locale
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server Racing pronto sulla porta ${PORT}`);
});