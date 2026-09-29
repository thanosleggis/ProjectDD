import traceback
from pathlib import Path
from pyspark.sql import SparkSession
from pyspark.sql.functions import concat_ws, lower, col, lit, coalesce, expr
from pyspark.ml.feature import Tokenizer, StopWordsRemover, CountVectorizer, IDF
from pyspark.ml.functions import vector_to_array

print("[Similarity] Starting CourseSimilarityJob...")

jar_path = Path(r"C:/Users/Laptop/Desktop/mysql-connector-j-9.5.0.jar")
if not jar_path.exists():
    raise FileNotFoundError(f"MySQL connector JAR not found at {jar_path}")

spark = (
    SparkSession.builder
    .appName("CourseSimilarityJob")
    .config("spark.jars", str(jar_path))
    .config("spark.python.worker.faulthandler.enabled", "true")
    .getOrCreate()
)
print("[Similarity] Spark session initialized.")

jdbc_url = "jdbc:mysql://localhost:3306/CourseAggregatorDB"
db_props = {
    "user": "root",
    "password": "123456",
    "driver": "com.mysql.cj.jdbc.Driver",
}

try:
    print("[Similarity] Loading courses from MySQL ...")
    courses_df = spark.read.jdbc(url=jdbc_url, table="courses", properties=db_props)
    course_count = courses_df.count()
    print(f"[Similarity] Loaded {course_count} courses from DB.")
    max_courses = 500
    if course_count > max_courses:
        print(f"[Similarity] Limiting to first {max_courses} courses for similarity computation to avoid O(n^2) explosion.")
        courses_df = courses_df.orderBy("id").limit(max_courses)
        course_count = courses_df.count()
        print(f"[Similarity] Using {course_count} courses after limiting.")
    if course_count == 0:
        print("[Similarity] No courses found. Exiting without computing similarities.")
    else:
        print("[Similarity] Preparing text corpus ...")
        courses_df = courses_df.withColumn(
            "text",
            lower(
                concat_ws(
                    " ",
                    col("title"),
                    col("short_description"),
                    coalesce(col("full_description"), lit(""))
                )
            )
        )

        tokenizer = Tokenizer(inputCol="text", outputCol="words")
        words_df = tokenizer.transform(courses_df)

        remover = StopWordsRemover(inputCol="words", outputCol="filtered_words")
        filtered_df = remover.transform(words_df)

        print("[Similarity] Building TF features ...")
        vectorizer = CountVectorizer(inputCol="filtered_words", outputCol="raw_features", vocabSize=5000, minDF=2)
        cv_model = vectorizer.fit(filtered_df)
        tf_df = cv_model.transform(filtered_df)

        print("[Similarity] Applying IDF ...")
        idf = IDF(inputCol="raw_features", outputCol="features")
        idf_model = idf.fit(tf_df)
        features_df = idf_model.transform(tf_df).select("id", "features")

        # Convert feature vectors to arrays so we can stay on the JVM side
        # and avoid Python UDFs (which were causing worker crashes).
        features_df = features_df.withColumn("features_array", vector_to_array("features"))

        print("[Similarity] Calculating pairwise cosine scores (JVM side, no Python UDF) ...")
        print(f"[Similarity] This will compute similarities for {course_count} courses (~O(n^2) pairs).")

        df_sim = (
            features_df.alias("a").crossJoin(features_df.alias("b"))
            .filter(col("a.id") != col("b.id"))
            .withColumn(
                "dot",
                expr(
                    "aggregate(zip_with(a.features_array, b.features_array, (x, y) -> x * y), 0D, (acc, x) -> acc + x)"
                ),
            )
            .withColumn(
                "normA",
                expr(
                    "sqrt(aggregate(a.features_array, 0D, (acc, x) -> acc + x * x))"
                ),
            )
            .withColumn(
                "normB",
                expr(
                    "sqrt(aggregate(b.features_array, 0D, (acc, x) -> acc + x * x))"
                ),
            )
            .withColumn(
                "score",
                expr(
                    "CASE WHEN normA = 0 OR normB = 0 THEN 0D ELSE dot / (normA * normB) END"
                ),
            )
            .filter(col("score") > 0.1)
            .select(
                col("a.id").alias("source_course_id"),
                col("b.id").alias("target_course_id"),
                col("score"),
            )
        )

        print("[Similarity] Writing similarities to course_similarities (overwrite)...")
        df_sim.write.jdbc(
            url=jdbc_url,
            table="course_similarities",
            mode="overwrite",
            properties=db_props,
        )
        print("Similarity job finished successfully! Bi-directional scores calculated.")
except Exception as err:
    print(f"[Similarity] Job failed: {err}")
    traceback.print_exc()
    raise
finally:
    print("[Similarity] Stopping Spark session...")
    spark.stop()
    print("[Similarity] Spark session stopped.")