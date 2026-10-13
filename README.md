# ScanPro 📱📄
### Alternativa ta gratuită și privată la CamScanner Pro (PWA)

**ScanPro** este o aplicație web progresivă (PWA) modernă și ultra-rapidă, concepută pentru a înlocui complet abonamentul scump la CamScanner. O poți instala direct pe telefonul tău (Android sau iPhone), funcționează **100% offline**, stochează documentele exclusiv pe dispozitivul tău și nu are reclame sau costuri lunare.

---

## 🌟 Funcționalități Premium (Nivel Pro)

1. **Scanare Cameră & Încărcare Galerie:**
   - Detectare cameră spate la rezoluție maximă (până la 4K).
   - Comutare lanternă (Flash / Torch) pe dispozitivele compatibile.
   - Mod **Multiplu (Batch)**: Faci 5-10 poze consecutive fără să ieși din cameră.
   - Import direct din galeria foto (suportă selecție multiplă simultană).

2. **Corecție Perspectivă & Lupă Măritoare 2.5x (Stil CamScanner):**
   - 4 pini independenți pentru colțurile foii.
   - **Lupă interactivă (Magnifying Loupe):** Când tragi de un colț cu degetul, deasupra apare o lupă mărită la 2.5x cu reticul de precizie, astfel încât degetul să nu acopere colțul colii.
   - Auto-detecție inteligentă a marginilor și buton pentru selectare completă.
   - Rotire 90° în timp real.

3. **Filtre Document Avansate:**
   - ✨ **Magic Color:** Filtrul emblematic CamScanner – albește complet foaia de hârtie, intensifică textul negru și păstrează culorile vii (ștampile roșii, semnături cu pix albastru).
   - 📄 **Alb & Negru Clar (B&W):** Elimină complet umbrele mâinii sau ale biroului, transformând pagina într-un document tipărit impecabil.
   - 🩶 **Tonuri Gri (Grayscale):** Monocrom uniform și echilibrat.
   - ⚡ **Claritate Maximă (Sharp):** Accentuează scrisul de mână în creion sau chitanțele șterse.
   - 🖼️ **Original:** Poza nefiltrată.
   - Potențiometre glisante pentru reglaj fin: Luminozitate și Contrast.

4. **Organizare & Management Documente:**
   - Categorii dedicate: *Facturi & Bonuri*, *Contracte*, *Acte Identitate*, *Notițe*, *General*.
   - Reordonare pagini (stânga / dreapta).
   - Căutare rapidă după titlu.

5. **Extragere Text OCR (Offline & Gratuit):**
   - Recunoaștere optică a caracterelor (OCR) direct în browser folosind `tesseract.js`.
   - Suport nativ pentru limba Română și Engleză.
   - Copiere text în clipboard sau descărcare fișier `.txt`.

6. **Export & Partajare PDF:**
   - Formate: **A4 Standard**, **Original**, **Letter US**.
   - Niveluri de compresie: **Pro HD (300 DPI)**, **Optimizat (WhatsApp & Email)**, **Compact**.
   - Integrare nativă cu meniul telefonului: Trimite PDF-ul direct pe WhatsApp, Gmail, Telegram sau Google Drive cu un singur tap.

7. **Confidențialitate Totală & Zero Costuri:**
   - Baza de date locală **IndexedDB** (`Dexie`).
   - Niciun document nu este trimis pe vreun server extern. Datele tale confidențiale rămân doar pe telefonul tău.

---

## 📲 Cum instalezi ScanPro pe telefon

### Pe Android (Google Chrome / Samsung Internet / Edge):
1. Deschide link-ul aplicației în Google Chrome.
2. Apasă pe bannerul din aplicație: **„Instalează ScanPro”** sau apasă pe meniul cu 3 puncte (dreapta sus) -> **„Instalează aplicația”** (sau **„Adaugă la ecranul de pornire”**).
3. Aplicația va apărea ca o aplicație nativă pe ecranul telefonului tău, cu propria pictogramă și ecran complet!

### Pe iPhone (iOS Safari):
1. Deschide link-ul în Safari.
2. Apasă pe butonul de **Partajare (Share)** din bara de jos (pătratul cu săgeată în sus).
3. Derulează în jos și selectează **„Adaugă pe ecranul principal” (Add to Home Screen)**.
4. Apasă **„Adaugă”**. Aplicația va rula în mod nativ fără bara de navigare a browserului.

---

## 🛠️ Rulare Locală & Dezvoltare

```bash
# Instalare dependințe
npm install

# Pornire server de dezvoltare
npm run dev

# Compilare pentru producție
npm run build
```

---

## 🚀 Tehnologii Folosite

- **Framework:** React 19 + TypeScript + Vite 8
- **Stilizare:** Tailwind CSS v4 + Lucide Icons
- **Bază de date locală:** Dexie.js (IndexedDB)
- **Generare PDF:** jsPDF
- **Motor OCR:** Tesseract.js
- **PWA & Offline:** Vite Plugin PWA + Workbox Service Worker
