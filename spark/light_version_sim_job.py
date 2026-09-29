# optimized κωδικας για να εχουμε μια πιο ελαφριά εκδοδση του similarity job στο spark
# Για τον υπολογισμό της ομοιότητας χρησιμοποιήθηκε ο αλγόριθμος Cosine Similarity μέσω TF-IDF vectors
# Λόγω περιορισμών μνήμης στο τοπικό περιβάλλον ανάπτυξης, χρησιμοποιήθηκε μια βελτιστοποιημένη (optimized) 
# έκδοση του script για την παραγωγή των αποτελεσμάτων στη βάση δεδομένων

from pyspark.sql import SparkSession
from pyspark.sql.functions import concat_ws, lower, col, udf
from pyspark.sql.types import FloatType
from pyspark.ml.feature import Tokenizer, StopWordsRemover, HashingTF, IDF
from pyspark.ml.linalg import Vectors

# 1. Spark Session - Χρησιμοποιούμε το JAR που βρίσκεται στον ίδιο φάκελο
spark = SparkSession.builder \
    .appName("LightCourseSimilarityJob") \
    .config("spark.jars", "mysql-connector-j-9.5.0.jar") \
    .getOrCreate()

# 2. Σύνδεση με τη MySQL
jdbc_url = "jdbc:mysql://localhost:3306/CourseAggregatorDB"
db_props = {
    "user": "root", 
    "password": "123456", 
    "driver": "com.mysql.cj.jdbc.Driver"
}

# Ανάγνωση δεδομένων από τον πίνακα courses
courses_df = spark.read.jdbc(url=jdbc_url, table="courses", properties=db_props)

# 3. Προετοιμασία Κειμένου (Cleaning)
courses_df = courses_df.withColumn("text", lower(concat_ws(" ", col("title"), col("short_description"))))

# 4. TF-IDF Pipeline (Μετατροπή κειμένου σε αριθμητικά διανύσματα)
tokenizer = Tokenizer(inputCol="text", outputCol="words")
words_df = tokenizer.transform(courses_df)

remover = StopWordsRemover(inputCol="words", outputCol="filtered_words")
filtered_df = remover.transform(words_df)

hashing_tf = HashingTF(inputCol="filtered_words", outputCol="features", numFeatures=500)
tf_df = hashing_tf.transform(filtered_df)

idf = IDF(inputCol="features", outputCol="tfidf_features")
idf_model = idf.fit(tf_df)
features_df = idf_model.transform(tf_df).select("id", "tfidf_features")

# 5. Optimized Similarity (Περιορισμός στα πρώτα 100 μαθήματα για αποφυγή Timeout)
# Εδώ είναι το "κλειδί" για να μην κολλήσει ο υπολογιστής
small_df = features_df.limit(100)

def calculate_cosine_sim(v1, v2):
    if v1 is None or v2 is None: return 0.0
    dot_product = float(v1.dot(v2))
    norm_product = float(v1.norm(2) * v2.norm(2))
    return dot_product / norm_product if norm_product != 0 else 0.0

# Ορισμός του UDF με τις απαραίτητες βιβλιοθήκες που έλειπαν πριν
cosine_sim_udf = udf(calculate_cosine_sim, FloatType())

# Υπολογισμός ομοιότητας μόνο για το δείγμα
df_sim = small_df.alias("a").crossJoin(small_df.alias("b")) \
    .filter("a.id < b.id") \
    .withColumn("score", cosine_sim_udf(col("a.tfidf_features"), col("b.tfidf_features"))) \
    .filter("score > 0.1") \
    .select(
        col("a.id").alias("source_course_id"),
        col("b.id").alias("target_course_id"),
        col("score")
    )

# 6. Εγγραφή στη MySQL (Overwrite για να καθαρίσει τα παλιά λάθη)
df_sim.write.jdbc(url=jdbc_url, table="course_similarities", mode="overwrite", properties=db_props)

print("Light Similarity job finished successfully! Real scores stored in DB.")
spark.stop()