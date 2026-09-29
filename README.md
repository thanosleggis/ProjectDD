# Σύστημα Συγκέντρωσης Μαθημάτων (Course Aggregator)

## Περιγραφή

Αυτό το έργο είναι ένα πλήρες σύστημα συγκέντρωσης online μαθημάτων από διάφορες πηγές (Coursera, edX κ.λπ.) με:
- Back‑end σε Node.js / Express (REST API)
- Front‑end σε React (Vite)
- Επεξεργασία δεδομένων & ML jobs σε Apache Spark (PySpark)
- Αποθήκευση σε MySQL (CourseAggregatorDB)

Ο χρήστης μπορεί να:
- Αναζητά μαθήματα με λέξη‑κλειδί
- Φιλτράρει ανά γλώσσα, επίπεδο, πηγή και ετικέτες (tags από clustering)
- Βλέπει λεπτομέρειες μαθήματος και παρόμοια μαθήματα (similarities)

---

## Δομή Εργασίας

- [client](client) – Front‑end (React + Vite)
- [server](server) – Back‑end (Express API)
- [spark](spark) – Spark jobs (clustering & similarity)
- [db_code.txt](db_code.txt) – Σχήμα βάσης MySQL & βοηθητικά SQL
- [harvester_new.py](harvester_new.py) – Συλλογή/ενημέρωση μαθημάτων από πηγές

### Back‑end (server)

Κύριο αρχείο: [server/server.js](server/server.js)

Παρέχει endpoints όπως:
- `GET /api/courses` – λίστα μαθημάτων με pagination & φίλτρα
- `GET /api/courses/:id` – λεπτομέρειες μαθήματος
- `GET /api/courses/:id/similar` – παρόμοια μαθήματα
- `GET /api/filters` – επιλογές φίλτρων (γλώσσες, επίπεδα, πηγές, tags)
- `POST /api/sync` – τρέχει harvester + Spark similarity job

Χρησιμοποιεί MySQL (mysql2 pool) και τη βάση `CourseAggregatorDB`.

### Front‑end (client)

Σημαντικά αρχεία:
- [client/src/App.jsx](client/src/App.jsx)
- [client/src/components/CourseList.jsx](client/src/components/CourseList.jsx)
- [client/src/components/CourseDetails.jsx](client/src/components/CourseDetails.jsx)
- [client/src/components/Filter.jsx](client/src/components/Filter.jsx)

Λειτουργίες UI:
- Λίστα μαθημάτων με pagination
- Εμφάνιση ετικετών (cluster tags) ανά μάθημα
- Φίλτρα (Γλώσσα, Επίπεδο, Πηγή, Tag)
- Popup λεπτομερειών και «Παρόμοια μαθήματα»

Το Vite proxy στέλνει όλα τα `/api` αιτήματα στο back‑end στο port 8080.

### Spark Jobs (clustering & similarity)

Βρίσκονται στον φάκελο [spark](spark):

- [spark/clustering_job.py](spark/clustering_job.py)
  - Διαβάζει μαθήματα από MySQL (πίνακας `courses`).
  - Καθαρίζει κείμενο (lowercase, αφαίρεση σημείων στίξης & αριθμών, stopwords EN/ES + custom).
  - Χτίζει TF‑IDF χαρακτηριστικά και εφαρμόζει KMeans (k=10).
  - Γράφει:
    - `course_clusters` (id → cluster_id)
    - `course_cluster_terms` (cluster_id → top_terms) για τα tags.

- [spark/similarity_job.py](spark/similarity_job.py)
  - Υπολογίζει ομοιότητες μεταξύ μαθημάτων με TF‑IDF & cosine similarity.
  - Γράφει αποτελέσματα στον πίνακα `course_similarities`.

Και τα δύο jobs χρησιμοποιούν MySQL JDBC driver (`mysql-connector-j-9.5.0.jar`).

---

## Βάση Δεδομένων (MySQL)

