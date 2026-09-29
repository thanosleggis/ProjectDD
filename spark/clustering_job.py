import traceback
from pathlib import Path
import mysql.connector
from pyspark.sql import SparkSession
from pyspark.sql.functions import concat_ws, lower, col, coalesce, lit, regexp_replace, trim
from pyspark.ml.feature import Tokenizer, StopWordsRemover, CountVectorizer, IDF
from pyspark.ml.clustering import KMeans

print("[Clustering] Starting CourseClusteringJob...")

jar_path = Path(r"C:/Users/Laptop/Desktop/mysql-connector-j-9.5.0.jar")
if not jar_path.exists():
    raise FileNotFoundError(f"MySQL connector JAR not found at {jar_path}")

spark = (
    SparkSession.builder
    .appName("CourseClusteringJob")
    .config("spark.jars", str(jar_path))
    .config("spark.python.worker.faulthandler.enabled", "true")
    .getOrCreate()
)
print("[Clustering] Spark session initialized.")

# 2. Σύνδεση με τη MySQL
jdbc_url = "jdbc:mysql://localhost:3306/CourseAggregatorDB"
db_props = {"user": "root", "password": "123456", "driver": "com.mysql.cj.jdbc.Driver"}


def write_cluster_terms(rows):
    conn = mysql.connector.connect(
        host="localhost",
        user="root",
        password="123456",
        database="CourseAggregatorDB",
    )
    cursor = conn.cursor()
    try:
        cursor.execute("TRUNCATE TABLE course_cluster_terms")
        cursor.executemany(
            "INSERT INTO course_cluster_terms (cluster_id, top_terms) VALUES (%s, %s)",
            rows,
        )
        conn.commit()
        print(f"[Clustering] Stored {len(rows)} cluster keyword rows via mysql.connector.")
    finally:
        cursor.close()
        conn.close()

try:
    print("[Clustering] Loading courses from MySQL ...")
    df = spark.read.jdbc(url=jdbc_url, table="courses", properties=db_props)
    course_count = df.count()
    print(f"[Clustering] Loaded {course_count} courses.")
    if course_count == 0:
        print("[Clustering] No courses found. Exiting without clustering.")
    else:
        print("[Clustering] Building text pipeline ...")
        df_clean = df.withColumn(
            "text",
            trim(
                regexp_replace(
                    lower(
                        concat_ws(
                            " ",
                            col("title"),
                            col("short_description"),
                            coalesce(col("full_description"), lit(""))
                        )
                    ),
                    "[^\\p{L}\\s]",
                    " "
                )
            ),
        )
        tokenizer = Tokenizer(inputCol="text", outputCol="words")
        words_df = tokenizer.transform(df_clean)

        base_en = StopWordsRemover.loadDefaultStopWords("english")
        base_es = StopWordsRemover.loadDefaultStopWords("spanish")
        base_stopwords = list(set(base_en + base_es))
        custom_stopwords = [
            "course",
            "courses",
            "description",
            "available",
            "using",
            "skills",
            "skill",
            "create",
            "understanding",
            "learn",
            "learning",
            "students",
            "student",
            "online",
            "lecture",
            "lectures",
        ]
        remover = StopWordsRemover(
            inputCol="words",
            outputCol="filtered",
            stopWords=base_stopwords + custom_stopwords,
        )
        filtered_df = remover.transform(words_df)

        # Use the stopword-filtered tokens directly for vectorization.
        vectorizer = CountVectorizer(inputCol="filtered", outputCol="tf_features", vocabSize=5000, minDF=2)
        cv_model = vectorizer.fit(filtered_df)
        tf_df = cv_model.transform(filtered_df)
        print("[Clustering] TF features ready. Applying IDF ...")

        idf = IDF(inputCol="tf_features", outputCol="features")
        idf_model = idf.fit(tf_df)
        rescaled_df = idf_model.transform(tf_df)

        print("[Clustering] Training KMeans model (k=10)...")
        kmeans = KMeans(k=10, seed=1)
        model = kmeans.fit(rescaled_df.select("features"))

        predictions = model.transform(rescaled_df)

        print("[Clustering] Writing assignments to course_clusters ...")
        result_df = predictions.select(col("id"), col("prediction").alias("cluster_id"))
        result_df.write.jdbc(url=jdbc_url, table="course_clusters", mode="overwrite", properties=db_props)

        print("[Clustering] Extracting top terms per cluster ...")
        vocab = cv_model.vocabulary
        top_n = 10
        top_terms_rows = []
        for cluster_id, center in enumerate(model.clusterCenters()):
            sorted_indices = sorted(range(len(center)), key=lambda i: center[i], reverse=True)[:top_n]
            terms = [vocab[i] for i in sorted_indices]
            top_terms_rows.append((cluster_id, ", ".join(terms)))

        write_cluster_terms(top_terms_rows)
        print("[Clustering] Top terms saved to course_cluster_terms.")
        print("Clustering job finished successfully! Courses grouped into 10 categories and keywords stored in course_cluster_terms.")
except Exception as err:
    print(f"[Clustering] Job failed: {err}")
    traceback.print_exc()
    raise
finally:
    print("[Clustering] Stopping Spark session...")
    spark.stop()
    print("[Clustering] Spark session stopped.")