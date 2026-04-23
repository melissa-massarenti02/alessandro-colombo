/**
 * Gestione dinamica dei prodotti e invio ordine
 */

// 1. Aggiorna il nome del file visibile quando si carica la ricevuta
function updateFileName(input) {
    const fileName = input && input.files && input.files[0] ? input.files[0].name : "";
    const statusLabel = document.getElementById('file-name');
    const dropZone = document.getElementById('drop-zone');

    if (statusLabel) {
        statusLabel.textContent = fileName ? "✓ Selezionato: " + fileName : "";
    }
    if (dropZone) {
        dropZone.style.border = fileName ? "2px dashed #eeff00" : "2px dashed #333";
    }
}

// 2. Funzione per aggiornare visivamente il counter e la barra senza ricaricare
async function refreshSlotStatus() {
    try {
        const response = await fetch('/api/slot-status');
        const data = await response.json();
        
        const countElement = document.getElementById('slot-count');
        const progressBar = document.getElementById('progress-bar');
        
        if (countElement && progressBar) {
            const total = data.total || 0;
            const percentage = Math.min((total / 10) * 100, 100);

            countElement.textContent = total;
            progressBar.style.width = percentage + "%";
            console.log(`Slot aggiornato: ${total}/10`);
        }
    } catch (err) {
        console.error("Errore aggiornamento slot:", err);
    }
}

// Esegui l'aggiornamento al caricamento della pagina
window.addEventListener('DOMContentLoaded', refreshSlotStatus);

// 3. Aggiunta dinamica di nuove righe prodotto
const addProductBtn = document.getElementById('add-product');
if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
        const productList = document.getElementById('product-list');
        const items = document.querySelectorAll('.product-item');
        const newItem = items[0].cloneNode(true); // Cloniamo sempre il primo (pulito)
        
        // Reset dei valori
        newItem.querySelector('input[type="number"]').value = 1;
        newItem.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
        
        // Aggiungi tasto rimuovi se non presente
        if (!newItem.querySelector('.remove-item')) {
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = "RIMUOVI";
            removeBtn.type = "button";
            removeBtn.className = "remove-item text-[8px] text-red-500 font-bold absolute top-2 right-2 hover:text-white transition-colors";
            removeBtn.onclick = function() { newItem.remove(); };
            newItem.appendChild(removeBtn);
        }
        productList.appendChild(newItem);
    });
}

// 4. Invio del Form con validazione e aggiornamento dinamico
document.getElementById('orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('receipt');
    const dropZone = document.getElementById('drop-zone');
    const submitBtn = e.target.querySelector('.btn-submit');
    const originalText = submitBtn.innerHTML;

    // --- CONTROLLO VITALE: RICEVUTA OBBLIGATORIA ---
    if (!fileInput.files || fileInput.files.length === 0) {
        alert("⚠️ CAMPO OBBLIGATORIO: Ricevuta di Pagamento\n\nNon è possibile procedere senza allegare lo screenshot del pagamento.");
        dropZone.style.border = "2px dashed #ff0033"; 
        dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return; 
    }

    // Feedback visivo invio
    submitBtn.innerHTML = "ELABORAZIONE SLOT...";
    submitBtn.disabled = true;

    const formData = new FormData(e.target);

    try {
        const response = await fetch('/api/preordine', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ ORDINE CONFERMATO!\nID: ${result.orderId}\nTotale slot attuale: ${result.totalPieces}/10`);
            
            // --- RESET DINAMICO SENZA RELOAD ---
            e.target.reset(); // Svuota i testi
            updateFileName(null); // Reset grafica upload
            
            // Rimuovi righe prodotto extra se presenti
            const items = document.querySelectorAll('.product-item');
            for(let i = 1; i < items.length; i++) {
                items[i].remove();
            }

            // Aggiorna il counter e la barra subito
            await refreshSlotStatus(); 
            
        } else {
            alert("❌ Errore: " + result.message);
        }
    } catch (error) {
        console.error(error);
        alert("📡 Errore di connessione al server.");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});