Το πλήρες σχήμα βρίσκεται στο [db_code.txt](db_code.txt).

Βασικοί πίνακες:
- `sources`, `languages`, `levels`, `categories`
- `courses` – κύριος πίνακας μαθημάτων
- `course_similarities` – ακμές ομοιότητας
- `course_clusters` – αντιστοίχιση μαθήματος σε cluster
- `course_cluster_terms` – ετικέτες (top terms) ανά cluster

Για καθαρή δημιουργία DB:
1. Συνδεθείτε στη MySQL.
2. Εκτελέστε το περιεχόμενο του [db_code.txt](db_code.txt).

> Σημείωση: Πίνακες `course_categories`, `keywords`, `course_keywords` έχουν καταργηθεί από την εφαρμογή και δεν χρειάζονται.

---

## Απαιτήσεις

- Node.js (14+)
- npm
- Python 3.10+ με PySpark
- Java (για Spark)
- MySQL 8+
- MySQL JDBC driver `mysql-connector-j-9.5.0.jar` στο `C:/Users/Laptop/Desktop/mysql-connector-j-9.5.0.jar`

---

## Εγκατάσταση & Εκτέλεση

### 1. Ρύθμιση βάσης δεδομένων

1. Δημιουργήστε/καθαρίστε τη βάση τρέχοντας το [db_code.txt](db_code.txt) στη MySQL.
2. Βεβαιωθείτε ότι ο χρήστης/σύνδεση (π.χ. `root` / `123456`) ταιριάζει με τις ρυθμίσεις σε [server/server.js](server/server.js).

### 2. Back‑end (server)

```bash
cd server
npm install
npm run start   # ή npm run dev αν έχετε nodemon
```

Ο server ακούει στο `http://localhost:8080`.

### 3. Front‑end (client)

```bash
cd client
npm install
npm run dev
```

Ανοίξτε την διεύθυνση που σας δίνει η Vite (συνήθως `http://localhost:5173`).

### 4. Spark Jobs

Από τον ρίζα φάκελο του project:

```bash
python spark/clustering_job.py
python spark/similarity_job.py
```

Εναλλακτικά, το `POST /api/sync` τρέχει harvester + similarity job μετά τη συγκομιδή δεδομένων.

---

## Συχνά Προβλήματα

- **Σφάλμα JDBC / MySQL driver**: Ελέγξτε ότι το αρχείο `mysql-connector-j-9.5.0.jar` υπάρχει στη διαδρομή που χρησιμοποιείται στα Spark jobs.
- **Κενά tags ή dropdown Tags**: Βεβαιωθείτε ότι έχετε τρέξει επιτυχώς το [spark/clustering_job.py](spark/clustering_job.py) ώστε να γεμίσουν οι πίνακες `course_clusters` και `course_cluster_terms`.
- **Σφάλματα σύνδεσης MySQL**: Ελέγξτε host, user, password, port και ότι η βάση `CourseAggregatorDB` υπάρχει.

---

## Πώς να επεκτείνετε

- Προσθήκη νέας πηγής μαθημάτων: επεκτείνετε τον harvester ([harvester_new.py](harvester_new.py)) και προσθέστε εγγραφή στον πίνακα `sources`.
- Αλλαγή αριθμού clusters (k): τροποποιήστε την παράμετρο `KMeans(k=10, ...)` στο [spark/clustering_job.py](spark/clustering_job.py).
- Προσαρμογή tags: αλλάξτε τα custom stopwords ή το threshold στο clustering job και ξανατρέξτε το.

Για οποιαδήποτε απορία ή αλλαγή στη λειτουργία, δουλέψτε κυρίως στα αρχεία:
- Back‑end: [server/server.js](server/server.js)
- Front‑end: [client/src](client/src)
- Spark: [spark/clustering_job.py](spark/clustering_job.py), [spark/similarity_job.py](spark/similarity_job.py)
